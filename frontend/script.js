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
  immersiveBacktrackOpen: false,
  backtrackSinkPreviewId: "",
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
  novaReplyContext: null,
  novaAskPending: false,
  novaAskError: null,
  novaLastRequest: null,
  novaAgentRuns: [],
  novaPreReadHistory: [],
  agentSkills: [],
  novaPaneCollapsed: false,
  novaPaneWidth: "medium",
  novaAutoReadEnabled: true,
  novaAutoReadSeen: new Set(),
  novaAutoReadInFlight: new Set(),
  novaAutoReadTimer: 0,
  novaAutoBookScoutTimer: 0,
  readerFlow: { bookId: "", anchorChunkId: "", chunks: [] },
  readerFlowRequestId: 0,
  readerActiveChunkId: "",
  readerTocOpen: false,
  immersiveNovaCardOpen: false,
  readerSelection: { text: "", offset: null, rect: null },
  selectionCaptureTimer: 0,
  quickNoteLastQuote: null,
  quickNoteSinkPreviewId: "",
  entityPeek: null,
  selfCheck: { variant: 0, hintVisible: false },
  readingFocus: false,
  readerFootprintsOpen: false,
  readerNovaAsideOpen: false,
  readingVisit: { bookId: "", startedAt: 0, completedChunks: 0, targetChunks: 3 },
  lastCompletedChunk: null,
  restartUndo: null,
  restartUndoTimer: null,
  planNextCache: {},
  readerPlanStripCollapsed: false,
  backgroundRunners: [],
  snapshotLoadId: 0,
  readerMode: "scroll",
  immersiveReading: false,
  readerSettings: { fontScale: 1, measure: "medium", theme: "light" },
  readerFind: { query: "", matches: [], activeIndex: -1 },
  immersiveLocalLibrary: { root: "", books: [], loaded: false, loading: false, importingPath: "" },
};

const $ = (id) => document.getElementById(id);
const SINK_SETTINGS_KEY = "vcp-coreading-sidecar.sinkSettings";
const CARD_SAVE_RESULTS_KEY = "vcp-coreading-sidecar.cardSaveResults";
const CARD_PREVIEW_RESULTS_KEY = "vcp-coreading-sidecar.cardPreviewResults";
const READING_SESSION_KEY = "vcp-coreading-sidecar.readingSession";
const READING_BOOK_SESSIONS_KEY = "vcp-coreading-sidecar.readingBookSessions";
const READING_BOOKMARKS_KEY = "vcp-coreading-sidecar.readingBookmarks";
const SELF_CHECK_DRAFTS_KEY = "vcp-coreading-sidecar.selfCheckDrafts";
const LIBRARY_SHOW_TEST_BOOKS_KEY = "vcp-coreading-sidecar.showTestBooks";
const READER_MODE_KEY = "vcp-coreading-sidecar.readerMode";
const READER_SETTINGS_KEY = "vcp-coreading-sidecar.readerSettings";
const READING_VISIT_KEY = "vcp-coreading-sidecar.readingVisit";
const READING_VISIT_HISTORY_KEY = "vcp-coreading-sidecar.readingVisitHistory";
const NOVA_AUTO_READ_KEY = "vcp-coreading-sidecar.novaAutoRead";
const READER_PLAN_STRIP_COLLAPSED_KEY = "vcp-coreading-sidecar.readerPlanStripCollapsed";
const NOVA_PANE_WIDTH_KEY = "vcp-coreading-sidecar.novaPaneWidth";
const NOVA_REQUEST_TIMEOUT_MS = 360000;
const READER_FLOW_BATCH_SIZE = 24;
const TEST_BOOK_RE = /(^codex-|codex\s|smoke|验证|return-shape|sidecar-chunk)/i;

setupAppLayout();
setupReaderModeControls();
loadReaderMode();
loadReaderSettings();
loadReadingVisit();
loadReaderPlanStripState();
loadNovaAutoReadSetting();
loadNovaPaneLayout();
document.addEventListener("fullscreenchange", renderReaderFullscreenButtons);

function setupAppLayout() {
  const workspace = $("mainContent");
  const planPanel = document.querySelector(".plan-panel");
  if (!workspace || !planPanel || workspace.dataset.layout === "reader-assistant") return;

  const readerPane = document.createElement("section");
  readerPane.className = "reader-pane";
  readerPane.setAttribute("aria-label", "阅读区域");

  const assistantPane = document.createElement("aside");
  assistantPane.className = "assistant-pane";
  assistantPane.setAttribute("aria-label", "Nova 与共读工具");
  const assistantResize = document.createElement("button");
  assistantResize.id = "novaPaneResizeHandle";
  assistantResize.className = "nova-pane-resize-handle";
  assistantResize.type = "button";
  assistantResize.setAttribute("aria-label", "拖动调整 Nova 侧栏宽度");
  assistantResize.tabIndex = -1;
  assistantPane.appendChild(assistantResize);

  workspace.prepend(readerPane);
  workspace.appendChild(assistantPane);
  readerPane.appendChild(planPanel);

  const novaPane = createAssistantPanel("nova-pane");
  moveExisting(novaPane, [
    "#selectionDock",
    "#entityPeek",
    ".nova-reading-box",
  ]);
  assistantPane.appendChild(novaPane);
  setupNovaPaneResizer(assistantResize);

  const skillsPane = createSkillPagePanel();
  const skillsBody = skillsPane.querySelector(".skill-page-body");

  const overview = document.createElement("section");
  overview.className = "skill-overview";
  overview.innerHTML = [
    '<div class="skill-overview-head"><strong>Nova 共读技能</strong><small>自主预读、评注、回溯、沉淀都从这里进入。</small></div>',
    '<div id="skillOverviewList" class="skill-overview-list empty">正在读取技能目录。</div>'
  ].join("");
  skillsBody.appendChild(overview);

  const libraryGroup = createSkillGroup("书库", "导入与切换书籍", true);
  moveExisting(libraryGroup.body, [".library-panel"]);
  skillsBody.appendChild(libraryGroup.group);

  const notesPane = createAssistantPanel("notes-pane");
  moveExisting(notesPane, [
    panelHeadSelector("边注"),
    "#annotationForm",
    "#annotationList",
    panelHeadSelector("我的笔记"),
    "#userNoteForm",
    ".note-actions",
    "#userNoteList",
    "#submissionList",
  ]);
  const notesGroup = createSkillGroup("边注与笔记", "私有笔记、边注和提交批次", false);
  notesGroup.body.appendChild(notesPane);
  skillsBody.appendChild(notesGroup.group);

  const toolsPane = createAssistantPanel("reading-tools-pane");
  moveExisting(toolsPane, [
    ".reading-session",
    ".reading-queue",
    ".plan-guide",
    ".reading-map",
    ".reading-waypoints",
    "#selfCheckCard",
    "#chunkReviewCard",
    ".trail-guide",
    ".reader-search-tools",
    ".backtrack-controls",
    "#searchResults",
    "#backtrackEvidence",
    ".plan-panel > details.tool-drawer",
  ]);
  const toolsGroup = createSkillGroup("计划与回溯", "计划、评价、线索和段落回看", false);
  toolsGroup.body.appendChild(toolsPane);
  skillsBody.appendChild(toolsGroup.group);

  const sinkGroup = createSkillGroup("沉淀", "预览、批准和执行写入", false);
  moveExisting(sinkGroup.body, [".sink-panel"]);
  skillsBody.appendChild(sinkGroup.group);

  const commandGroup = createSkillGroup("回执", "调试日志与后台回执", false);
  moveExisting(commandGroup.body, [".command-panel"]);
  skillsBody.appendChild(commandGroup.group);

  document.body.appendChild(skillsPane);
  const skillsToggle = document.createElement("button");
  skillsToggle.id = "skillsPageToggleBtn";
  skillsToggle.className = "secondary compact";
  skillsToggle.type = "button";
  skillsToggle.textContent = "技能";
  skillsToggle.setAttribute("aria-expanded", "false");
  skillsToggle.addEventListener("click", () => {
    const nextOpen = skillsPane.hidden;
    skillsPane.hidden = !nextOpen;
    document.body.classList.toggle("skills-pane-open", nextOpen);
    skillsToggle.setAttribute("aria-expanded", String(nextOpen));
    if (nextOpen) skillsPane.querySelector("summary, button, input, textarea, select")?.focus();
  });
  skillsPane.querySelector("#skillsPageCloseBtn")?.addEventListener("click", () => {
    skillsPane.hidden = true;
    document.body.classList.remove("skills-pane-open");
    skillsToggle.setAttribute("aria-expanded", "false");
    skillsToggle.focus();
  });
  skillsPane.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-skill-action]");
    if (!button) return;
    const action = button.dataset.skillAction || "";
    button.disabled = true;
    void useAgentSkill(action).catch((error) => {
      log(error.message || String(error));
    }).finally(() => {
      button.disabled = false;
    });
  });
  document.querySelector(".top-actions")?.insertBefore(skillsToggle, $("refreshBtn") || null);
  workspace.dataset.layout = "reader-assistant";
}

function createAssistantPanel(className) {
  const panel = document.createElement("section");
  panel.className = `panel assistant-panel ${className}`;
  return panel;
}

function createSkillPagePanel() {
  const panel = document.createElement("aside");
  panel.className = "panel skills-pane";
  panel.hidden = true;
  panel.setAttribute("aria-label", "技能页");
  panel.innerHTML = [
    '<header class="skill-page-header"><div><strong>技能页</strong><small>书库、笔记、计划、沉淀与调试</small></div><button id="skillsPageCloseBtn" class="secondary compact" type="button">收起</button></header>',
    '<div class="skill-page-body"></div>'
  ].join("");
  return panel;
}

function createSkillGroup(title, subtitle = "", open = false) {
  const group = document.createElement("details");
  group.className = "skill-group";
  if (open) group.open = true;
  group.innerHTML = [
    `<summary><span>${escapeHtml(title)}</span><small>${escapeHtml(subtitle)}</small></summary>`,
    '<div class="skill-group-body"></div>'
  ].join("");
  return { group, body: group.querySelector(".skill-group-body") };
}

function moveExisting(target, selectors) {
  for (const selector of selectors) {
    const node = typeof selector === "string" ? document.querySelector(selector) : selector;
    if (node) target.appendChild(node);
  }
}

function panelHeadSelector(title) {
  return [...document.querySelectorAll(".panel-head")]
    .find((head) => head.querySelector("h2")?.textContent.trim() === title);
}

function setupReaderModeControls() {
  const actions = document.querySelector(".reader-header-actions");
  const shell = document.querySelector(".reader-text-shell");
  if (!actions || !shell || document.querySelector(".reader-mode-toggle")) return;

  const toggle = document.createElement("div");
  toggle.className = "reader-mode-toggle";
  toggle.setAttribute("aria-label", "阅读方式");
  toggle.innerHTML = [
    '<button class="compact" type="button" data-reader-mode="scroll" aria-pressed="true">滚动</button>',
    '<button class="compact" type="button" data-reader-mode="paged" aria-pressed="false">翻页</button>',
  ].join("");
  actions.prepend(toggle);
  toggle.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-reader-mode]");
    if (!button) return;
    setReaderMode(button.dataset.readerMode || "scroll");
  });

  const immersiveButton = document.createElement("button");
  immersiveButton.id = "immersiveReadingBtn";
  immersiveButton.className = "secondary compact";
  immersiveButton.type = "button";
  immersiveButton.textContent = "沉浸";
  immersiveButton.setAttribute("aria-pressed", "false");
  toggle.insertAdjacentElement("afterend", immersiveButton);
  immersiveButton.addEventListener("click", () => {
    void setImmersiveReading(!state.immersiveReading);
  });

  const pager = document.createElement("div");
  pager.className = "reader-pager";
  pager.innerHTML = [
    '<button id="readerPagePrevBtn" class="secondary compact" type="button">上一屏</button>',
    '<span id="readerPageStatus">上下滚动</span>',
    '<button id="readerPageNextBtn" class="secondary compact" type="button">下一屏</button>',
  ].join("");
  shell.insertAdjacentElement("afterend", pager);
  $("readerPagePrevBtn")?.addEventListener("click", () => void turnReaderPage(-1));
  $("readerPageNextBtn")?.addEventListener("click", () => void turnReaderPage(1));

  const focusTools = document.createElement("div");
  focusTools.className = "reader-focus-tools";
  focusTools.setAttribute("aria-label", "专注阅读控制");
  focusTools.innerHTML = [
    '<button id="readerFocusExitBtn" type="button">退出沉浸</button>',
    '<button id="readerFocusFullscreenBtn" type="button">全屏</button>',
  ].join("");
  shell.insertAdjacentElement("afterend", focusTools);
  $("readerFocusExitBtn")?.addEventListener("click", () => void setImmersiveReading(false));
  $("readerFocusFullscreenBtn")?.addEventListener("click", () => void toggleReaderFullscreen());
  renderReaderFullscreenButtons();

  const chrome = document.createElement("div");
  chrome.className = "reader-chrome";
  chrome.setAttribute("aria-label", "沉浸阅读控制");
  chrome.innerHTML = [
    '<button id="immersivePrevPageBtn" class="reader-page-turn prev" type="button" aria-label="上一页">‹</button>',
    '<button id="immersiveNextPageBtn" class="reader-page-turn next" type="button" aria-label="下一页">›</button>',
    '<div class="reader-page-meter" aria-live="polite">',
    '  <span id="immersivePageStatus">第 1/1 页</span>',
    '  <span id="immersiveBookStatus">未选择书籍</span>',
    '</div>',
    '<div class="reader-immersive-progress" aria-hidden="true"><span id="immersiveProgressFill"></span></div>',
    '<div class="reader-position-nav" aria-label="阅读位置导航">',
    '  <button id="immersivePrevChunkNavBtn" type="button" aria-label="上一段">上一段</button>',
    '  <button id="immersiveCurrentChunkNavBtn" type="button">当前位置</button>',
    '  <button id="immersiveNextChunkNavBtn" type="button" aria-label="下一段">下一段</button>',
    '  <button id="immersivePlanNextNavBtn" type="button" disabled>计划下一步</button>',
    '</div>',
    '<button id="immersiveCleanReadBtn" class="reader-clean-button" type="button" aria-pressed="false">净读</button>',
    '<button id="immersiveAssistantBtn" class="reader-assistant-toggle" type="button" aria-pressed="false">收起 Nova</button>',
    '<div class="reader-exit-controls">',
    '  <button id="immersiveExitBtn" type="button">退出</button>',
    '  <button id="immersiveControlsBtn" type="button">显示控件</button>',
    '  <button id="immersiveFullscreenBtn" type="button">全屏</button>',
    '</div>',
    '<button id="immersiveLibraryBtn" class="reader-library-button" type="button" aria-expanded="false" aria-controls="immersiveLibrary">书库</button>',
    '<div id="immersiveLibrary" class="reader-library-card" hidden>',
    '  <div class="reader-library-head">',
    '    <div>',
    '      <span id="immersiveLibraryStep">沉浸书库</span>',
    '      <strong id="immersiveLibraryTitle">切换阅读现场</strong>',
    '      <small id="immersiveLibraryMeta">搜索书名、作者或 bookId。</small>',
    '    </div>',
    '    <button id="immersiveLibraryCloseBtn" class="secondary compact" type="button">关闭</button>',
    '  </div>',
    '  <input id="immersiveLibrarySearch" type="search" placeholder="搜索书名、作者或 bookId">',
    '  <div class="reader-library-actions">',
    '    <button id="immersiveLocalLibraryScanBtn" class="secondary compact" type="button">扫描本地书库</button>',
    '    <small id="immersiveLocalLibraryStatus">可从 D:\\书库 直接导入开读。</small>',
    '  </div>',
    '  <div id="immersiveLibraryList" class="reader-library-list">暂无书籍</div>',
    '</div>',
    '<button id="immersivePlanBtn" class="reader-plan-button" type="button" aria-expanded="false" aria-controls="immersivePlan">计划</button>',
    '<div id="immersivePlan" class="reader-plan-card" hidden>',
    '  <div>',
    '    <span id="immersivePlanStep">当前计划</span>',
    '    <strong id="immersivePlanTitle">暂无活跃计划</strong>',
    '    <small id="immersivePlanMeta">创建计划后会在这里显示下一步。</small>',
    '  </div>',
    '  <div class="reader-plan-actions">',
    '    <button id="immersivePlanCreateBtn" class="primary compact" type="button">建本章计划</button>',
    '    <button id="immersivePlanOpenRangeBtn" class="primary compact" type="button" disabled>打开范围</button>',
    '    <button id="immersivePlanExecuteBtn" class="secondary compact" type="button" disabled>执行一步</button>',
    '    <button id="immersivePlanReviewBtn" class="secondary compact" type="button" disabled>填评价</button>',
    '    <button id="immersivePlanCloseBtn" class="secondary compact" type="button">关闭</button>',
    '  </div>',
    '</div>',
    '<div id="immersiveBacktrack" class="reader-backtrack-card" hidden>',
    '  <div class="reader-backtrack-head">',
    '    <div>',
    '      <span id="immersiveBacktrackStep">兴趣回溯</span>',
    '      <strong id="immersiveBacktrackTitle">暂无回溯证据</strong>',
    '      <small id="immersiveBacktrackMeta">选中原文后点击追线索。</small>',
    '    </div>',
    '    <button id="immersiveBacktrackCloseBtn" class="secondary compact" type="button">关闭</button>',
    '  </div>',
    '  <div id="immersiveBacktrackList" class="reader-backtrack-list">暂无证据</div>',
    '  <div class="reader-backtrack-actions">',
    '    <button id="immersiveBacktrackOpenBtn" class="primary compact" type="button" disabled>打开范围</button>',
    '    <button id="immersiveBacktrackPlanBtn" class="secondary compact" type="button" disabled>生成计划</button>',
    '    <button id="immersiveBacktrackSinkBtn" class="secondary compact" type="button" disabled>沉淀</button>',
    '    <button id="immersiveBacktrackApproveSinkBtn" class="secondary compact" type="button" disabled>批准预览</button>',
    '    <button id="immersiveBacktrackExecuteSinkBtn" class="secondary compact" type="button" disabled>执行写入</button>',
    '    <button id="immersiveBacktrackOpenSinkBtn" class="secondary compact" type="button" disabled>打开预览</button>',
    '  </div>',
    '</div>',
    '<button id="immersiveTocBtn" class="reader-toc-button" type="button" aria-expanded="false" aria-controls="immersiveToc">目录</button>',
    '<div id="immersiveToc" class="reader-toc" hidden>',
    '  <div class="reader-toc-head">',
    '    <strong>目录</strong>',
    '    <button id="immersiveTocCloseBtn" class="secondary compact" type="button">关闭</button>',
    '  </div>',
    '  <label class="reader-toc-search">',
    '    <span>查找章节</span>',
    '    <input id="immersiveTocSearch" type="search" placeholder="输入标题、chunk 或序号">',
    '  </label>',
    '  <small id="immersiveTocCount" class="reader-toc-count">0 项</small>',
    '  <div id="immersiveTocList" class="reader-toc-list" role="list"></div>',
    '</div>',
    '<div class="reader-settings" aria-label="阅读设置">',
    '  <button type="button" data-reader-font="-1" aria-label="缩小字号">A-</button>',
    '  <button type="button" data-reader-font="1" aria-label="放大字号">A+</button>',
    '  <button type="button" data-reader-measure="narrow">窄</button>',
    '  <button type="button" data-reader-measure="medium">中</button>',
    '  <button type="button" data-reader-measure="wide">宽</button>',
    '  <button type="button" data-reader-theme="light">白</button>',
    '  <button type="button" data-reader-theme="paper">纸</button>',
    '  <button type="button" data-reader-theme="dark">夜</button>',
    '</div>',
    '<div class="reader-find" aria-label="查找原文">',
    '  <input id="readerFindInput" type="search" placeholder="查找原文">',
    '  <button id="readerFindPrevBtn" type="button" aria-label="上一个命中">↑</button>',
    '  <button id="readerFindNextBtn" type="button" aria-label="下一个命中">↓</button>',
    '  <button id="readerFindClearBtn" type="button" aria-label="清除查找">×</button>',
    '  <span id="readerFindStatus">0/0</span>',
    '</div>',
    '<div class="reader-bookmark-tools" aria-label="书签">',
    '  <button id="immersiveBookmarkBtn" type="button">插书签</button>',
    '  <button id="immersiveLastBookmarkBtn" type="button" disabled>最近书签</button>',
    '  <span id="immersiveBookmarkStatus">暂无书签</span>',
    '</div>',
    '<div class="reader-action-tools" aria-label="本段动作">',
    '  <button id="immersiveNextChunkBtn" type="button">读完下一段</button>',
    '  <button id="immersiveReviewLastBtn" type="button" disabled>回看刚读</button>',
    '  <button id="immersiveResumeNextBtn" type="button" disabled>回到继续读</button>',
    '  <button id="immersiveFootprintsBtn" type="button" disabled>脚印</button>',
    '  <button id="immersiveAskNovaBtn" type="button">问 Nova</button>',
    '  <button id="immersiveNoteBtn" type="button">记一笔</button>',
    '  <button id="immersiveSelfCheckBtn" type="button">自测</button>',
    '  <button id="immersiveSinkCurrentBtn" type="button">沉淀本段</button>',
    '  <button id="immersiveOpenSinkBtn" type="button">看沉淀</button>',
    '  <span id="immersiveActionStatus">本段动作</span>',
    '</div>',
    '<div id="immersiveReadingMemory" class="immersive-reading-memory" hidden></div>',
    '<div id="immersiveNovaCard" class="immersive-nova-card" hidden>',
    '  <div class="immersive-nova-head">',
    '    <div>',
    '      <span id="immersiveNovaLabel">Nova</span>',
    '      <strong id="immersiveNovaTitle">选区共读</strong>',
    '      <small id="immersiveNovaMeta">选中原文后可就地提问。</small>',
    '    </div>',
    '    <button id="immersiveNovaCloseBtn" class="secondary compact" type="button">关闭</button>',
    '  </div>',
    '  <textarea id="immersiveNovaPrompt" rows="3" placeholder="向 Nova 追问这段选区。"></textarea>',
    '  <div class="immersive-nova-actions">',
    '    <button id="immersiveNovaAskBtn" class="primary compact" type="button">发送</button>',
    '    <button id="immersiveNovaSaveBtn" class="secondary compact" type="button" disabled>存笔记</button>',
    '    <button id="immersiveNovaSinkBtn" class="secondary compact" type="button" disabled>沉淀</button>',
    '  </div>',
    '  <div id="immersiveNovaReply" class="immersive-nova-reply empty">Nova 的回应会在这里。</div>',
    '</div>',
  ].join("");
  shell.insertAdjacentElement("afterend", chrome);
  $("immersivePrevPageBtn")?.addEventListener("click", () => void turnReaderPage(-1));
  $("immersiveNextPageBtn")?.addEventListener("click", () => void turnReaderPage(1));
  $("immersivePrevChunkNavBtn")?.addEventListener("click", () => {
    $("immersivePrevChunkNavBtn").disabled = true;
    void moveChunk(-1).catch((error) => {
      log(error.message || String(error));
    }).finally(renderReaderProgress);
  });
  $("immersiveCurrentChunkNavBtn")?.addEventListener("click", () => {
    focusPanel(".reader-surface", "#chunkText");
    renderReaderProgress();
  });
  $("immersiveNextChunkNavBtn")?.addEventListener("click", () => {
    $("immersiveNextChunkNavBtn").disabled = true;
    void moveChunk(1).catch((error) => {
      log(error.message || String(error));
    }).finally(renderReaderProgress);
  });
  $("immersivePlanNextNavBtn")?.addEventListener("click", () => {
    $("immersivePlanNextNavBtn").disabled = true;
    void openPlanGuideRange().catch((error) => {
      log(error.message || String(error));
    }).finally(renderReaderProgress);
  });
  $("immersiveCleanReadBtn")?.addEventListener("click", toggleImmersiveCleanRead);
  $("immersiveControlsBtn")?.addEventListener("click", toggleImmersiveCleanRead);
  $("immersiveAssistantBtn")?.addEventListener("click", toggleImmersiveAssistant);
  $("immersiveExitBtn")?.addEventListener("click", () => void setImmersiveReading(false));
  $("immersiveFullscreenBtn")?.addEventListener("click", () => void toggleReaderFullscreen());
  $("immersiveLibraryBtn")?.addEventListener("click", toggleImmersiveLibrary);
  $("immersiveLibraryCloseBtn")?.addEventListener("click", closeImmersiveLibrary);
  $("immersiveLibrarySearch")?.addEventListener("input", renderImmersiveLibrary);
  $("immersiveLocalLibraryScanBtn")?.addEventListener("click", () => {
    void loadImmersiveLocalLibrary().catch((error) => {
      log(error.message || String(error));
      renderImmersiveLibrary();
    });
  });
  $("immersiveLibraryList")?.addEventListener("click", (event) => {
    const localButton = event.target.closest("button[data-local-library-action][data-relative-path]");
    if (localButton) {
      localButton.disabled = true;
      const action = localButton.dataset.localLibraryAction || "import";
      const task = action === "open"
        ? openImmersiveLibraryBook(localButton.dataset.bookId || "", { continueBook: true })
        : importImmersiveLocalLibraryBook(localButton.dataset.relativePath || "");
      void task.catch((error) => {
        log(error.message || String(error));
      }).finally(renderImmersiveLibrary);
      return;
    }
    const button = event.target.closest("button[data-library-action][data-book-id]");
    if (!button) return;
    button.disabled = true;
    const bookId = button.dataset.bookId || "";
    const action = button.dataset.libraryAction || "select";
    void openImmersiveLibraryBook(bookId, { continueBook: action === "continue" }).catch((error) => {
      log(error.message || String(error));
    }).finally(renderImmersiveLibrary);
  });
  $("immersivePlanBtn")?.addEventListener("click", toggleImmersivePlan);
  $("immersivePlanCloseBtn")?.addEventListener("click", closeImmersivePlan);
  $("immersivePlanCreateBtn")?.addEventListener("click", () => {
    $("immersivePlanCreateBtn").disabled = true;
    void createPlanForCurrentSection().catch((error) => {
      log(error.message || String(error));
    }).finally(renderReaderProgress);
  });
  $("immersivePlanOpenRangeBtn")?.addEventListener("click", () => {
    $("immersivePlanOpenRangeBtn").disabled = true;
    void openPlanGuideRange().catch((error) => {
      log(error.message || String(error));
    }).finally(renderReaderProgress);
  });
  $("immersivePlanExecuteBtn")?.addEventListener("click", () => {
    $("immersivePlanExecuteBtn").disabled = true;
    void executePlanGuideStep().catch((error) => {
      log(error.message || String(error));
    }).finally(renderReaderProgress);
  });
  $("immersivePlanReviewBtn")?.addEventListener("click", () => {
    $("immersivePlanReviewBtn").disabled = true;
    void reviewPlanGuideStep().catch((error) => {
      log(error.message || String(error));
    }).finally(renderReaderProgress);
  });
  $("immersiveBacktrackCloseBtn")?.addEventListener("click", closeImmersiveBacktrack);
  $("immersiveBacktrackOpenBtn")?.addEventListener("click", () => {
    $("immersiveBacktrackOpenBtn").disabled = true;
    void openTrailGuideRange().catch((error) => {
      log(error.message || String(error));
    }).finally(renderImmersiveBacktrack);
  });
  $("immersiveBacktrackPlanBtn")?.addEventListener("click", () => {
    $("immersiveBacktrackPlanBtn").disabled = true;
    void planTrailGuide().catch((error) => {
      log(error.message || String(error));
    }).finally(renderImmersiveBacktrack);
  });
  $("immersiveBacktrackSinkBtn")?.addEventListener("click", () => {
    $("immersiveBacktrackSinkBtn").disabled = true;
    void createImmersiveBacktrackSinkPreview().catch((error) => {
      log(error.message || String(error));
    }).finally(renderImmersiveBacktrack);
  });
  $("immersiveBacktrackApproveSinkBtn")?.addEventListener("click", () => {
    $("immersiveBacktrackApproveSinkBtn").disabled = true;
    void approveImmersiveBacktrackSinkPreview().catch((error) => {
      log(error.message || String(error));
    }).finally(renderImmersiveBacktrack);
  });
  $("immersiveBacktrackExecuteSinkBtn")?.addEventListener("click", () => {
    $("immersiveBacktrackExecuteSinkBtn").disabled = true;
    void executeImmersiveBacktrackSinkPreview().catch((error) => {
      log(error.message || String(error));
    }).finally(renderImmersiveBacktrack);
  });
  $("immersiveBacktrackOpenSinkBtn")?.addEventListener("click", () => {
    $("immersiveBacktrackOpenSinkBtn").disabled = true;
    void openImmersiveBacktrackSinkPreview().catch((error) => {
      log(error.message || String(error));
    }).finally(renderImmersiveBacktrack);
  });
  $("immersiveBacktrackList")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-backtrack-chunk-id]");
    if (!button) return;
    void selectChunk(button.dataset.backtrackChunkId, true).then(() => {
      focusPanel(".reader-surface", "#chunkText");
      renderImmersiveBacktrack();
    });
  });
  $("immersiveTocBtn")?.addEventListener("click", toggleImmersiveToc);
  $("immersiveTocCloseBtn")?.addEventListener("click", closeImmersiveToc);
  $("immersiveTocSearch")?.addEventListener("input", renderImmersiveToc);
  $("immersiveTocList")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-toc-chunk-id]");
    if (!button) return;
    void selectChunk(button.dataset.tocChunkId, true).then(() => {
      closeImmersiveToc();
      focusPanel(".reader-surface", "#chunkText");
    });
  });
  chrome.querySelector(".reader-settings")?.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.readerFont) adjustReaderFont(Number(button.dataset.readerFont || 0));
    if (button.dataset.readerMeasure) setReaderMeasure(button.dataset.readerMeasure);
    if (button.dataset.readerTheme) setReaderTheme(button.dataset.readerTheme);
  });
  $("readerFindInput")?.addEventListener("input", (event) => {
    setReaderFindQuery(event.target.value);
  });
  $("readerFindInput")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    moveReaderFind(event.shiftKey ? -1 : 1);
  });
  $("readerFindPrevBtn")?.addEventListener("click", () => moveReaderFind(-1));
  $("readerFindNextBtn")?.addEventListener("click", () => moveReaderFind(1));
  $("readerFindClearBtn")?.addEventListener("click", clearReaderFind);
  $("immersiveBookmarkBtn")?.addEventListener("click", saveImmersiveBookmark);
  $("immersiveLastBookmarkBtn")?.addEventListener("click", () => {
    void openImmersiveLastBookmark();
  });
  $("immersiveAskNovaBtn")?.addEventListener("click", prepareNovaPromptFromCurrentReading);
  $("immersiveNextChunkBtn")?.addEventListener("click", () => {
    $("immersiveNextChunkBtn").disabled = true;
    void markReadAndMaybeAdvance({ advance: true }).catch((error) => {
      log(error.message || String(error));
    }).finally(renderReaderProgress);
  });
  $("immersiveReviewLastBtn")?.addEventListener("click", () => {
    $("immersiveReviewLastBtn").disabled = true;
    void reviewLastCompletedInReader().catch((error) => {
      log(error.message || String(error));
    }).finally(renderReaderProgress);
  });
  $("immersiveResumeNextBtn")?.addEventListener("click", () => {
    $("immersiveResumeNextBtn").disabled = true;
    void resumeAfterLastCompletedReview().catch((error) => {
      log(error.message || String(error));
    }).finally(renderReaderProgress);
  });
  $("immersiveFootprintsBtn")?.addEventListener("click", toggleImmersiveFootprints);
  $("immersiveNoteBtn")?.addEventListener("click", prepareNoteFromCurrentReading);
  $("immersiveSelfCheckBtn")?.addEventListener("click", openImmersiveSelfCheck);
  $("immersiveSinkCurrentBtn")?.addEventListener("click", () => {
    void createCurrentChunkSinkPreview({ focusSink: false }).catch((error) => {
      log(error.message || String(error));
    }).finally(renderReaderProgress);
  });
  $("immersiveOpenSinkBtn")?.addEventListener("click", () => {
    void openBestSinkPreview().catch((error) => {
      log(error.message || String(error));
    });
  });
  $("immersiveNovaCloseBtn")?.addEventListener("click", closeImmersiveNovaCard);
  $("immersiveNovaAskBtn")?.addEventListener("click", () => void askNovaFromImmersiveCard());
  $("immersiveNovaSaveBtn")?.addEventListener("click", () => void saveNovaReplyFromImmersiveCard());
  $("immersiveNovaSinkBtn")?.addEventListener("click", () => void sinkNovaReplyFromImmersiveCard());

  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && state.immersiveReading) {
      void setImmersiveReading(false, { skipFullscreen: true });
    }
  });
  document.addEventListener("keydown", handleReaderKeyboard);
}

function loadReaderMode() {
  const saved = localStorage.getItem(READER_MODE_KEY);
  setReaderMode(saved === "paged" ? "paged" : "scroll", { persist: false });
}

function loadReaderSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(READER_SETTINGS_KEY) || "{}");
    state.readerSettings = normalizeReaderSettings(saved);
  } catch {
    state.readerSettings = normalizeReaderSettings();
    localStorage.removeItem(READER_SETTINGS_KEY);
  }
  applyReaderSettings({ persist: false });
}

function normalizeReaderSettings(settings = {}) {
  return {
    fontScale: Math.max(0.86, Math.min(1.28, Number(settings.fontScale) || 1)),
    measure: ["narrow", "medium", "wide"].includes(settings.measure) ? settings.measure : "medium",
    theme: ["light", "paper", "dark"].includes(settings.theme) ? settings.theme : "light",
  };
}

function applyReaderSettings({ persist = true } = {}) {
  state.readerSettings = normalizeReaderSettings(state.readerSettings);
  document.documentElement.style.setProperty("--reader-font-scale", String(state.readerSettings.fontScale));
  document.body.dataset.readerMeasure = state.readerSettings.measure;
  document.body.dataset.readerTheme = state.readerSettings.theme;
  document.querySelectorAll("[data-reader-measure]").forEach((button) => {
    button.classList.toggle("active", button.dataset.readerMeasure === state.readerSettings.measure);
  });
  document.querySelectorAll("[data-reader-theme]").forEach((button) => {
    button.classList.toggle("active", button.dataset.readerTheme === state.readerSettings.theme);
  });
  if (persist) localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify(state.readerSettings));
  window.setTimeout(updateReaderPageStatus, 80);
}

function adjustReaderFont(delta) {
  state.readerSettings.fontScale = Math.max(0.86, Math.min(1.28, state.readerSettings.fontScale + (delta * 0.06)));
  applyReaderSettings();
}

function setReaderMeasure(measure) {
  state.readerSettings.measure = measure;
  applyReaderSettings();
}

function setReaderTheme(theme) {
  state.readerSettings.theme = theme;
  applyReaderSettings();
}

function setReaderMode(mode, { persist = true } = {}) {
  state.readerMode = mode === "paged" ? "paged" : "scroll";
  document.body.classList.toggle("reader-mode-paged", state.readerMode === "paged");
  document.querySelectorAll("[data-reader-mode]").forEach((button) => {
    const pressed = button.dataset.readerMode === state.readerMode;
    button.classList.toggle("active", pressed);
    button.setAttribute("aria-pressed", pressed ? "true" : "false");
  });
  if (persist) localStorage.setItem(READER_MODE_KEY, state.readerMode);
  const chunkText = $("chunkText");
  if (chunkText && state.readerMode === "scroll") chunkText.scrollLeft = 0;
  updateReaderPageStatus();
}

function handleReaderKeyboard(event) {
  if (!state.immersiveReading) {
    if (event.key === "Escape" && state.readerTocOpen) {
      event.preventDefault();
      closeReaderToc();
      focusPanel(".reader-surface", "#chunkText");
    }
    return;
  }
  const editable = event.target?.closest?.("input, textarea, select, [contenteditable='true']");
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
    event.preventDefault();
    $("readerFindInput")?.focus();
    return;
  }
  if (event.key === "Escape" && editable) {
    event.preventDefault();
    if (document.body.classList.contains("immersive-notes-open")) {
      closeImmersiveNotesPane();
      focusPanel(".reader-surface", "#chunkText");
    } else if (document.body.classList.contains("immersive-tools-open")) {
      closeImmersiveToolsPane();
      focusPanel(".reader-surface", "#chunkText");
    } else if (document.body.classList.contains("immersive-footprints-open")) {
      closeImmersiveFootprints();
      focusPanel(".reader-surface", "#chunkText");
    } else if (document.body.classList.contains("immersive-plan-open")) {
      closeImmersivePlan();
      focusPanel(".reader-surface", "#chunkText");
    } else if (document.body.classList.contains("immersive-library-open")) {
      closeImmersiveLibrary();
      focusPanel(".reader-surface", "#chunkText");
    } else if (document.body.classList.contains("immersive-backtrack-open")) {
      closeImmersiveBacktrack();
      focusPanel(".reader-surface", "#chunkText");
    } else {
      editable.blur?.();
    }
    return;
  }
  if (editable) return;
  if (["ArrowRight", "PageDown", " "].includes(event.key)) {
    event.preventDefault();
    void turnReaderPage(1);
  } else if (["ArrowLeft", "PageUp"].includes(event.key)) {
    event.preventDefault();
    void turnReaderPage(-1);
  } else if (event.key === "Escape") {
    event.preventDefault();
    if (document.body.classList.contains("immersive-notes-open")) {
      closeImmersiveNotesPane();
      focusPanel(".reader-surface", "#chunkText");
    } else if (document.body.classList.contains("immersive-tools-open")) {
      closeImmersiveToolsPane();
      focusPanel(".reader-surface", "#chunkText");
    } else if (document.body.classList.contains("immersive-toc-open")) {
      closeImmersiveToc();
      focusPanel(".reader-surface", "#chunkText");
    } else if (document.body.classList.contains("immersive-plan-open")) {
      closeImmersivePlan();
      focusPanel(".reader-surface", "#chunkText");
    } else if (document.body.classList.contains("immersive-library-open")) {
      closeImmersiveLibrary();
      focusPanel(".reader-surface", "#chunkText");
    } else if (document.body.classList.contains("immersive-backtrack-open")) {
      closeImmersiveBacktrack();
      focusPanel(".reader-surface", "#chunkText");
    } else if (document.body.classList.contains("immersive-footprints-open")) {
      closeImmersiveFootprints();
      focusPanel(".reader-surface", "#chunkText");
    } else if (state.readerSelection?.text) {
      clearReaderSelection();
    } else {
      void setImmersiveReading(false);
    }
  } else if (event.key === "]") {
    event.preventDefault();
    adjustReaderFont(1);
  } else if (event.key === "[") {
    event.preventDefault();
    adjustReaderFont(-1);
  } else if (event.key.toLowerCase() === "h") {
    event.preventDefault();
    toggleImmersiveCleanRead();
  } else if (event.key.toLowerCase() === "n") {
    event.preventDefault();
    toggleImmersiveAssistant();
  } else if (event.key.toLowerCase() === "q" && state.readerSelection?.text) {
    event.preventDefault();
    askNovaFromSelection();
  } else if (event.key.toLowerCase() === "m" && state.readerSelection?.text) {
    event.preventDefault();
    openImmersiveQuickNote();
  }
}

async function turnReaderPage(direction) {
  const chunkText = $("chunkText");
  if (!chunkText) return;
  if (state.readerMode !== "paged") setReaderMode("paged");
  const step = readerPageStep(chunkText);
  const maxLeft = Math.max(0, chunkText.scrollWidth - chunkText.clientWidth);
  if (direction > 0 && chunkText.scrollLeft >= maxLeft - 2) {
    await moveChunk(1, { restoreEnd: false });
    return;
  }
  if (direction < 0 && chunkText.scrollLeft <= 2) {
    await moveChunk(-1, { restoreEnd: true });
    return;
  }
  chunkText.scrollBy({ left: direction * step, behavior: "smooth" });
  window.setTimeout(updateReaderPageStatus, 180);
}

function jumpReaderToPageEnd() {
  const chunkText = $("chunkText");
  if (!chunkText) return;
  if (state.readerMode !== "paged") setReaderMode("paged");
  window.setTimeout(() => {
    chunkText.scrollLeft = Math.max(0, chunkText.scrollWidth - chunkText.clientWidth);
    saveReadingSession();
    updateReaderPageStatus();
  }, 120);
}

function readerPageStep(chunkText = $("chunkText")) {
  if (!chunkText) return 0;
  const styles = window.getComputedStyle(chunkText);
  const columnGap = Number.parseFloat(styles.columnGap) || 0;
  const columnWidth = Number.parseFloat(styles.columnWidth) || chunkText.clientWidth;
  return Math.max(220, Math.min(chunkText.clientWidth, columnWidth + columnGap));
}

function updateReaderPageStatus() {
  const chunkText = $("chunkText");
  const status = $("readerPageStatus");
  const prev = $("readerPagePrevBtn");
  const next = $("readerPageNextBtn");
  if (!chunkText || !status || !prev || !next) return;
  if (state.readerMode !== "paged") {
    status.textContent = "上下滚动";
    prev.disabled = true;
    next.disabled = true;
    updateImmersivePageStatus({ current: Math.max(1, Math.round(currentChunkScrollPercent()) || 1), total: 100, mode: "scroll" });
    return;
  }
  const maxLeft = Math.max(0, chunkText.scrollWidth - chunkText.clientWidth);
  const step = Math.max(1, readerPageStep(chunkText));
  const total = Math.max(1, Math.ceil(chunkText.scrollWidth / step));
  const current = Math.min(total, Math.max(1, Math.round(chunkText.scrollLeft / step) + 1));
  status.textContent = `第 ${current}/${total} 屏`;
  prev.disabled = chunkText.scrollLeft <= 1;
  next.disabled = chunkText.scrollLeft >= maxLeft - 1;
  updateImmersivePageStatus({ current, total, mode: "paged" });
}

function readerTocEntries(queryText = "") {
  const query = String(queryText || "").trim().toLowerCase();
  return state.chunks
    .map((chunk, index) => {
      const chunkId = getChunkId(chunk);
      const title = chunk.title || chunk.sectionTitle || chunkId;
      const progress = Math.round(((index + 1) / Math.max(1, state.chunks.length)) * 100);
      const haystack = [chunkId, title, String(index + 1), `${progress}%`].join(" ").toLowerCase();
      return { chunk, index, chunkId, title, progress, hidden: Boolean(query) && !haystack.includes(query) };
    })
    .filter((entry) => !entry.hidden);
}

function readerTocSectionLabel(chunk) {
  return String(chunk?.sectionTitle || chunk?.title || "未命名章节").replace(/\s+Part\s+\d+\/\d+$/i, "").trim();
}

function readerTocSectionProgress(chunk) {
  const sameSection = state.chunks.filter((item) => Number(item.sectionIndex) === Number(chunk?.sectionIndex));
  if (!sameSection.length) return "";
  const readCount = sameSection.filter((item) => item.read).length;
  return `${readCount}/${sameSection.length} 已读`;
}

function currentSectionRange() {
  const index = chunkOrder(state.selectedChunkId);
  const current = index === null ? null : state.chunks[index];
  if (!current) return null;
  const sameSection = state.chunks.filter((chunk) => Number(chunk.sectionIndex) === Number(current.sectionIndex));
  const sectionChunks = sameSection.length ? sameSection : [current];
  const startChunkId = getChunkId(sectionChunks[0]);
  const endChunkId = getChunkId(sectionChunks[sectionChunks.length - 1]);
  if (!startChunkId || !endChunkId) return null;
  return {
    title: readerTocSectionLabel(current),
    sectionIndex: current.sectionIndex,
    startChunkId,
    endChunkId,
    chunkCount: sectionChunks.length,
  };
}

function renderImmersiveToc() {
  const list = $("immersiveTocList");
  const button = $("immersiveTocBtn");
  const count = $("immersiveTocCount");
  if (!list || !button) return;
  const selected = activeBook();
  button.disabled = !selected || !state.chunks.length;
  if (!selected || !state.chunks.length) {
    list.className = "reader-toc-list empty";
    list.textContent = "暂无目录";
    if (count) count.textContent = "0 项";
    return;
  }
  const query = String($("immersiveTocSearch")?.value || "").trim();
  const entries = readerTocEntries(query);
  if (count) count.textContent = query
    ? `${entries.length}/${state.chunks.length} 项`
    : `${state.chunks.length} 项`;
  if (!entries.length) {
    list.className = "reader-toc-list empty";
    list.textContent = "没有匹配章节";
    return;
  }
  list.className = "reader-toc-list";
  list.innerHTML = entries.map(({ index, chunkId, title, progress }) => {
    const active = chunkId === state.selectedChunkId;
    return `
      <button class="reader-toc-item ${active ? "active" : ""}" type="button" data-toc-chunk-id="${escapeHtml(chunkId)}" role="listitem">
        <span>${escapeHtml(String(index + 1).padStart(2, "0"))}</span>
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(chunkId)} · ${progress}%</small>
      </button>
    `;
  }).join("");
  const activeItem = list.querySelector(".reader-toc-item.active");
  if (activeItem) window.setTimeout(() => activeItem.scrollIntoView({ block: "center" }), 0);
}

function openImmersiveToc() {
  if (!state.immersiveReading) return;
  closeImmersiveFootprints();
  renderImmersiveToc();
  document.body.classList.add("immersive-toc-open");
  const toc = $("immersiveToc");
  const button = $("immersiveTocBtn");
  if (toc) toc.hidden = false;
  if (button) button.setAttribute("aria-expanded", "true");
  window.setTimeout(() => $("immersiveTocSearch")?.focus(), 80);
}

function closeImmersiveToc() {
  document.body.classList.remove("immersive-toc-open");
  const toc = $("immersiveToc");
  const button = $("immersiveTocBtn");
  if (toc) toc.hidden = true;
  if (button) button.setAttribute("aria-expanded", "false");
}

function toggleImmersiveToc() {
  if (document.body.classList.contains("immersive-toc-open")) closeImmersiveToc();
  else openImmersiveToc();
}

function renderReaderToc() {
  const list = $("readerTocList");
  const count = $("readerTocCount");
  const button = $("readerTocToggleBtn");
  if (!list) return;
  const selected = activeBook();
  const query = String($("readerTocSearch")?.value || "").trim();
  if (button) {
    button.disabled = !selected || !state.chunks.length;
    button.textContent = state.readerTocOpen ? "收起目录" : "目录";
    button.setAttribute("aria-expanded", state.readerTocOpen ? "true" : "false");
  }
  if (!selected || !state.chunks.length) {
    list.className = "reader-toc-inline empty";
    list.textContent = "选择书籍后显示目录。";
    if (count) count.textContent = "0 项";
    return;
  }
  const entries = readerTocEntries(query);
  if (count) count.textContent = query ? `${entries.length}/${state.chunks.length} 项` : `${state.chunks.length} 项`;
  if (!entries.length) {
    list.className = "reader-toc-inline empty";
    list.textContent = "没有匹配章节。";
    return;
  }
  list.className = "reader-toc-inline";
  let lastSectionKey = "";
  list.innerHTML = entries.slice(0, 24).map(({ chunk, index, chunkId, title, progress }) => {
    const active = chunkId === state.selectedChunkId;
    const sectionKey = Number.isFinite(Number(chunk.sectionIndex)) ? String(chunk.sectionIndex) : readerTocSectionLabel(chunk);
    const sectionHeader = sectionKey !== lastSectionKey
      ? `<div class="reader-toc-section" role="presentation"><strong>${escapeHtml(readerTocSectionLabel(chunk))}</strong><small>${escapeHtml(readerTocSectionProgress(chunk) || `${progress}%`)}</small></div>`
      : "";
    lastSectionKey = sectionKey;
    return `${sectionHeader}<button class="reader-toc-inline-item ${active ? "active" : ""}" type="button" data-reader-toc-chunk-id="${escapeHtml(chunkId)}" role="listitem">
      <span>${escapeHtml(String(index + 1).padStart(2, "0"))}</span>
      <strong>${escapeHtml(title)}</strong>
      <small>${escapeHtml(chunkId)} · ${progress}%</small>
    </button>`;
  }).join("");
}

function setReaderTocOpen(open) {
  const selected = activeBook();
  state.readerTocOpen = Boolean(open && selected && state.chunks.length);
  document.body.classList.toggle("reader-toc-open", state.readerTocOpen);
  renderReaderToc();
  if (state.readerTocOpen) window.setTimeout(() => $("readerTocSearch")?.focus(), 80);
}

function closeReaderToc() {
  setReaderTocOpen(false);
}

function toggleReaderToc() {
  setReaderTocOpen(!state.readerTocOpen);
}

function openImmersivePlan() {
  if (!state.immersiveReading) return;
  closeImmersiveToc();
  closeImmersiveFootprints();
  closeImmersiveLibrary();
  closeImmersiveBacktrack();
  renderImmersivePlan();
  document.body.classList.add("immersive-plan-open");
  const card = $("immersivePlan");
  const button = $("immersivePlanBtn");
  if (card) card.hidden = false;
  if (button) button.setAttribute("aria-expanded", "true");
}

function closeImmersivePlan() {
  document.body.classList.remove("immersive-plan-open");
  const card = $("immersivePlan");
  const button = $("immersivePlanBtn");
  if (card) card.hidden = true;
  if (button) button.setAttribute("aria-expanded", "false");
}

function toggleImmersivePlan() {
  if (document.body.classList.contains("immersive-plan-open")) {
    closeImmersivePlan();
    return;
  }
  const status = planGuideStatus();
  if (!status.plan && status.canCreate) {
    void createPlanForCurrentSection().catch((error) => {
      log(error.message || String(error));
    }).finally(renderReaderProgress);
    return;
  }
  openImmersivePlan();
}

function openImmersiveLibrary() {
  if (!state.immersiveReading) return;
  closeImmersiveToc();
  closeImmersiveFootprints();
  closeImmersivePlan();
  closeImmersiveBacktrack();
  document.body.classList.add("immersive-library-open");
  const card = $("immersiveLibrary");
  const button = $("immersiveLibraryBtn");
  if (card) card.hidden = false;
  if (button) button.setAttribute("aria-expanded", "true");
  renderImmersiveLibrary();
  window.setTimeout(() => $("immersiveLibrarySearch")?.focus(), 60);
}

function closeImmersiveLibrary() {
  document.body.classList.remove("immersive-library-open");
  const card = $("immersiveLibrary");
  const button = $("immersiveLibraryBtn");
  if (card) card.hidden = true;
  if (button) button.setAttribute("aria-expanded", "false");
}

function toggleImmersiveLibrary() {
  if (document.body.classList.contains("immersive-library-open")) closeImmersiveLibrary();
  else openImmersiveLibrary();
}

function immersiveLibraryQuery() {
  return String($("immersiveLibrarySearch")?.value || "").trim().toLocaleLowerCase("zh-CN");
}

function bookSearchText(book) {
  return [book?.title, book?.author, book?.bookId].filter(Boolean).join(" ").toLocaleLowerCase("zh-CN");
}

function localLibrarySearchText(book) {
  return [book?.name, book?.relativePath, book?.format].filter(Boolean).join(" ").toLocaleLowerCase("zh-CN");
}

function localBookMetaLine(book) {
  return [
    book?.format ? String(book.format).toUpperCase() : "",
    formatBytes(book?.size || 0),
    book?.relativePath || "",
  ].filter(Boolean).join(" · ");
}

function normalizeBookKey(value) {
  return String(value || "")
    .toLocaleLowerCase("zh-CN")
    .replace(/\.[^.]+$/u, "")
    .replace(/\s*\((z-library|z-lib|z-library\.sk|1lib\.sk|未知|etc\.)[^)]*\)\s*/giu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function importedBookForLocalBook(localBook) {
  const titleKey = normalizeBookKey(titleFromLocalBookPath(localBook?.relativePath));
  const pathKey = normalizeBookKey(localBook?.relativePath);
  return visibleBooks().find((book) => {
    const bookIdKey = normalizeBookKey(book.bookId);
    const bookTitleKey = normalizeBookKey(book.title);
    return Boolean(titleKey && (bookTitleKey === titleKey || bookIdKey === titleKey))
      || Boolean(pathKey && pathKey.includes(bookIdKey) && bookIdKey.length > 8)
      || Boolean(bookTitleKey && pathKey.includes(bookTitleKey) && bookTitleKey.length > 8);
  }) || null;
}

function renderImmersiveLibrary() {
  const card = $("immersiveLibrary");
  const list = $("immersiveLibraryList");
  if (!card || !list) return;
  const books = visibleBooks();
  const selected = activeBook();
  const queryText = immersiveLibraryQuery();
  const filtered = books.filter((book) => !queryText || bookSearchText(book).includes(queryText)).slice(0, 24);
  const local = state.immersiveLocalLibrary;
  const localFiltered = local.books
    .filter((book) => !queryText || localLibrarySearchText(book).includes(queryText))
    .slice(0, 16);
  const meta = $("immersiveLibraryMeta");
  const localStatus = $("immersiveLocalLibraryStatus");
  const scanButton = $("immersiveLocalLibraryScanBtn");
  if (meta) meta.textContent = `${filtered.length}/${books.length} 本 · 当前 ${selected?.title || selected?.bookId || "未选择"}`;
  if (localStatus) {
    localStatus.textContent = local.loading
      ? "扫描中"
      : local.loaded
        ? `${local.root || "本地书库"} · ${localFiltered.length}/${local.books.length} 本`
        : "可从 D:\\书库 直接导入开读。";
  }
  if (scanButton) scanButton.disabled = local.loading;
  if (!filtered.length && !localFiltered.length) {
    list.className = "reader-library-list empty";
    list.textContent = books.length || local.loaded ? "没有匹配的书。" : "暂无已导入书。点“扫描本地书库”可从 D:\\书库 开读。";
    return;
  }
  list.className = "reader-library-list";
  const importedHtml = filtered.map((book) => {
    const session = readSavedReadingSessionForBook(book.bookId);
    const percent = progressPercent(book);
    const active = selected?.bookId === book.bookId;
    const metaLine = [
      book.author,
      book.bookId,
      `${book.chunkCount || 0} 段`,
      session?.chunkId ? `有断点${formatSavedAt(session.savedAt) ? ` · ${formatSavedAt(session.savedAt)}` : ""}` : "",
    ].filter(Boolean).join(" · ");
    return `
      <article class="reader-library-row ${active ? "active" : ""}">
        <button type="button" data-library-action="select" data-book-id="${escapeHtml(book.bookId)}">
          <span>${escapeHtml(active ? "当前书" : "书籍")}</span>
          <strong>${escapeHtml(book.title || book.bookId)}</strong>
          <small>${escapeHtml(metaLine)}</small>
        </button>
        <button class="secondary compact" type="button" data-library-action="continue" data-book-id="${escapeHtml(book.bookId)}">${session?.chunkId ? "继续" : "打开"}</button>
        <b>${escapeHtml(percent)}%</b>
      </article>
    `;
  }).join("");
  const localHtml = localFiltered.map((book) => {
    const importing = local.importingPath === book.relativePath;
    const imported = importedBookForLocalBook(book);
    return `
      <article class="reader-library-row local">
        <button type="button" data-local-library-action="${imported ? "open" : "import"}" data-relative-path="${escapeHtml(book.relativePath)}" data-book-id="${escapeHtml(imported?.bookId || "")}" ${importing ? "disabled" : ""}>
          <span>${escapeHtml(importing ? "导入中" : imported ? "已在书库" : "本地书")}</span>
          <strong>${escapeHtml(titleFromLocalBookPath(book.relativePath) || book.name || book.relativePath)}</strong>
          <small>${escapeHtml(localBookMetaLine(book))}</small>
        </button>
        <button class="secondary compact" type="button" data-local-library-action="${imported ? "open" : "import"}" data-relative-path="${escapeHtml(book.relativePath)}" data-book-id="${escapeHtml(imported?.bookId || "")}" ${importing ? "disabled" : ""}>${imported ? "打开" : "导入"}</button>
        <b>${escapeHtml(book.format || "")}</b>
      </article>
    `;
  }).join("");
  list.innerHTML = [
    importedHtml ? `<div class="reader-library-section">已导入</div>${importedHtml}` : "",
    localHtml ? `<div class="reader-library-section">本地书库</div>${localHtml}` : "",
  ].filter(Boolean).join("");
}

async function openImmersiveLibraryBook(bookId, { continueBook = false } = {}) {
  if (!bookId) return;
  await selectBook(bookId, { focusReader: false });
  if (continueBook) await continueReading();
  closeImmersiveLibrary();
  focusPanel(".reader-surface", "#chunkText");
  renderReaderProgress();
}

async function loadImmersiveLocalLibrary() {
  state.immersiveLocalLibrary.loading = true;
  renderImmersiveLibrary();
  try {
    const data = await loadLocalLibrary();
    state.immersiveLocalLibrary = {
      root: data?.root || "",
      books: Array.isArray(data?.books) ? data.books : [],
      loaded: true,
      loading: false,
      importingPath: "",
    };
  } catch (error) {
    state.immersiveLocalLibrary.loading = false;
    throw error;
  } finally {
    renderImmersiveLibrary();
  }
}

async function importImmersiveLocalLibraryBook(relativePath) {
  if (!relativePath) return;
  state.immersiveLocalLibrary.importingPath = relativePath;
  renderImmersiveLibrary();
  setStatus("导入中", "busy");
  try {
    const imported = await importLocalLibraryPayload({
      relativePath,
      title: titleFromLocalBookPath(relativePath),
      maxChars: 12000,
      overwrite: false,
    });
    log(imported);
    await openImportedBook(imported);
    closeImmersiveLibrary();
    focusPanel(".reader-surface", "#chunkText");
    renderReaderProgress();
  } finally {
    state.immersiveLocalLibrary.importingPath = "";
  }
}

function openImmersiveBacktrack() {
  if (!state.immersiveReading) return;
  closeImmersiveToc();
  closeImmersiveFootprints();
  closeImmersiveLibrary();
  closeImmersivePlan();
  state.immersiveBacktrackOpen = true;
  document.body.classList.add("immersive-backtrack-open");
  const card = $("immersiveBacktrack");
  if (card) card.hidden = false;
  renderImmersiveBacktrack();
}

function closeImmersiveBacktrack() {
  state.immersiveBacktrackOpen = false;
  document.body.classList.remove("immersive-backtrack-open");
  const card = $("immersiveBacktrack");
  if (card) card.hidden = true;
}

function updateImmersivePageStatus({ current = 1, total = 1, mode = state.readerMode } = {}) {
  const pageStatus = $("immersivePageStatus");
  const bookStatus = $("immersiveBookStatus");
  const progressFill = $("immersiveProgressFill");
  const selected = activeBook();
  const index = chunkOrder(state.selectedChunkId);
  if (pageStatus) pageStatus.textContent = mode === "paged"
    ? `第 ${current}/${total} 页`
    : `段内 ${current}%`;
  if (bookStatus) {
    bookStatus.textContent = selected
      ? `${selected.title || selected.bookId}${index !== null ? ` · ${index + 1}/${state.chunks.length}` : ""}`
      : "未选择书籍";
  }
  if (progressFill) {
    const chunkCount = Math.max(1, state.chunks.length || selected?.chunkCount || 0);
    const intraChunk = mode === "paged"
      ? Math.min(1, Math.max(0, Number(current || 1) / Math.max(1, Number(total || 1))))
      : Math.min(1, Math.max(0, Number(current || 0) / 100));
    const baseIndex = index === null ? 0 : index;
    const overall = selected && index !== null ? ((baseIndex + intraChunk) / chunkCount) * 100 : 0;
    progressFill.style.width = `${clampPercent(overall)}%`;
  }
  renderImmersivePositionNav({ current, total, mode });
  renderImmersiveToc();
}

function renderImmersivePositionNav({ current = 1, total = 1, mode = state.readerMode } = {}) {
  const nav = document.querySelector(".reader-position-nav");
  if (!nav) return;
  const selected = activeBook();
  const index = chunkOrder(state.selectedChunkId);
  const hasChunk = !!selected && index !== null;
  const previousChunk = hasChunk ? state.chunks[index - 1] : null;
  const nextChunk = hasChunk ? state.chunks[index + 1] : null;
  const prevBtn = $("immersivePrevChunkNavBtn");
  const currentBtn = $("immersiveCurrentChunkNavBtn");
  const nextBtn = $("immersiveNextChunkNavBtn");
  const planBtn = $("immersivePlanNextNavBtn");
  const title = chunkTitleById(state.selectedChunkId);
  const { plan, nextStep } = planGuideSelection();
  const planLabel = planStepChunkLabel(nextStep);
  const inChunk = mode === "paged"
    ? `P${current}/${total}`
    : `${clampPercent(current)}%`;
  nav.classList.toggle("empty", !selected);
  if (prevBtn) {
    const previousId = getChunkId(previousChunk);
    prevBtn.disabled = !previousId;
    prevBtn.textContent = previousId ? `← ${previousId}` : "开头";
    prevBtn.title = previousId ? chunkTitleById(previousId) : "已经是第一段";
  }
  if (currentBtn) {
    currentBtn.disabled = !hasChunk;
    currentBtn.textContent = hasChunk
      ? `${index + 1}/${state.chunks.length} · ${state.selectedChunkId} · ${inChunk}`
      : "未定位";
    currentBtn.title = [selected?.title || selected?.bookId, title].filter(Boolean).join(" · ");
  }
  if (nextBtn) {
    const nextId = getChunkId(nextChunk);
    nextBtn.disabled = !nextId;
    nextBtn.textContent = nextId ? `${nextId} →` : "末尾";
    nextBtn.title = nextId ? chunkTitleById(nextId) : "已经是最后一段";
  }
  if (planBtn) {
    if (plan && !state.planNextCache[plan.planId]) void hydratePlanNext(plan.planId);
    planBtn.disabled = !plan || !nextStep || !planLabel;
    planBtn.textContent = plan
      ? (planLabel ? `计划: ${planLabel}` : "计划加载中")
      : "无计划";
    planBtn.title = nextStep?.title || plan?.title || "";
  }
}

async function setImmersiveReading(enabled, { skipFullscreen = false } = {}) {
  state.immersiveReading = !!enabled;
  state.readingFocus = state.immersiveReading;
  document.body.classList.remove("reading-focus");
  if (state.immersiveReading) closeReaderToc();
  document.body.classList.toggle("immersive-reading", state.immersiveReading);
  if (!state.immersiveReading) {
    setImmersiveCleanRead(false);
    setImmersiveAssistantCollapsed(false);
    closeImmersiveLibrary();
    closeImmersivePlan();
  }
  if (state.immersiveReading) {
    setImmersiveCleanRead(true);
    setImmersiveAssistantCollapsed(true);
  }
  const button = $("immersiveReadingBtn");
  if (button) {
    button.textContent = state.immersiveReading ? "退出沉浸" : "沉浸";
    button.setAttribute("aria-pressed", state.immersiveReading ? "true" : "false");
  }
  renderFocusReadingButton();
  if (!skipFullscreen) {
    try {
      if (state.immersiveReading && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      } else if (!state.immersiveReading && document.fullscreenElement) {
        await document.exitFullscreen?.();
      }
    } catch {
      // 有些浏览器或自动化环境会拒绝全屏，界面级沉浸仍可继续使用。
    }
  }
  window.setTimeout(() => {
    updateReaderPageStatus();
    $("chunkText")?.focus();
  }, 80);
}

async function toggleReaderFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen?.();
    } else {
      await document.documentElement.requestFullscreen?.();
    }
    renderReaderFullscreenButtons();
  } catch {
    log("当前浏览器没有允许全屏。");
  }
}

function renderReaderFullscreenButtons() {
  const label = document.fullscreenElement ? "退出全屏" : "全屏";
  const focusButton = $("readerFocusFullscreenBtn");
  const immersiveButton = $("immersiveFullscreenBtn");
  if (focusButton) focusButton.textContent = label;
  if (immersiveButton) immersiveButton.textContent = label;
}

async function setReadingFocus(enabled, { fullscreen = false } = {}) {
  await setImmersiveReading(Boolean(enabled), { skipFullscreen: !fullscreen });
}

function renderFocusReadingButton() {
  const button = $("focusReadingBtn");
  if (!button) return;
  button.setAttribute("aria-pressed", state.immersiveReading ? "true" : "false");
  button.textContent = state.immersiveReading ? "退出沉浸" : "沉浸";
  button.title = state.immersiveReading ? "退出沉浸阅读" : "进入全屏沉浸阅读";
}

function toggleImmersiveCleanRead() {
  setImmersiveCleanRead(!document.body.classList.contains("immersive-clean-reading"));
}

function setImmersiveCleanRead(enabled) {
  const active = Boolean(enabled);
  if (active) {
    closeImmersiveFootprints();
    closeImmersiveToc();
    closeImmersiveLibrary();
    closeImmersivePlan();
  }
  document.body.classList.toggle("immersive-clean-reading", active);
  const button = $("immersiveCleanReadBtn");
  if (button) {
    button.textContent = active ? "显示控件" : "净读";
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
  const controlsButton = $("immersiveControlsBtn");
  if (controlsButton) {
    controlsButton.textContent = active ? "显示控件" : "隐藏控件";
    controlsButton.setAttribute("aria-pressed", active ? "false" : "true");
  }
}

function toggleImmersiveAssistant() {
  setImmersiveAssistantCollapsed(!document.body.classList.contains("immersive-assistant-collapsed"));
}

function setImmersiveAssistantCollapsed(enabled) {
  const active = Boolean(enabled);
  document.body.classList.toggle("immersive-assistant-collapsed", active);
  const button = $("immersiveAssistantBtn");
  if (button) {
    button.textContent = active ? "打开 Nova" : "收起 Nova";
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
  window.setTimeout(updateReaderPageStatus, 80);
}

function revealNovaForReadingAction() {
  if (state.immersiveReading && document.body.classList.contains("immersive-assistant-collapsed")) {
    setImmersiveAssistantCollapsed(false);
  }
  if (state.novaPaneCollapsed) setNovaPaneCollapsed(false);
}

function setNovaPaneCollapsed(collapsed) {
  state.novaPaneCollapsed = Boolean(collapsed);
  document.body.classList.toggle("nova-pane-collapsed", state.novaPaneCollapsed);
  const button = $("toggleNovaPaneBtn");
  if (button) {
    button.textContent = state.novaPaneCollapsed ? "打开 Nova" : "收起 Nova";
    button.setAttribute("aria-expanded", state.novaPaneCollapsed ? "false" : "true");
  }
  window.setTimeout(updateReaderPageStatus, 60);
}

function setNovaPaneWidth(width) {
  if (typeof width === "number") {
    const value = Math.max(320, Math.min(Math.round(window.innerWidth * 0.54), Math.round(width)));
    state.novaPaneWidth = "custom";
    document.body.dataset.novaPaneWidth = "custom";
    document.body.style.setProperty("--nova-pane-width", `${value}px`);
    localStorage.setItem(NOVA_PANE_WIDTH_KEY, String(value));
    window.setTimeout(updateReaderPageStatus, 60);
    return;
  }
  state.novaPaneWidth = width === "wide" ? "wide" : "medium";
  document.body.dataset.novaPaneWidth = state.novaPaneWidth;
  document.body.style.removeProperty("--nova-pane-width");
  localStorage.setItem(NOVA_PANE_WIDTH_KEY, state.novaPaneWidth);
  window.setTimeout(updateReaderPageStatus, 60);
}

function loadNovaPaneLayout() {
  const saved = localStorage.getItem(NOVA_PANE_WIDTH_KEY);
  const numeric = Number(saved);
  if (Number.isFinite(numeric) && numeric >= 280) {
    setNovaPaneWidth(numeric);
    return;
  }
  setNovaPaneWidth(saved === "wide" ? "wide" : "medium");
}

function setupNovaPaneResizer(handle) {
  if (!handle) return;
  const startResize = (event) => {
    if (state.novaPaneCollapsed || state.immersiveReading) return;
    event.preventDefault();
    document.body.classList.add("resizing-nova-pane");
    const onMove = (moveEvent) => {
      const workspace = $("mainContent");
      const rect = workspace?.getBoundingClientRect();
      const right = rect?.right || window.innerWidth;
      setNovaPaneWidth(right - moveEvent.clientX);
    };
    const onEnd = () => {
      document.body.classList.remove("resizing-nova-pane");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd, { once: true });
    window.addEventListener("pointercancel", onEnd, { once: true });
  };
  handle.addEventListener("pointerdown", startResize);
}

function loadReaderPlanStripState() {
  const saved = localStorage.getItem(READER_PLAN_STRIP_COLLAPSED_KEY);
  state.readerPlanStripCollapsed = saved === null ? true : saved === "true";
}

function setReaderPlanStripCollapsed(collapsed) {
  state.readerPlanStripCollapsed = Boolean(collapsed);
  localStorage.setItem(READER_PLAN_STRIP_COLLAPSED_KEY, String(state.readerPlanStripCollapsed));
  renderReaderPlanStrip();
}

function loadNovaAutoReadSetting() {
  const saved = localStorage.getItem(NOVA_AUTO_READ_KEY);
  state.novaAutoReadEnabled = saved === null ? true : saved === "true";
}

function setNovaAutoReadEnabled(enabled) {
  state.novaAutoReadEnabled = Boolean(enabled);
  localStorage.setItem(NOVA_AUTO_READ_KEY, String(state.novaAutoReadEnabled));
  const input = $("novaAutoReadToggle");
  if (input) input.checked = state.novaAutoReadEnabled;
  if (state.novaAutoReadEnabled) {
    maybeScheduleNovaAutonomousReading();
    maybeScheduleNovaBookScout();
  } else {
    window.clearTimeout(state.novaAutoReadTimer);
    window.clearTimeout(state.novaAutoBookScoutTimer);
  }
  renderNovaReply();
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

function normalizeNovaPreReadHistoryItem(item = {}) {
  const result = item.result && typeof item.result === "object" ? item.result : {};
  const bookId = String(item.bookId || result.bookId || "");
  const chunkId = String(item.chunkId || result.chunkId || result.chosenChunkId || "");
  const rawNote = item.note || item.text || result.note || result.content || "";
  if (looksLikeEmptySseNovaText(rawNote)) return null;
  const note = compactText(rawNote, 520);
  if (!bookId || !chunkId || !note || looksLikeEmptySseNovaText(note)) return null;
  const answeredAt = String(item.answeredAt || item.completedAt || item.updatedAt || new Date().toISOString());
  const answeredAtMs = Number(item.answeredAtMs || Date.parse(answeredAt) || Date.now());
  return {
    id: String(item.id || item.runId || `nova-pre-${bookId}-${chunkId}-${answeredAtMs}`),
    runId: String(item.runId || item.id || ""),
    bookId,
    bookTitle: String(item.bookTitle || result.bookTitle || ""),
    chunkId,
    title: String(item.title || item.chunkTitle || result.chunkTitle || chunkTitleById(chunkId) || chunkId),
    prompt: compactText(item.prompt || result.prompt || "", 240),
    note,
    backend: String(item.backend || result.backend || ""),
    model: String(item.model || result.model || ""),
    contextMode: "autonomous-reading",
    scope: String(item.scope || result.scope || ""),
    answeredAt,
    answeredAtMs,
  };
}

function applyNovaAgentRuns(runs = []) {
  state.novaAgentRuns = Array.isArray(runs) ? runs.slice(0, 80) : [];
  state.novaPreReadHistory = state.novaAgentRuns
    .filter((run) => run.action === "pre_read" && run.status === "success")
    .map(normalizeNovaPreReadHistoryItem)
    .filter(Boolean)
    .slice(0, 40);
}

function mergeNovaAgentRun(run) {
  if (!run?.id) return;
  applyNovaAgentRuns([
    run,
    ...state.novaAgentRuns.filter((item) => item.id !== run.id),
  ]);
}

function novaPreReadHistoryForBook(bookId = state.selectedBookId) {
  return state.novaPreReadHistory.filter((item) => item.bookId === bookId);
}

function novaPreReadHistoryForCurrentChunk() {
  const chunkId = currentReadingChunkId({ preferSelection: true });
  return state.novaPreReadHistory.filter((item) => item.bookId === state.selectedBookId && item.chunkId === chunkId);
}

function currentNovaPreReadPreview() {
  return novaPreReadHistoryForCurrentChunk()[0] || null;
}

function currentNovaBookScoutPreview() {
  return novaBookScoutHistoryForBook() || null;
}

function novaBookScoutHistoryForBook(bookId = state.selectedBookId) {
  return novaPreReadHistoryForBook(bookId).find((item) => item.scope === "book") || null;
}

function novaReplyBelongsToSelectedBook() {
  return Boolean(
    state.novaReply
    && state.novaReplyContext?.bookId === state.selectedBookId
    && state.novaReplyContext?.contextMode === "autonomous-reading"
  );
}

function novaPreReadDisplayContext(item = {}) {
  return {
    bookId: item.bookId || state.selectedBookId,
    chunkId: item.chunkId || currentReadingChunkId(),
    prompt: item.prompt || "Nova 自主预读",
    selection: "",
    selectionOffset: null,
    backend: item.backend || "",
    model: item.model || "",
    contextMode: "autonomous-reading",
    scope: item.scope || "",
    answeredAt: item.answeredAt || "",
  };
}

function currentNovaDisplay() {
  if (novaReplyBelongsToCurrentChunk()) {
    const isPreRead = state.novaReplyContext?.contextMode === "autonomous-reading";
    return {
      kind: isPreRead ? "pre-read" : "reply",
      text: state.novaReply,
      context: state.novaReplyContext,
      statusText: isPreRead ? "Nova 已先读" : "已回应",
      canUseReply: true,
    };
  }
  if (novaReplyBelongsToSelectedBook()) {
    return {
      kind: "pre-read",
      text: state.novaReply,
      context: state.novaReplyContext,
      statusText: state.novaReplyContext?.scope === "book" ? "Nova 已先看本书" : "Nova 已先读",
      canUseReply: true,
    };
  }
  const preRead = currentNovaPreReadPreview();
  if (preRead) {
    return {
      kind: "pre-read",
      text: preRead.note,
      context: novaPreReadDisplayContext(preRead),
      statusText: "Nova 已先读",
      canUseReply: true,
      historyId: preRead.id,
    };
  }
  const bookScout = currentNovaBookScoutPreview();
  if (bookScout) {
    return {
      kind: "pre-read",
      text: bookScout.note,
      context: novaPreReadDisplayContext(bookScout),
      statusText: "Nova 已先看本书",
      canUseReply: true,
      historyId: bookScout.id,
    };
  }
  return null;
}

function recordNovaPreReadReply(context, reply, run = null) {
  if (context?.contextMode !== "autonomous-reading") return;
  const selected = activeBook();
  const item = normalizeNovaPreReadHistoryItem({
    id: run?.id,
    runId: run?.id,
    bookId: context.bookId,
    bookTitle: selected?.bookId === context.bookId ? selected.title || selected.bookId : "",
    chunkId: context.chunkId,
    title: chunkTitleById(context.chunkId),
    prompt: context.prompt,
    note: reply,
    scope: context.scope || "",
    answeredAt: context.answeredAt,
  });
  if (!item) return;
  const next = [
    item,
    ...state.novaPreReadHistory.filter((saved) => !(saved.bookId === item.bookId && saved.chunkId === item.chunkId && saved.note === item.note)),
  ].slice(0, 40);
  state.novaPreReadHistory = next;
}

async function openNovaPreReadHistory(id, { selectTarget = false } = {}) {
  const item = state.novaPreReadHistory.find((historyItem) => historyItem.id === id);
  if (!item) {
    log("这条 Nova 预读历史已经不存在。");
    return;
  }
  if (selectTarget && item.bookId === state.selectedBookId && item.chunkId && item.chunkId !== state.selectedChunkId && isKnownChunkId(item.chunkId)) {
    await selectChunk(item.chunkId, true, { resetScroll: false });
  }
  state.novaAskPending = false;
  state.novaAskError = null;
  state.novaReply = item.note;
  state.novaReplyContext = {
    bookId: item.bookId,
    chunkId: item.chunkId,
    prompt: item.prompt || "Nova 自主预读历史",
    selection: "",
    selectionOffset: null,
    contextMode: "autonomous-reading",
    scope: item.scope || "",
    backend: item.backend || "",
    model: item.model || "",
    answeredAt: item.answeredAt,
  };
  state.readerNovaAsideOpen = true;
  renderNovaReply();
  renderReadingFootprints(readingFootprintRanges(currentChunkText()));
  log(`已回看 Nova 预读: ${item.chunkId}`);
}

function novaPreReadHistoryItemHtml(item) {
  const active = item.chunkId === currentReadingChunkId() ? " active" : "";
  const title = `${item.chunkId}${item.title && item.title !== item.chunkId ? ` · ${item.title}` : ""}`;
  return `
    <button class="nova-history-item${active}" type="button" data-nova-history-id="${escapeHtml(item.id)}">
      <span>${escapeHtml(item.scope === "book" ? "巡读" : "先读")} · ${escapeHtml(formatSavedAt(item.answeredAt) || "刚刚")}</span>
      <strong>${escapeHtml(title)}</strong>
      <small>${escapeHtml(compactText(item.note, 120))}</small>
    </button>
  `;
}

function renderNovaPreReadHistory() {
  const box = $("novaPreReadHistory");
  if (!box) return;
  const selected = activeBook();
  const items = selected
    ? novaPreReadHistoryForBook(selected.bookId)
      .filter((item) => item.id && item.note && item.chunkId)
      .slice(0, 5)
    : [];
  updateReaderFlowNovaMarks();
  if (!items.length) {
    box.className = "nova-history empty";
    box.textContent = selected ? "Nova 自主先读后，会在这里留下可回看的痕迹。" : "选择一本书后显示 Nova 先读记录。";
    return;
  }
  box.className = "nova-history";
  box.innerHTML = `
    <div class="nova-history-head">
      <span>Nova 读过</span>
      <small>${items.length} 条最近记录</small>
    </div>
    <div class="nova-history-list">${items.map(novaPreReadHistoryItemHtml).join("")}</div>
  `;
}

function novaPreReadMarkItemForChunk(chunkId) {
  if (!chunkId) return null;
  return state.novaPreReadHistory.find(
    (item) => item.id && item.note && item.scope !== "book" && item.bookId === state.selectedBookId && item.chunkId === chunkId
  ) || null;
}

function updateReaderFlowNovaMarks() {
  const chunkText = $("chunkText");
  if (!chunkText) return;
  chunkText.querySelectorAll(".reader-flow-chunk").forEach((section) => {
    const item = novaPreReadMarkItemForChunk(section.dataset.readerFlowChunkId);
    let mark = section.querySelector(".reader-flow-nova-mark");
    if (!item) {
      if (mark) mark.remove();
      return;
    }
    if (!mark) {
      mark = document.createElement("button");
      mark.type = "button";
      mark.className = "reader-flow-nova-mark";
      section.appendChild(mark);
    }
    mark.dataset.novaHistoryId = item.id;
    mark.textContent = "Nova 已读";
    mark.title = `回看 Nova 边注：${compactText(item.note, 80)}`;
  });
}

function highlightNovaPreReadHistoryItem(id) {
  const box = $("novaPreReadHistory");
  if (!box || !id) return;
  const target = box.querySelector(`button[data-nova-history-id="${CSS.escape(id)}"]`);
  if (!target) return;
  box.querySelectorAll(".nova-history-item.active").forEach((item) => item.classList.remove("active"));
  target.classList.add("active");
  target.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

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

function readBookReadingSessions() {
  try {
    const saved = JSON.parse(localStorage.getItem(READING_BOOK_SESSIONS_KEY) || "{}");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
}

function readSavedReadingSessionForBook(bookId) {
  if (!bookId) return null;
  const sessions = readBookReadingSessions();
  const hasBookSession = Object.prototype.hasOwnProperty.call(sessions, bookId);
  const saved = sessions[bookId];
  if (saved?.bookId === bookId && saved.chunkId) return saved;
  if (hasBookSession) return null;
  const legacy = readSavedReadingSession();
  return legacy?.bookId === bookId ? legacy : null;
}

function hasStoredReadingSessionForBook(bookId) {
  if (!bookId) return false;
  return Object.prototype.hasOwnProperty.call(readBookReadingSessions(), bookId);
}

function validSavedReadingSessionForBook(bookId) {
  const saved = readSavedReadingSessionForBook(bookId);
  if (!saved?.chunkId) return null;
  if (state.chunks.length && !state.chunks.some((chunk) => getChunkId(chunk) === saved.chunkId)) return null;
  return saved;
}

function clearSavedReadingSessionForBook(bookId) {
  if (!bookId) return;
  const sessions = readBookReadingSessions();
  delete sessions[bookId];
  localStorage.setItem(READING_BOOK_SESSIONS_KEY, JSON.stringify(sessions));
  const legacy = readSavedReadingSession();
  if (legacy?.bookId === bookId) localStorage.removeItem(READING_SESSION_KEY);
}

function normalizeReadingVisit(visit = {}) {
  const targetChunks = Math.max(1, Math.min(99, Number(visit.targetChunks || state.readingVisit?.targetChunks || 3)));
  return {
    bookId: String(visit.bookId || ""),
    startedAt: Number(visit.startedAt || 0),
    completedChunks: Math.max(0, Number(visit.completedChunks || 0)),
    targetChunks,
    endedAt: Number(visit.endedAt || 0),
  };
}

function loadReadingVisit() {
  try {
    state.readingVisit = normalizeReadingVisit(JSON.parse(localStorage.getItem(READING_VISIT_KEY) || "{}"));
  } catch {
    state.readingVisit = normalizeReadingVisit();
    localStorage.removeItem(READING_VISIT_KEY);
  }
}

function saveReadingVisit() {
  localStorage.setItem(READING_VISIT_KEY, JSON.stringify(normalizeReadingVisit(state.readingVisit)));
}

function readReadingVisitHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(READING_VISIT_HISTORY_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter((item) => item?.bookId && item.startedAt).slice(0, 20) : [];
  } catch {
    localStorage.removeItem(READING_VISIT_HISTORY_KEY);
    return [];
  }
}

function saveReadingVisitHistory(items) {
  localStorage.setItem(READING_VISIT_HISTORY_KEY, JSON.stringify(items.slice(0, 20)));
}

function readingVisitHistoryItem(book = activeBook()) {
  if (!book?.bookId) return null;
  const visit = normalizeReadingVisit(state.readingVisit);
  if (!visit.startedAt) return null;
  return {
    id: `visit-${book.bookId}-${visit.startedAt}`,
    bookId: book.bookId,
    bookTitle: book.title || book.bookId,
    currentChunkId: state.selectedChunkId || "",
    currentChunkTitle: chunkTitleById(state.selectedChunkId),
    startedAt: visit.startedAt,
    endedAt: visit.endedAt || Date.now(),
    completedChunks: visit.completedChunks,
    targetChunks: visit.targetChunks,
    summary: readingVisitCopySummary(book),
  };
}

function archiveReadingVisit(book = activeBook()) {
  const item = readingVisitHistoryItem(book);
  if (!item) return null;
  const history = readReadingVisitHistory().filter((existing) => existing.id !== item.id);
  history.unshift(item);
  saveReadingVisitHistory(history);
  return item;
}

function rememberRestartUndo(session) {
  if (!session?.bookId || !session.chunkId) return;
  if (state.restartUndoTimer) window.clearTimeout(state.restartUndoTimer);
  state.restartUndo = { ...session };
  state.restartUndoTimer = window.setTimeout(() => {
    state.restartUndo = null;
    state.restartUndoTimer = null;
    renderReadingSession();
  }, 5000);
}

async function undoRestartReadingSession() {
  const undo = state.restartUndo;
  if (!undo?.bookId || !undo.chunkId) return false;
  if (state.restartUndoTimer) window.clearTimeout(state.restartUndoTimer);
  state.restartUndoTimer = null;
  state.restartUndo = null;
  state.selectedBookId = undo.bookId;
  state.selectedChunkId = undo.chunkId;
  await loadChunks(undo.bookId);
  await readSelectedChunk();
  restoreSavedScroll(undo);
  renderAll();
  focusPanel(".reader-surface", "#chunkText");
  log(`已撤销从头读，回到: ${undo.bookTitle || undo.bookId} · ${undo.chunkId}`);
  return true;
}

function saveReadingSession(extra = {}) {
  const selected = activeBook();
  if (!selected || !state.selectedChunkId) return;
  ensureReadingVisit(selected.bookId);
  const chunkText = $("chunkText");
  const activeChunkId = extra.chunkId || currentReadingChunkId();
  const relativeScroll = Number(extra.scrollTop || 0) === 0 && Number(extra.scrollLeft || 0) === 0
    ? { relativeScrollTop: 0, relativeScrollLeft: 0 }
    : readerRelativeScroll(activeChunkId);
  const payload = {
    bookId: selected.bookId,
    bookTitle: selected.title || selected.bookId,
    chunkId: activeChunkId,
    scrollTop: Number(chunkText?.scrollTop || 0),
    scrollLeft: Number(chunkText?.scrollLeft || 0),
    readerMode: state.readerMode,
    scrollPercent: currentChunkScrollPercent(),
    savedAt: new Date().toISOString(),
    ...relativeScroll,
    ...extra
  };
  localStorage.setItem(READING_SESSION_KEY, JSON.stringify(payload));
  const sessions = readBookReadingSessions();
  sessions[selected.bookId] = payload;
  localStorage.setItem(READING_BOOK_SESSIONS_KEY, JSON.stringify(sessions));
}

function ensureReadingVisit(bookId = activeBook()?.bookId) {
  if (!bookId) return;
  if (state.readingVisit.bookId === bookId && state.readingVisit.startedAt && !state.readingVisit.endedAt) return;
  state.readingVisit = {
    bookId,
    startedAt: Date.now(),
    completedChunks: 0,
    targetChunks: state.readingVisit.targetChunks || 3,
    endedAt: 0,
  };
  saveReadingVisit();
}

function recordReadingVisitCompletion(bookId = activeBook()?.bookId) {
  ensureReadingVisit(bookId);
  state.readingVisit.completedChunks += 1;
  saveReadingVisit();
}

function setReadingVisitTarget(value) {
  const targetChunks = Math.max(1, Math.min(99, Number(value || 3)));
  state.readingVisit = normalizeReadingVisit({ ...state.readingVisit, targetChunks });
  saveReadingVisit();
  renderReadingSession();
  renderReadingNowBar();
  renderImmersiveActions({ hasChunk: !!activeBook() && !!state.selectedChunkId });
}

function endReadingVisit() {
  if (!state.readingVisit.startedAt) ensureReadingVisit();
  state.readingVisit = normalizeReadingVisit({ ...state.readingVisit, endedAt: Date.now() });
  saveReadingVisit();
  const archived = archiveReadingVisit(activeBook());
  renderReadingSession();
  renderReadingNowBar();
  renderReaderProgress();
  log(archived ? `已结束并归档本次阅读: ${archived.bookTitle} · ${archived.completedChunks}/${archived.targetChunks}` : `已结束本次阅读: ${readingVisitSummary(activeBook())}`);
}

function formatReadingVisitElapsed(startedAt = state.readingVisit.startedAt) {
  if (!startedAt) return "0 分钟";
  const minutes = Math.max(0, Math.floor((Date.now() - startedAt) / 60000));
  if (minutes < 1) return "刚开始";
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

function readingVisitSummary(book = activeBook()) {
  if (!book) return "本次未开始";
  ensureReadingVisit(book.bookId);
  const visit = state.readingVisit;
  const done = Math.max(0, Number(visit.completedChunks || 0));
  const target = Math.max(1, Number(visit.targetChunks || 3));
  const remaining = Math.max(0, target - done);
  const goal = remaining ? `目标还差 ${remaining} 段` : "已达成本次目标";
  const ended = visit.endedAt ? " · 已结束" : "";
  return `本次 ${formatReadingVisitElapsed(visit.startedAt)} · 已读 ${done}/${target} 段 · ${goal}${ended}`;
}

function readingVisitCopySummary(book = activeBook()) {
  if (!book?.bookId) throw new Error("请先选择一本书。");
  ensureReadingVisit(book.bookId);
  const visit = normalizeReadingVisit(state.readingVisit);
  const chunkTitle = chunkTitleById(state.selectedChunkId);
  return [
    `阅读会话: ${book.title || book.bookId}`,
    `bookId: ${book.bookId}`,
    `currentPosition: ${state.selectedChunkId || ""}${chunkTitle ? ` · ${chunkTitle}` : ""}`,
    `startedAt: ${visit.startedAt ? new Date(visit.startedAt).toISOString() : ""}`,
    `endedAt: ${visit.endedAt ? new Date(visit.endedAt).toISOString() : ""}`,
    `elapsed: ${formatReadingVisitElapsed(visit.startedAt)}`,
    `progressThisVisit: ${visit.completedChunks}/${visit.targetChunks}`,
    `bookProgress: ${progressPercent(book)}% · ${book.chunksRead || 0}/${book.chunkCount || state.chunks.length || 0} 段`,
    `summary: ${readingVisitSummary(book)}`,
  ].join("\n");
}

function readingVisitHistorySummary(item) {
  if (!item?.bookId) throw new Error("阅读历史记录无效。");
  return [
    `阅读会话: ${item.bookTitle || item.bookId}`,
    `bookId: ${item.bookId}`,
    `currentChunk: ${item.currentChunkId || ""}${item.currentChunkTitle ? ` · ${item.currentChunkTitle}` : ""}`,
    `startedAt: ${item.startedAt ? new Date(item.startedAt).toISOString() : ""}`,
    `endedAt: ${item.endedAt ? new Date(item.endedAt).toISOString() : ""}`,
    `progressThisVisit: ${item.completedChunks || 0}/${item.targetChunks || 0}`,
    "",
    item.summary || "",
  ].join("\n").trim();
}

function renderReadingVisitHistory() {
  const list = $("sessionHistoryList");
  if (!list) return;
  const selected = activeBook();
  const history = readReadingVisitHistory().filter((item) => !selected || item.bookId === selected.bookId).slice(0, 5);
  if (!history.length) {
    list.className = "session-history empty";
    list.textContent = "结束一次阅读后会保留最近记录。";
    return;
  }
  list.className = "session-history";
  list.innerHTML = history.map((item) => {
    const ended = item.endedAt ? formatSavedAt(new Date(item.endedAt).toISOString()) : "";
    const chunk = item.currentChunkId ? ` · ${escapeHtml(item.currentChunkId)}` : "";
    return `<article class="session-history-row">
      <div>
        <strong>${escapeHtml(item.bookTitle || item.bookId)}${chunk}</strong>
        <small>${escapeHtml(ended || "刚刚")} · 已读 ${escapeHtml(item.completedChunks || 0)}/${escapeHtml(item.targetChunks || 0)} 段</small>
      </div>
      <div>
        <button class="secondary compact" type="button" data-session-history-action="copy" data-session-history-id="${escapeHtml(item.id)}">复制</button>
        <button class="secondary compact" type="button" data-session-history-action="sink" data-session-history-id="${escapeHtml(item.id)}">沉淀</button>
      </div>
    </article>`;
  }).join("");
}

function readingVisitReviewPayload(book = activeBook()) {
  if (!book?.bookId || !state.selectedChunkId) throw new Error("请先选择一本书和当前段落。");
  ensureReadingVisit(book.bookId);
  const visit = normalizeReadingVisit(state.readingVisit);
  const targets = currentChunkSinkTargets();
  const summary = readingVisitCopySummary(book);
  return {
    command: "review_create",
    bookId: book.bookId,
    startChunkId: state.selectedChunkId,
    endChunkId: state.selectedChunkId,
    summary: [
      `本次阅读沉淀：${book.title || book.bookId}`,
      readingVisitSummary(book),
      `当前位置：${state.selectedChunkId}${chunkTitleById(state.selectedChunkId) ? ` · ${chunkTitleById(state.selectedChunkId)}` : ""}`,
    ].join("\n"),
    observations: [
      {
        section: "reading_visit",
        source: "browser-reading-visit",
        kind: "session-summary",
        chunkId: state.selectedChunkId,
        quote: state.selectedChunkId,
        note: summary,
        text: summary,
        startedAt: visit.startedAt ? new Date(visit.startedAt).toISOString() : "",
        endedAt: visit.endedAt ? new Date(visit.endedAt).toISOString() : "",
        completedChunks: visit.completedChunks,
        targetChunks: visit.targetChunks,
      }
    ],
    tags: ["co-reading", "sidecar", "reading-visit"],
    sinkPolicy: {
      requireApproval: true,
      obsidian: targets.includes("obsidian"),
      obs: targets.includes("obs"),
      dailyNote: targets.includes("dailyNote"),
      vcpMemory: targets.includes("vcpMemory"),
    },
    createdBy: "CoReadingSidecar",
  };
}

function readingVisitHistoryReviewPayload(item) {
  if (!item?.bookId || !item.currentChunkId) throw new Error("阅读历史缺少书籍或段落。");
  const targets = currentChunkSinkTargets();
  const summary = readingVisitHistorySummary(item);
  return {
    command: "review_create",
    bookId: item.bookId,
    startChunkId: item.currentChunkId,
    endChunkId: item.currentChunkId,
    summary: [
      `历史阅读沉淀：${item.bookTitle || item.bookId}`,
      `本次已读 ${item.completedChunks || 0}/${item.targetChunks || 0} 段`,
      `结束位置：${item.currentChunkId}${item.currentChunkTitle ? ` · ${item.currentChunkTitle}` : ""}`,
    ].join("\n"),
    observations: [
      {
        section: "reading_visit_history",
        source: "browser-reading-visit-history",
        kind: "session-summary",
        chunkId: item.currentChunkId,
        quote: item.currentChunkId,
        note: summary,
        text: summary,
      }
    ],
    tags: ["co-reading", "sidecar", "reading-visit-history"],
    sinkPolicy: {
      requireApproval: true,
      obsidian: targets.includes("obsidian"),
      obs: targets.includes("obs"),
      dailyNote: targets.includes("dailyNote"),
      vcpMemory: targets.includes("vcpMemory"),
    },
    createdBy: "CoReadingSidecar",
  };
}

async function createReadingVisitSinkPreview(item = null) {
  const selected = activeBook();
  const reviewResult = await command(item ? readingVisitHistoryReviewPayload(item) : readingVisitReviewPayload(selected));
  const review = reviewResult.data?.review || reviewResult.raw?.review || reviewResult.review || reviewResult.fullReview || null;
  const reviewId = review?.reviewId || reviewResult.data?.reviewId || reviewResult.raw?.reviewId || reviewResult.reviewId;
  if (!reviewId) throw new Error("已创建本次阅读评价，但没有返回 reviewId。");
  const previewResult = await command({
    command: "sink_preview_create",
    reviewId,
    targets: currentChunkSinkTargets(),
    requireApproval: true,
    ...sinkDestinationPayload(),
    createdBy: "CoReadingSidecar",
  });
  const opened = await openPreviewFromResult(previewResult, { refreshSnapshot: true });
  if (!opened) await loadSnapshot();
  renderReadingSession();
  renderReaderProgress();
  focusPanel(".sink-detail", "#sinkPreviewContent");
  log(`已生成${item ? "历史" : "本次"}阅读沉淀预览: ${reviewId}`);
  return { reviewId, previewResult };
}

function restoreSavedScroll(saved) {
  if (!saved || saved.bookId !== state.selectedBookId || saved.chunkId !== state.selectedChunkId) return;
  const chunkText = $("chunkText");
  if (!chunkText) return;
  window.setTimeout(() => {
    if (saved.readerMode) setReaderMode(saved.readerMode, { persist: false });
    const section = saved.chunkId
      ? chunkText.querySelector(`.reader-flow-chunk[data-reader-flow-chunk-id="${CSS.escape(saved.chunkId)}"]`)
      : null;
    chunkText.scrollTop = section
      ? Number(section.offsetTop || 0) + Number(saved.relativeScrollTop || 0)
      : Number(saved.scrollTop || 0);
    chunkText.scrollLeft = section
      ? Number(section.offsetLeft || 0) + Number(saved.relativeScrollLeft || 0)
      : Number(saved.scrollLeft || 0);
    setReaderActiveChunkId(saved.chunkId || state.selectedChunkId);
    highlightActiveReaderFlowChunk();
    saveReadingSession();
    updateReaderPageStatus();
  }, 80);
}

function hasSavedReadingSession() {
  const saved = readSavedReadingSession();
  const sessions = readBookReadingSessions();
  return !!saved && state.snapshot?.books?.some((book) => book.bookId === saved.bookId)
    || state.snapshot?.books?.some((book) => sessions[book.bookId]?.chunkId);
}

function showTestBooks() {
  return localStorage.getItem(LIBRARY_SHOW_TEST_BOOKS_KEY) === "true";
}

function setShowTestBooks(value) {
  localStorage.setItem(LIBRARY_SHOW_TEST_BOOKS_KEY, value ? "true" : "false");
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function isTestBook(book) {
  const text = [book?.bookId, book?.title, book?.author].filter(Boolean).join(" ");
  return TEST_BOOK_RE.test(text);
}

function visibleBooks() {
  const books = state.snapshot?.books || [];
  return showTestBooks() ? books : books.filter((book) => !isTestBook(book));
}

function normalizeBookTitleKey(book) {
  const title = String(book?.title || book?.bookId || "").trim().toLocaleLowerCase("zh-CN");
  const author = String(book?.author || "").trim().toLocaleLowerCase("zh-CN");
  return `${title}::${author}`;
}

function duplicateBookIndex(books = visibleBooks()) {
  const groups = new Map();
  for (const book of books) {
    const key = normalizeBookTitleKey(book);
    if (!key || key === "::") continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(book.bookId);
  }
  return groups;
}

function duplicateBookLabel(book, groups = duplicateBookIndex()) {
  const group = groups.get(normalizeBookTitleKey(book)) || [];
  if (group.length <= 1) return "";
  const index = group.indexOf(book.bookId);
  return `重复 ${group.length} 本 · 当前 ${index >= 0 ? index + 1 : 1}/${group.length}`;
}

function chooseInitialBook(snapshot, saved) {
  const books = (snapshot?.books || []).filter((book) => showTestBooks() || !isTestBook(book));
  if (!books.length) return null;
  const byId = new Map(books.map((book) => [book.bookId, book]));
  if (state.selectedBookId && byId.has(state.selectedBookId)) return byId.get(state.selectedBookId);
  if (saved?.bookId && byId.has(saved.bookId)) return byId.get(saved.bookId);
  const sessions = readBookReadingSessions();
  const sessionBookId = Object.values(sessions)
    .filter((session) => session?.bookId && byId.has(session.bookId))
    .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")))[0]?.bookId;
  if (sessionBookId) return byId.get(sessionBookId);
  const recentlyRead = books
    .filter((book) => book.lastReadAt || book.lastChunkId)
    .sort((a, b) => (Date.parse(b.lastReadAt || "") || 0) - (Date.parse(a.lastReadAt || "") || 0))[0];
  if (recentlyRead) return recentlyRead;
  const activePlan = (snapshot?.plans || [])
    .filter((plan) => plan.status === "active" && byId.has(plan.bookId))
    .sort((a, b) => planUpdatedAt(b) - planUpdatedAt(a))[0];
  return activePlan ? byId.get(activePlan.bookId) : books[0];
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

function bookmarkForChunk(chunkId, bookId = state.selectedBookId) {
  if (!chunkId) return null;
  return bookmarksForBook(bookId).find((item) => item.chunkId === chunkId) || null;
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
  const chunkText = $("chunkText");
  const pageStep = readerPageStep(chunkText);
  const pageTotal = state.readerMode === "paged" && chunkText
    ? Math.max(1, Math.ceil(chunkText.scrollWidth / Math.max(1, pageStep)))
    : 1;
  const pageCurrent = state.readerMode === "paged" && chunkText
    ? Math.min(pageTotal, Math.max(1, Math.round(Number(chunkText.scrollLeft || 0) / pageStep) + 1))
    : 1;
  const current = {
    bookId: selected.bookId,
    bookTitle: selected.title || selected.bookId,
    chunkId: state.selectedChunkId,
    title: chunkTitleById(state.selectedChunkId),
    scrollTop: Number(chunkText?.scrollTop || 0),
    scrollLeft: Number(chunkText?.scrollLeft || 0),
    readerMode: state.readerMode,
    scrollPercent: currentChunkScrollPercent(),
    pageCurrent,
    pageTotal,
    savedAt: new Date().toISOString(),
  };
  const existing = bookmarks[selected.bookId] || [];
  bookmarks[selected.bookId] = [current, ...existing.filter((item) => item.chunkId !== current.chunkId)].slice(0, 24);
  localStorage.setItem(READING_BOOKMARKS_KEY, JSON.stringify(bookmarks));
  return current;
}

function bookmarkMeta(bookmark) {
  if (!bookmark) return "";
  const parts = [];
  if (bookmark.readerMode === "paged" && bookmark.pageCurrent) {
    parts.push(`第 ${bookmark.pageCurrent}/${bookmark.pageTotal || "?"} 页`);
  } else if (Number.isFinite(Number(bookmark.scrollPercent))) {
    parts.push(`段内 ${clampPercent(bookmark.scrollPercent)}%`);
  }
  const saved = formatSavedAt(bookmark.savedAt);
  if (saved) parts.push(saved);
  return parts.join(" · ");
}

function renderImmersiveBookmarks() {
  const saveButton = $("immersiveBookmarkBtn");
  const openButton = $("immersiveLastBookmarkBtn");
  const status = $("immersiveBookmarkStatus");
  if (!saveButton || !openButton || !status) return;
  const selected = activeBook();
  const latest = bookmarksForBook(selected?.bookId)[0];
  const canBookmark = Boolean(selected && state.selectedChunkId);
  saveButton.disabled = !canBookmark;
  openButton.disabled = !latest?.chunkId;
  status.textContent = latest?.chunkId
    ? `${latest.chunkId}${bookmarkMeta(latest) ? ` · ${bookmarkMeta(latest)}` : ""}`
    : "暂无书签";
}

function saveImmersiveBookmark() {
  const bookmark = saveBookmarkForCurrentChunk();
  renderReaderProgress();
  renderImmersiveBookmarks();
  log(bookmark ? `已插入书签: ${bookmark.chunkId}${bookmarkMeta(bookmark) ? ` · ${bookmarkMeta(bookmark)}` : ""}` : "请先选择一本书和 chunk。");
}

async function openImmersiveLastBookmark() {
  const bookmark = bookmarksForBook()[0];
  if (!bookmark?.chunkId) return;
  await selectChunk(bookmark.chunkId, true);
  restoreSavedScroll(bookmark);
  renderImmersiveBookmarks();
  focusPanel(".reader-surface", "#chunkText");
  log(`已打开最近书签: ${bookmark.chunkId}${bookmarkMeta(bookmark) ? ` · ${bookmarkMeta(bookmark)}` : ""}`);
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
  return [$("vaultPath"), $("dailyNoteRoot"), $("vcpMemoryRoot"), $("obsOutputDir")].filter(Boolean);
}

function sinkSettingsPayload() {
  return {
    vaultPath: $("vaultPath")?.value.trim() || "",
    dailyNoteRoot: $("dailyNoteRoot")?.value.trim() || "",
    vcpMemoryRoot: $("vcpMemoryRoot")?.value.trim() || "",
    obsOutputDir: $("obsOutputDir")?.value.trim() || "",
  };
}

function sinkDestinationPayload() {
  const settings = sinkSettingsPayload();
  return {
    vaultPath: settings.vaultPath || undefined,
    dailyNoteRoot: settings.dailyNoteRoot || undefined,
    vcpMemoryRoot: settings.vcpMemoryRoot || undefined,
    obsOutputDir: settings.obsOutputDir || undefined,
  };
}

function sinkSettingsSummary() {
  const settings = sinkSettingsPayload();
  return [
    "CoReading 沉淀路径",
    "",
    `vaultPath: ${settings.vaultPath}`,
    `dailyNoteRoot: ${settings.dailyNoteRoot}`,
    `vcpMemoryRoot: ${settings.vcpMemoryRoot}`,
    `obsOutputDir: ${settings.obsOutputDir}`
  ].join("\n");
}

function saveSinkSettings() {
  localStorage.setItem(SINK_SETTINGS_KEY, JSON.stringify(sinkSettingsPayload()));
}

function applySinkSettings(settings, { overwrite = false } = {}) {
  if (settings.vaultPath && (overwrite || !$("vaultPath").value)) $("vaultPath").value = settings.vaultPath;
  if (settings.dailyNoteRoot && (overwrite || !$("dailyNoteRoot").value)) $("dailyNoteRoot").value = settings.dailyNoteRoot;
  if (settings.vcpMemoryRoot && (overwrite || !$("vcpMemoryRoot").value)) $("vcpMemoryRoot").value = settings.vcpMemoryRoot;
  if (settings.obsOutputDir && (overwrite || !$("obsOutputDir").value)) $("obsOutputDir").value = settings.obsOutputDir;
}

function sinkPreviewTarget(preview) {
  return String(preview?.target || preview?.destination?.type || "").trim();
}

function sinkPreviewNeedsVaultPath(preview) {
  return sinkPreviewTarget(preview).toLowerCase() === "obsidian";
}

function applyPreviewVaultPath(preview) {
  const vaultPath = String(preview?.destination?.vaultPath || "").trim();
  if (vaultPath && !$("vaultPath").value.trim()) {
    $("vaultPath").value = vaultPath;
    saveSinkSettings();
  }
  return $("vaultPath").value.trim();
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

async function loadAgentSkills() {
  try {
    const result = await api("/api/agent/skills");
    state.agentSkills = Array.isArray(result.skills) ? result.skills : [];
  } catch {
    state.agentSkills = [];
  }
  renderSkillOverview();
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
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.status === "error") {
    const error = new Error(data.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
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

function parseJsonishText(text) {
  if (Array.isArray(text) || (text && typeof text === "object")) return text;
  const raw = String(text || "").trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return JSON.parse(fenced[1]);
  if (raw.startsWith("{") || raw.startsWith("[")) return JSON.parse(raw);
  const objectStart = raw.indexOf("{");
  const objectEnd = raw.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) return JSON.parse(raw.slice(objectStart, objectEnd + 1));
  const arrayStart = raw.indexOf("[");
  const arrayEnd = raw.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) return JSON.parse(raw.slice(arrayStart, arrayEnd + 1));
  return null;
}

function commandData(result) {
  if (result?.data !== null && result?.data !== undefined) return result.data;
  if (typeof result?.raw !== "string") return result?.data;
  try {
    return parseJsonishText(result.raw) ?? result.data;
  } catch {
    return result.data;
  }
}

async function query(payload) {
  const result = await api("/api/command", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return commandData(result);
}

async function withNovaRequest(task, { timeoutMs = NOVA_REQUEST_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await task(controller.signal);
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(`Nova 请求超过 ${Math.round(timeoutMs / 1000)} 秒仍未返回。`);
      timeoutError.code = "NOVA_TIMEOUT";
      timeoutError.timeoutMs = timeoutMs;
      throw timeoutError;
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function askNova(payload) {
  return withNovaRequest((signal) => api("/api/nova/ask", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      maxAttempts: 1,
      clientTimeoutMs: NOVA_REQUEST_TIMEOUT_MS,
    }),
    signal,
  }));
}

async function runNovaAgent(payload) {
  return withNovaRequest((signal) => api("/api/agent/run", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      clientTimeoutMs: NOVA_REQUEST_TIMEOUT_MS,
    }),
    signal,
  }));
}

function activeBook() {
  const books = visibleBooks();
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

const FRONT_MATTER_CHUNK_RE = /^(cover|封面|封底|扉页|版权|题献|目录|插图目录|更新记录)$/i;

function chunkReadableSize(chunk) {
  return Math.max(Number(chunk?.charCount || 0), Number(chunk?.wordCount || 0));
}

function normalizedChunkTitle(chunk) {
  return String(chunk?.title || chunk?.sectionTitle || "").replace(/\s+Part\s+\d+\/\d+$/i, "").trim();
}

function isPreferredReadingChunk(chunk) {
  const title = normalizedChunkTitle(chunk);
  if (!getChunkId(chunk) || FRONT_MATTER_CHUNK_RE.test(title)) return false;
  return chunkReadableSize(chunk) >= 600;
}

function preferredReadingChunkIdFrom(startIndex = 0) {
  const start = Math.max(0, Number(startIndex) || 0);
  const preferred = state.chunks.slice(start).find(isPreferredReadingChunk);
  return getChunkId(preferred) || getChunkId(state.chunks[start]) || getChunkId(state.chunks[0]);
}

function nextUnreadChunkId(book) {
  if (!book || !state.chunks.length) return "";
  const lastIndex = chunkOrder(book.lastChunkId);
  if (lastIndex !== null && state.chunks[lastIndex + 1]) return preferredReadingChunkIdFrom(lastIndex + 1);
  const selected = state.chunks.find((chunk) => getChunkId(chunk) === state.selectedChunkId);
  if (isPreferredReadingChunk(selected)) return state.selectedChunkId;
  return preferredReadingChunkIdFrom();
}

function planPercent(plan) {
  if (!plan.stepCount) return 0;
  return Math.min(100, Math.round((Number(plan.currentStepIndex || 0) / Number(plan.stepCount)) * 100));
}

function currentChunkScrollPercent() {
  const scrollEl = $("chunkText");
  const horizontal = state.readerMode === "paged";
  const scrollMax = horizontal
    ? Math.max(0, Number(scrollEl?.scrollWidth || 0) - Number(scrollEl?.clientWidth || 0))
    : Math.max(0, Number(scrollEl?.scrollHeight || 0) - Number(scrollEl?.clientHeight || 0));
  const scrollValue = horizontal ? Number(scrollEl?.scrollLeft || 0) : Number(scrollEl?.scrollTop || 0);
  return scrollMax ? clampPercent((scrollValue / scrollMax) * 100) : 0;
}

function activeChunkIdFromViewport() {
  const chunkText = $("chunkText");
  const sections = chunkText ? Array.from(chunkText.querySelectorAll(".reader-flow-chunk")) : [];
  if (!chunkText || !sections.length) return state.selectedChunkId;
  const target = Number(chunkText.scrollTop || 0) + Math.max(32, Number(chunkText.clientHeight || 0) * 0.28);
  let active = sections[0];
  for (const section of sections) {
    if (Number(section.offsetTop || 0) <= target) active = section;
    else break;
  }
  return active?.dataset?.readerFlowChunkId || state.selectedChunkId;
}

function highlightActiveReaderFlowChunk() {
  const activeId = currentReadingChunkId();
  document.querySelectorAll(".reader-flow-chunk.active").forEach((item) => {
    if (item.dataset.readerFlowChunkId !== activeId) item.classList.remove("active");
  });
  const active = activeId
    ? document.querySelector(`.reader-flow-chunk[data-reader-flow-chunk-id="${CSS.escape(activeId)}"]`)
    : null;
  if (active) active.classList.add("active");
}

function syncReaderActiveChunkFromScroll({ render = true } = {}) {
  const activeId = activeChunkIdFromViewport();
  const changed = setReaderActiveChunkId(activeId);
  highlightActiveReaderFlowChunk();
  const chunkSelect = $("chunkSelect");
  if (changed && chunkSelect && activeId && chunkSelect.value !== activeId) chunkSelect.value = activeId;
  if (!changed || !render) return changed;
  renderReaderProgress();
  renderChunkReview();
  renderNovaReply();
  if (state.novaAutoReadEnabled) maybeScheduleNovaAutonomousReading();
  return changed;
}

function handleReaderScroll() {
  const changed = syncReaderActiveChunkFromScroll({ render: false });
  if (state.immersiveReading && state.readerSelection?.text) renderSelectionDock();
  saveReadingSession();
  renderReaderProgress();
  updateReaderPageStatus();
  if (changed) {
    renderChunkReview();
    renderNovaReply();
    if (state.novaAutoReadEnabled) maybeScheduleNovaAutonomousReading();
  }
}

function readerActiveChunkOrder() {
  return chunkOrder(currentReadingChunkId());
}

function readerActiveChunkTitle() {
  return chunkTitleById(currentReadingChunkId());
}

function activeReaderFlowSection() {
  const chunkText = $("chunkText");
  if (!chunkText) return null;
  const id = currentReadingChunkId();
  return id ? chunkText.querySelector(`.reader-flow-chunk[data-reader-flow-chunk-id="${CSS.escape(id)}"]`) : null;
}

function readerRelativeScroll(chunkId = currentReadingChunkId()) {
  const chunkText = $("chunkText");
  const section = chunkId
    ? chunkText?.querySelector(`.reader-flow-chunk[data-reader-flow-chunk-id="${CSS.escape(chunkId)}"]`)
    : activeReaderFlowSection();
  if (!chunkText || !section) return {};
  return {
    relativeScrollTop: Math.max(0, Number(chunkText.scrollTop || 0) - Number(section.offsetTop || 0)),
    relativeScrollLeft: Math.max(0, Number(chunkText.scrollLeft || 0) - Number(section.offsetLeft || 0)),
  };
}

function renderReadingSession() {
  const selected = activeBook();
  const title = $("sessionTitle");
  const meta = $("sessionMeta");
  const kicker = $("sessionKicker");
  const hasBook = !!selected;
  const bookSession = validSavedReadingSessionForBook(selected?.bookId);
  const canUndoRestart = !!state.restartUndo && state.restartUndo.bookId === selected?.bookId;
  $("sessionResumeBtn").disabled = !bookSession;
  $("sessionResumeBtn").textContent = bookSession?.chunkId ? "回现场" : "回现场";
  $("sessionContinueBtn").disabled = !hasBook;
  $("sessionContinueBtn").textContent = bookSession?.chunkId ? "继续读" : "继续读";
  $("sessionRestartBtn").disabled = !hasBook;
  $("sessionRestartBtn").textContent = canUndoRestart ? "撤销从头读" : "从头读";
  $("sessionScoutNovaBtn").disabled = !hasBook || state.novaAskPending;
  $("sessionAskNovaBtn").disabled = !hasBook || !state.selectedChunkId;
  $("sessionNoteBtn").disabled = !hasBook || !state.selectedChunkId;
  $("sessionCopySummaryBtn").disabled = !hasBook;
  $("sessionSinkVisitBtn").disabled = !hasBook || !state.selectedChunkId;
  $("sessionEndVisitBtn").disabled = !hasBook || !state.readingVisit.startedAt || !!state.readingVisit.endedAt;
  $("sessionTargetInput").disabled = !hasBook;
  $("sessionTargetInput").value = String(Math.max(1, Number(state.readingVisit.targetChunks || 3)));
  if (!selected) {
    kicker.textContent = "当前阅读";
    title.textContent = "还没有选书";
    meta.textContent = "导入或选择一本书开始。";
    renderReadingVisitHistory();
    return;
  }
  const percent = progressPercent(selected);
  const nextId = nextUnreadChunkId(selected);
  const nextTitle = chunkTitleById(nextId);
  const visitSummary = readingVisitSummary(selected);
  kicker.textContent = `${percent}% · ${selected.chunksRead || 0}/${selected.chunkCount || 0} 段`;
  title.textContent = selected.title || selected.bookId;
  meta.textContent = bookSession
    ? `继续阅读上次位置${formatSavedAt(bookSession.savedAt) ? ` · ${formatSavedAt(bookSession.savedAt)}` : ""} · ${visitSummary}`
    : (nextId ? `下一段${nextTitle ? ` · ${nextTitle}` : ""} · ${visitSummary}` : `这本书暂时没有可继续的段落。 · ${visitSummary}`);
  renderReadingVisitHistory();
}

function renderReadingNowBar({ scrollPercent = currentChunkScrollPercent() } = {}) {
  const bar = $("readingNowBar");
  if (!bar) return;
  const selected = activeBook();
  const activeChunkId = currentReadingChunkId();
  const index = chunkOrder(activeChunkId);
  const hasChunk = !!selected && index !== null;
  const currentTitle = chunkTitleById(activeChunkId);
  const bookSession = validSavedReadingSessionForBook(selected?.bookId);
  const { plan, nextStep } = planGuideSelection();
  const planLabel = nextStep ? planStepChunkLabel(nextStep) : "";
  const visitSummary = selected ? readingVisitSummary(selected) : "";
  bar.classList.toggle("empty", !selected);
  $("readingNowKicker").textContent = selected
    ? `${progressPercent(selected)}% · ${selected.chunksRead || 0}/${selected.chunkCount || state.chunks.length || 0} 段`
    : "阅读现场";
  $("readingNowTitle").textContent = selected
    ? `${selected.title || selected.bookId}`
    : "还没有选书";
  $("readingNowMeta").textContent = hasChunk
    ? `${index + 1}/${state.chunks.length} · ${currentTitle || "当前位置"} · 书内 ${clampPercent(scrollPercent)}%${bookSession?.chunkId ? " · 有断点" : ""}${planLabel ? ` · 下一步 ${planLabel}` : ""}${visitSummary ? ` · ${visitSummary}` : ""}`
    : "选择书籍后可以随时回到正文。";
  $("readingNowFocusBtn").disabled = !hasChunk;
  $("readingNowContinueBtn").disabled = !selected;
  $("readingNowContinueBtn").textContent = bookSession?.chunkId ? "继续读" : "继续读";
  $("readingNowPlanBtn").disabled = !selected || (!plan && !currentSectionRange()) || (plan && !nextStep);
  $("readingNowPlanBtn").textContent = plan ? "计划下一步" : "建本章计划";
  $("readingNowAskBtn").disabled = !hasChunk;
  $("readingNowNoteBtn").disabled = !hasChunk;
}

function countCardsForBook(book = activeBook()) {
  return [...state.cardInbox, ...cardCollectionItems()].filter((card) => !book || !card.bookId || card.bookId === book.bookId).length;
}

function cardsForCurrentChunk() {
  const activeChunkId = currentReadingChunkId();
  return [...state.cardInbox, ...cardCollectionItems()].filter((card) => {
    if (!card) return false;
    if (card.bookId && card.bookId !== state.selectedBookId) return false;
    if (card.chunkId) return card.chunkId === activeChunkId;
    const title = chunkTitleById(activeChunkId);
    const haystack = [card.subtitle, card.title, card.kicker, card.message].filter(Boolean).join(" ");
    return Boolean(activeChunkId && haystack.includes(activeChunkId)) || Boolean(title && haystack.includes(title));
  });
}

function sinkPreviewsForCurrentChunk() {
  const activeChunkId = currentReadingChunkId();
  return visibleSinkPreviewsForBook(activeBook()).filter((preview) => {
    const source = preview.sourceRange || preview.range || {};
    const notePath = preview.destination?.notePath || preview.notePath || "";
    return preview.chunkId === activeChunkId
      || source.startChunkId === activeChunkId
      || source.endChunkId === activeChunkId
      || notePath.includes(activeChunkId);
  });
}

function renderReaderProgress() {
  const selected = activeBook();
  const activeChunkId = currentReadingChunkId();
  const index = chunkOrder(activeChunkId);
  const hasChunk = !!selected && index !== null;
  const percent = progressPercent(selected);
  const saved = readSavedReadingSession();
  const bookSession = validSavedReadingSessionForBook(selected?.bookId);
  const nextChunk = hasChunk ? state.chunks[index + 1] : null;
  const nextId = getChunkId(nextChunk);
  const pendingCount = pendingSinkPreviewsForBook(selected).length;
  const currentChunkPendingSink = sinkPreviewsForCurrentChunk().find((preview) => preview.status === "pending") || null;
  const currentChunkApprovedSink = sinkPreviewsForCurrentChunk().find((preview) => preview.status === "approved") || null;
  const cardCountForBook = countCardsForBook(selected);
  const currentTitle = chunkTitleById(activeChunkId);
  const nextTitle = chunkTitleById(nextId);
  const scrollPercent = currentChunkScrollPercent();

  $("readerProgressValue").textContent = selected
    ? `${percent}% · ${selected.chunksRead || 0}/${selected.chunkCount || state.chunks.length || 0} 段`
    : "未开始";
  $("readerProgressFill").style.width = `${clampPercent(percent)}%`;
  $("readerResumeHint").textContent = selected
    ? `${hasChunk ? `当前 ${index + 1}/${state.chunks.length}` : "未选择段落"}${bookSession ? ` · 有断点${formatSavedAt(bookSession.savedAt) ? ` · ${formatSavedAt(bookSession.savedAt)}` : ""}` : ""}${saved?.bookId && saved.bookId !== selected.bookId ? ` · 最近读过 ${saved.bookTitle || saved.bookId}` : ""}`
    : "选择书籍后显示当前断点。";
  $("readerChunkMeta").textContent = hasChunk
    ? `${selected.title || selected.bookId} · ${index + 1}/${state.chunks.length}${currentTitle ? ` · ${currentTitle}` : ""}${scrollPercent ? ` · 书内 ${scrollPercent}%` : ""}`
    : "还没有阅读现场。";
  $("readerNextTitle").textContent = selected
    ? (nextId ? `下一段${nextTitle ? ` · ${nextTitle}` : ""}` : "已经到最后一段。")
    : "选择书籍后继续。";
  $("readerNextBtn").textContent = nextId ? "读完并下一段" : "标记读完";
  $("readerNextBtn").disabled = !selected || !state.selectedChunkId;
  const lastCompleted = state.lastCompletedChunk;
  const canReviewLast = !!lastCompleted?.chunkId && lastCompleted.bookId === selected?.bookId;
  const canResumeNext = canReviewLast && state.selectedChunkId === lastCompleted.chunkId && !!lastCompleted.nextChunkId;
  $("readerReviewLastBtn").disabled = !canReviewLast || state.selectedChunkId === lastCompleted.chunkId;
  $("readerReviewLastBtn").textContent = canReviewLast ? "回看刚读" : "回看刚读";
  $("readerResumeNextBtn").disabled = !canResumeNext;
  $("readerResumeNextBtn").textContent = canResumeNext ? "继续读" : "回到继续读";
  $("readerAskNovaBtn").disabled = !selected || !state.selectedChunkId;
  $("readerOpenSinkBtn").disabled = !selected;
  $("readerOpenSinkBtn").textContent = pendingCount ? `看沉淀 ${pendingCount}` : "看沉淀";
  $("readerApproveSinkBtn").disabled = !currentChunkPendingSink;
  $("readerApproveSinkBtn").textContent = currentChunkPendingSink ? "批准本段" : "批准本段";
  $("readerExecuteSinkBtn").disabled = !currentChunkApprovedSink;
  $("readerExecuteSinkBtn").textContent = currentChunkApprovedSink ? "写入本段" : "写入本段";
  $("readerSinkHint").textContent = selected
    ? `本书待沉淀 ${pendingCount} 条 · 卡片 ${cardCountForBook} 张 · 本段笔记 ${state.userNotes.length} 条`
    : "笔记、卡片和沉淀入口会在这里提示。";
  renderFocusReadingButton();
  renderReadingNowBar({ scrollPercent });
  renderReadingMap({ scrollPercent });
  renderWaypoints();
  renderImmersivePositionNav({ current: scrollPercent, total: 100, mode: state.readerMode });
  renderImmersiveActions({
    hasChunk,
    pendingCount,
    currentChunkPendingSink,
    currentChunkApprovedSink,
  });
  updateReaderPageStatus();
}

function renderImmersiveActions({ hasChunk = false, pendingCount = 0, currentChunkPendingSink = null, currentChunkApprovedSink = null } = {}) {
  const next = $("immersiveNextChunkBtn");
  const review = $("immersiveReviewLastBtn");
  const resume = $("immersiveResumeNextBtn");
  const footprints = $("immersiveFootprintsBtn");
  const ask = $("immersiveAskNovaBtn");
  const note = $("immersiveNoteBtn");
  const selfCheck = $("immersiveSelfCheckBtn");
  const sink = $("immersiveSinkCurrentBtn");
  const open = $("immersiveOpenSinkBtn");
  const status = $("immersiveActionStatus");
  if (!next || !review || !resume || !footprints || !ask || !note || !selfCheck || !sink || !open || !status) return;
  const currentIndex = chunkOrder(state.selectedChunkId);
  const nextId = hasChunk && currentIndex !== null ? getChunkId(state.chunks[currentIndex + 1]) : "";
  const lastCompleted = state.lastCompletedChunk;
  const canReviewLast = !!lastCompleted?.chunkId && lastCompleted.bookId === state.selectedBookId;
  const canResumeNext = canReviewLast && state.selectedChunkId === lastCompleted.chunkId && !!lastCompleted.nextChunkId;
  const visitSummary = hasChunk ? readingVisitSummary(activeBook()) : "";
  next.disabled = !hasChunk;
  next.textContent = nextId ? "读完下一段" : "标记读完";
  review.disabled = !canReviewLast || state.selectedChunkId === lastCompleted.chunkId;
  review.textContent = canReviewLast ? `回看 ${lastCompleted.chunkId}` : "回看刚读";
  resume.disabled = !canResumeNext;
  resume.textContent = canResumeNext ? `回到 ${lastCompleted.nextChunkId}` : "回到继续读";
  const footprintCount = currentReaderFootprintCount();
  footprints.disabled = !footprintCount;
  footprints.textContent = footprintCount ? `脚印 ${footprintCount}` : "脚印";
  renderImmersiveReadingMemory();
  ask.disabled = !hasChunk;
  note.disabled = !hasChunk;
  selfCheck.disabled = !hasChunk;
  sink.disabled = !hasChunk;
  open.disabled = !activeBook();
  open.textContent = pendingCount ? `看沉淀 ${pendingCount}` : "看沉淀";
  const currentSink = currentChunkPendingSink || currentChunkApprovedSink;
  status.textContent = hasChunk
    ? `${state.selectedChunkId} · ${visitSummary} · 笔记 ${state.userNotes.length} · 沉淀 ${sinkPreviewsForCurrentChunk().length}${currentSink ? ` · ${currentSink.status}` : ""}`
    : "未选择段落";
}

function currentReaderFootprintCount() {
  const rail = $("readingFootprints");
  if (!rail || rail.classList.contains("empty")) return 0;
  return rail.querySelectorAll(".footprint-card").length;
}

function setReaderFootprintsOpen(open) {
  const hasFootprints = currentReaderFootprintCount() > 0;
  state.readerFootprintsOpen = Boolean(open && hasFootprints);
  document.body.classList.toggle("reader-footprints-open", state.readerFootprintsOpen);
  const button = $("readerFootprintsBtn");
  if (button) {
    button.disabled = !hasFootprints;
    button.setAttribute("aria-expanded", state.readerFootprintsOpen ? "true" : "false");
    button.textContent = hasFootprints ? `足迹 ${currentReaderFootprintCount()}` : "足迹";
  }
}

function toggleReaderFootprints() {
  setReaderFootprintsOpen(!state.readerFootprintsOpen);
}

function readerNovaAsideModeLabel(context = state.novaReplyContext || state.novaLastRequest || {}) {
  if (context.contextMode === "autonomous-reading") return "Nova 自主预读";
  if (context.selection) return "Nova 选区回应";
  return "Nova 本段回应";
}

function readerNovaAsideMeta(context = state.novaReplyContext || state.novaLastRequest || {}) {
  const chunkId = context.chunkId || (context.scope === "book" ? "" : state.selectedChunkId) || "";
  const title = chunkTitleById(chunkId);
  const parts = [
    context.scope === "book" ? "本书巡读" : chunkId || "当前段",
    context.scope === "book" && chunkId ? chunkId : "",
    title && title !== chunkId ? title : "",
    context.selection ? `选区 ${String(context.selection).length} 字` : "",
    context.backend ? String(context.model ? `${context.backend} · ${context.model}` : context.backend) : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

function novaRequestBelongsToCurrentChunk() {
  if (
    state.novaLastRequest
    && state.novaLastRequest.bookId === state.selectedBookId
    && (state.novaLastRequest.scope === "book" || !state.novaLastRequest.chunkId)
  ) {
    return true;
  }
  return Boolean(
    state.novaLastRequest
    && state.novaLastRequest.bookId === state.selectedBookId
    && state.novaLastRequest.chunkId === currentReadingChunkId()
  );
}

function setReaderNovaAsideOpen(open) {
  state.readerNovaAsideOpen = Boolean(open);
  renderReaderNovaAside();
}

function toggleReaderNovaAside() {
  setReaderNovaAsideOpen(!state.readerNovaAsideOpen);
}

function focusReaderNovaAside() {
  revealNovaForReadingAction();
  focusPanel(".nova-reading-box", currentNovaDisplay()?.text ? "#novaReply" : "#novaPrompt");
}

async function saveReaderNovaAside() {
  const button = $("readerNovaAsideSaveBtn");
  if (button) button.disabled = true;
  try {
    const result = await command(novaReplyNotePayload());
    await readSelectedChunk();
    state.readerNovaAsideOpen = true;
    log(`已把 Nova 回复存成笔记: ${result.data?.noteId || state.selectedChunkId}`);
  } catch (error) {
    log(error.message || String(error));
  } finally {
    renderNovaReply();
  }
}

async function sinkReaderNovaAside() {
  const button = $("readerNovaAsideSinkBtn");
  if (button) button.disabled = true;
  try {
    const result = await createNovaReplySinkPreview();
    state.readerNovaAsideOpen = true;
    log(`已生成 Nova 回复沉淀预览: ${result.reviewId}`);
  } catch (error) {
    log(error.message || String(error));
  } finally {
    renderNovaReply();
    renderChunkReview();
  }
}

function renderReaderNovaAside() {
  const panel = $("readerNovaAside");
  if (!panel) return;
  const label = $("readerNovaAsideLabel");
  const meta = $("readerNovaAsideMeta");
  const text = $("readerNovaAsideText");
  const toggle = $("readerNovaAsideToggleBtn");
  const focus = $("readerNovaAsideFocusBtn");
  const save = $("readerNovaAsideSaveBtn");
  const sink = $("readerNovaAsideSinkBtn");
  const selected = activeBook();
  const pendingForCurrent = Boolean(state.novaAskPending && novaRequestBelongsToCurrentChunk());
  const errorForCurrent = Boolean(state.novaAskError && novaRequestBelongsToCurrentChunk());
  const display = currentNovaDisplay();
  const shouldShow = Boolean(selected && (pendingForCurrent || errorForCurrent || display));

  panel.hidden = !shouldShow;
  if (!shouldShow) return;

  const context = pendingForCurrent || errorForCurrent ? state.novaLastRequest : display?.context;
  const canUseReply = Boolean(display?.canUseReply && !state.novaAskPending && !state.novaAskError);
  panel.classList.toggle("open", state.readerNovaAsideOpen);
  panel.classList.toggle("pending", pendingForCurrent);
  panel.classList.toggle("error", errorForCurrent);
  if (label) {
    label.textContent = pendingForCurrent
      ? `${readerNovaAsideModeLabel(context)}中`
      : display?.kind === "pre-read"
        ? (context?.scope === "book" ? "Nova 已先看本书" : "Nova 已先读")
        : readerNovaAsideModeLabel(context);
  }
  if (meta) meta.textContent = readerNovaAsideMeta(context);
  if (text) {
    const body = pendingForCurrent
      ? `Nova 正在读。最长会等 ${Math.round(NOVA_REQUEST_TIMEOUT_MS / 60000)} 分钟，你可以继续看正文。`
      : errorForCurrent
        ? state.novaAskError.message
        : display?.text || "";
    text.textContent = state.readerNovaAsideOpen ? body : compactText(body, 260);
  }
  if (toggle) {
    toggle.disabled = pendingForCurrent && !display?.text;
    toggle.textContent = state.readerNovaAsideOpen ? "收起" : "展开";
    toggle.setAttribute("aria-expanded", state.readerNovaAsideOpen ? "true" : "false");
  }
  if (focus) focus.textContent = state.novaPaneCollapsed ? "打开 Nova" : "看 Nova";
  if (save) save.disabled = !canUseReply;
  if (sink) sink.disabled = !canUseReply;
}

function currentReadingFootprintItems(limit = 7) {
  const text = readerDisplayText() || currentChunkText();
  const anchored = readingFootprintRanges(text).map(({ id, item }) => ({ id, item, anchored: true }));
  const loose = currentLooseFootprints().map((item) => ({ id: noteFingerprint(item), item, anchored: false }));
  return [...anchored, ...loose].slice(0, limit);
}

function readingMemoryLabel(item) {
  if (item.source === "user-note") return "笔记";
  if (item.source === "annotation") return "边注";
  if (item.source === "nova-reply-current") return "Nova";
  if (item.source === "nova-pre-read") return "Nova 预读";
  return item.kind || "记忆";
}

function readingMemoryCounts(items) {
  const counts = new Map();
  for (const { item } of items) {
    const label = readingMemoryLabel(item);
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => `${label} ${count}`).join(" · ");
}

function renderImmersiveReadingMemory() {
  const memory = $("immersiveReadingMemory");
  if (!memory) return;
  const items = currentReadingFootprintItems(5);
  if (!state.immersiveReading || !items.length) {
    memory.hidden = true;
    memory.innerHTML = "";
    return;
  }
  memory.hidden = false;
  memory.innerHTML = [
    `<button class="memory-summary" type="button" data-action="open-reading-memory">${escapeHtml(readingMemoryCounts(items))}</button>`,
    '<div class="memory-items">',
    ...items.slice(0, 3).map(({ id, item, anchored }) => {
      const actionAttrs = anchored
        ? `data-footprint-id="${escapeHtml(id)}"`
        : `data-footprint-action="${escapeHtml(item.action || "")}" data-id="${escapeHtml(item.actionId || "")}"`;
      return `<button class="memory-chip" type="button" ${actionAttrs}><span>${escapeHtml(readingMemoryLabel(item))}</span><strong>${escapeHtml(String(item.note || item.text || item.quote || "").slice(0, 64))}</strong></button>`;
    }),
    '</div>',
  ].join("");
}

function toggleImmersiveFootprints() {
  if (!currentReaderFootprintCount()) {
    log("当前段落暂无阅读脚印。");
    return;
  }
  document.body.classList.toggle("immersive-footprints-open");
  syncImmersiveFootprintsButton();
}

function closeImmersiveFootprints() {
  document.body.classList.remove("immersive-footprints-open");
  syncImmersiveFootprintsButton();
}

function syncImmersiveFootprintsButton() {
  const button = $("immersiveFootprintsBtn");
  button?.setAttribute("aria-pressed", document.body.classList.contains("immersive-footprints-open") ? "true" : "false");
}

function openImmersiveSelfCheck() {
  if (!activeBook() || !state.selectedChunkId) {
    log("请先选择一本书和 chunk。");
    return;
  }
  openImmersiveToolsPane();
  window.setTimeout(() => focusPanel("#selfCheckCard", "#selfCheckAnswer"), 80);
}

function renderReadingMap({ scrollPercent = 0 } = {}) {
  const selected = activeBook();
  const track = $("readingMapTrack");
  const title = $("readingMapTitle");
  const meta = $("readingMapMeta");
  const bookmarkBtn = $("bookmarkChunkBtn");
  const lastBtn = $("openLastBookmarkBtn");
  const planSectionBtn = $("planCurrentSectionBtn");
  if (!track || !title || !meta || !bookmarkBtn || !lastBtn || !planSectionBtn) return;
  const index = chunkOrder(state.selectedChunkId);
  const bookmarks = bookmarksForBook(selected?.bookId);
  bookmarkBtn.disabled = !selected || index === null;
  lastBtn.disabled = !bookmarks.length;
  planSectionBtn.disabled = !selected || index === null || !currentSectionRange();
  if (!selected || !state.chunks.length) {
    title.textContent = "选择书籍后显示全书位置。";
    meta.textContent = "目录节点、当前段内位置和本地书签会在这里汇合。";
    track.className = "reading-map-track empty";
    track.textContent = "暂无目录";
    return;
  }
  const total = state.chunks.length;
  const chapterPercent = index === null ? 0 : Math.round(((index + 1) / total) * 100);
  const currentChunk = index === null ? null : state.chunks[index];
  const sectionTitle = currentChunk ? readerTocSectionLabel(currentChunk) : "";
  const sectionProgress = currentChunk ? readerTocSectionProgress(currentChunk) : "";
  const latestBookmark = bookmarks[0];
  title.textContent = `${selected.title || selected.bookId} · ${index === null ? "未定位" : `${index + 1}/${total}`}`;
  meta.textContent = `全书 ${chapterPercent}% · ${sectionTitle ? `当前章节 ${sectionTitle}${sectionProgress ? ` · ${sectionProgress}` : ""} · ` : ""}段内 ${Math.round(scrollPercent)}%${latestBookmark ? ` · 最近书签 ${latestBookmark.chunkId}${bookmarkMeta(latestBookmark) ? ` · ${bookmarkMeta(latestBookmark)}` : ""}` : " · 暂无书签"}`;
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
    const bookmark = bookmarkForChunk(chunkId, selected.bookId);
    const bookmarked = bookmarkSet.has(chunkId);
    const tooltip = [chunk.title || chunk.sectionTitle || chunkId, bookmarked ? `书签 ${bookmarkMeta(bookmark) || bookmark?.chunkId}` : ""].filter(Boolean).join(" · ");
    return `
      <button class="map-node ${active ? "active" : ""} ${bookmarked ? "bookmarked" : ""}" type="button" data-chunk-id="${escapeHtml(chunkId)}" data-bookmark="${bookmarked ? "true" : "false"}" title="${escapeHtml(tooltip)}">
        <span>${escapeHtml(chunkIndex === null ? "" : chunkIndex + 1)}</span>
        <small>${escapeHtml(bookmarked && bookmark?.pageCurrent ? `${chunkId} · P${bookmark.pageCurrent}` : chunkId)}</small>
      </button>
    `;
  }).join("");
}

function waypointItem(label, chunkId, meta, action = "chunk") {
  return { label, chunkId, meta, action, title: chunkTitleById(chunkId) || chunkId };
}

function renderWaypoints() {
  const selected = activeBook();
  const list = $("waypointList");
  if (!list) return;
  const title = $("waypointTitle");
  const meta = $("waypointMeta");
  const bookmarkBtn = $("waypointBookmarkBtn");
  const index = chunkOrder(state.selectedChunkId);
  const bookmarks = bookmarksForBook(selected?.bookId);
  bookmarkBtn.disabled = !selected || index === null;
  if (!selected || !state.chunks.length || index === null) {
    title.textContent = "选择书籍后显示前后段落。";
    meta.textContent = "上一段、当前段、下一段和最近书签会在这里排好。";
    list.className = "waypoint-list empty";
    list.textContent = "暂无路标";
    return;
  }
  const prevId = getChunkId(state.chunks[index - 1]);
  const currentId = state.selectedChunkId;
  const nextId = getChunkId(state.chunks[index + 1]);
  const latestBookmark = bookmarks[0];
  const items = [
    prevId ? waypointItem("上一段", prevId, `${index}/${state.chunks.length}`) : null,
    waypointItem("当前", currentId, `${index + 1}/${state.chunks.length}`, "current"),
    nextId ? waypointItem("下一段", nextId, `${index + 2}/${state.chunks.length}`) : null,
    latestBookmark?.chunkId ? {
      ...waypointItem("书签", latestBookmark.chunkId, bookmarkMeta(latestBookmark) || "最近"),
      action: "bookmark",
    } : null,
  ].filter(Boolean);
  title.textContent = `${selected.title || selected.bookId} · ${currentId}`;
  meta.textContent = `当前位置 ${index + 1}/${state.chunks.length}${latestBookmark?.chunkId ? ` · 书签 ${latestBookmark.chunkId}${bookmarkMeta(latestBookmark) ? ` · ${bookmarkMeta(latestBookmark)}` : ""}` : " · 暂无书签"}`;
  list.className = "waypoint-list";
  list.innerHTML = items.map((item) => `
    <button class="waypoint-item ${item.action === "current" ? "active" : ""} ${item.action === "bookmark" ? "bookmarked" : ""}" type="button" data-waypoint-chunk-id="${escapeHtml(item.chunkId)}" data-waypoint-action="${escapeHtml(item.action)}">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.chunkId)}${item.title && item.title !== item.chunkId ? ` · ${escapeHtml(item.title)}` : ""}</strong>
      <small>${escapeHtml(item.meta || "")}</small>
    </button>
  `).join("");
}

function activePlansForBook(book = activeBook()) {
  return (state.snapshot?.plans || []).filter((plan) => !book || plan.bookId === book.bookId);
}

function planUpdatedAt(plan) {
  return Date.parse(plan?.updatedAt || plan?.createdAt || "") || 0;
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
  const plans = activePlansForBook(book).slice().sort((a, b) => planUpdatedAt(b) - planUpdatedAt(a));
  return plans.find((item) => item.status === "active") || null;
}

function planGuideSelection() {
  const plan = activePlanForBook(activeBook());
  if (!plan) return { plan: null, nextStep: null };
  return { plan, nextStep: state.planNextCache[plan.planId]?.nextStep || null };
}

function ensurePlanNextHydrated(plan) {
  if (!plan?.planId || state.planNextCache[plan.planId]) return;
  state.planNextCache[plan.planId] = { nextStep: null, loading: true, updatedAt: new Date().toISOString() };
  void hydratePlanNext(plan.planId);
}

function planStepChunkLabel(step) {
  if (!step) return "";
  const ids = (step.chunkIds || []).filter(Boolean);
  if (ids.length) return ids.length === 1 ? "1 段" : `${ids.length} 段`;
  const range = step.range || {};
  if (range.startChunkId && range.endChunkId) return "选定范围";
  return range.startChunkId || step.startChunkId ? "1 段" : "";
}

function planGuideStatus() {
  const selected = activeBook();
  const { plan, nextStep } = planGuideSelection();
  const section = currentSectionRange();
  const hasRange = !!(nextStep?.chunkIds?.length || nextStep?.range?.startChunkId || nextStep?.startChunkId);
  const total = plan?.stepCount || plan?.steps?.length || 0;
  const current = plan?.currentStepIndex || 0;
  const chunkLabel = planStepChunkLabel(nextStep);
  if (!selected) {
    return {
      selected,
      plan,
      nextStep,
      section,
      hasRange,
      canCreate: false,
      canOpen: false,
      canExecute: false,
      canReview: false,
      kicker: "共读计划",
      title: "还没有选书",
      meta: "选择一本书后可为当前章节创建计划。",
    };
  }
  if (!plan) {
    return {
      selected,
      plan,
      nextStep,
      section,
      hasRange,
      canCreate: !!section,
      canOpen: false,
      canExecute: false,
      canReview: false,
      kicker: "共读计划",
      title: section ? "当前书暂无活跃计划" : "当前章节暂不能建计划",
      meta: section
        ? `${section.title || "当前章节"} · ${section.chunkCount || 1} 段 · 点击可创建本章计划。`
        : "先定位到正文段落，再创建计划。",
    };
  }
  return {
    selected,
    plan,
    nextStep,
    section,
    hasRange,
    canCreate: false,
    canOpen: !!nextStep && hasRange,
    canExecute: !!nextStep && plan.status !== "completed" && plan.status !== "paused",
    canReview: !!nextStep,
    kicker: `${current}/${total || "?"} · ${nextStep?.status || plan.status || "计划"}`,
    title: nextStep?.title || plan.title || plan.planId,
    meta: nextStep
      ? `${nextStep.type || "step"} · ${chunkLabel || "未给出范围"} · ${nextStep.intent || "按计划继续阅读。"}`
      : `${plan.title || plan.planId} · 正在读取下一步。`,
  };
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

function novaHistoryQueueItems(selected) {
  if (!selected) return [];
  return novaPreReadHistoryForBook(selected.bookId)
    .filter((item) => item.id && item.note && item.chunkId)
    .slice(0, 3)
    .map((item) => ({
      kind: "queue-nova-history",
      action: "queue-nova-history",
      id: item.id,
      kicker: item.scope === "book" ? "Nova 巡读" : "Nova 已读",
      title: `${item.chunkId}${item.title && item.title !== item.chunkId ? ` · ${item.title}` : ""}`,
      meta: `${formatSavedAt(item.answeredAt) || "刚刚"} · 可回看、存笔记或沉淀`,
      secondary: item.chunkId !== currentReadingChunkId(),
    }));
}

function novaAutonomousCandidateLabel(chunkId) {
  const title = chunkTitleById(chunkId);
  return `${chunkId}${title && title !== chunkId ? ` · ${title}` : ""}`;
}

function novaAutonomousCandidateIds(anchorChunkId = state.selectedChunkId) {
  if (!state.chunks.length) return [];
  const currentIndex = chunkOrder(anchorChunkId) ?? 0;
  const ids = [
    anchorChunkId,
    preferredReadingChunkIdFrom(currentIndex),
    preferredReadingChunkIdFrom(currentIndex + 1),
    preferredReadingChunkIdFrom(Math.max(0, currentIndex - 2)),
  ].filter(Boolean);
  return Array.from(new Set(ids)).slice(0, 4);
}

function novaAutonomousQueueItem(selected) {
  if (!selected || !state.selectedChunkId) return null;
  const candidateIds = novaAutonomousCandidateIds();
  const pending = state.novaAskPending && novaRequestBelongsToCurrentChunk();
  const currentHistory = novaPreReadHistoryForCurrentChunk()[0] || null;
  const bookHistoryCount = novaPreReadHistoryForBook(selected.bookId).length;
  const answered = (novaReplyBelongsToCurrentChunk() && state.novaReplyContext?.contextMode === "autonomous-reading") || !!currentHistory;
  return {
    kind: "queue-nova",
    action: "queue-nova",
    id: state.selectedChunkId,
    kicker: pending ? "Nova 正在先读" : answered ? "Nova 已先读" : "Nova 先读",
    title: candidateIds.length ? candidateIds.map(novaAutonomousCandidateLabel).join(" / ") : "等待当前段",
    meta: `${state.novaAutoReadEnabled ? "自动预读开启" : "自动预读暂停"}${bookHistoryCount ? ` · 已留 ${bookHistoryCount} 条` : ""} · Nova 会从候选中自己选角度`,
    secondary: !pending,
    disabled: pending || !currentChunkText(),
  };
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
  const bookSession = validSavedReadingSessionForBook(selected.bookId);
  const resumeId = bookSession?.chunkId || nextId;
  const plan = activePlanForBook(selected);
  const planNext = plan ? state.planNextCache[plan.planId]?.nextStep : null;
  const pendingPreview = pendingSinkPreviewsForBook(selected)[0] || null;
  const card = firstCardForBook(selected);
  const novaItem = novaAutonomousQueueItem(selected);
  const novaHistoryItems = novaHistoryQueueItems(selected);
  const items = [
    resumeId ? {
      kind: "queue-read",
      action: "queue-read",
      id: resumeId,
      kicker: bookSession ? "本书断点" : "继续读",
      title: `${resumeId}${chunkTitleById(resumeId) ? ` · ${chunkTitleById(resumeId)}` : ""}`,
      meta: `${selected.chunksRead || 0}/${selected.chunkCount || 0} chunks · ${progressPercent(selected)}%${bookSession?.savedAt ? ` · ${formatSavedAt(bookSession.savedAt)}` : ""}`,
    } : null,
    novaItem,
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
    ...novaHistoryItems,
  ].filter(Boolean);
  title.textContent = `${items.length} 个入口`;
  list.className = items.length ? "queue-list" : "queue-list empty";
  list.innerHTML = items.length ? items.map(queueItemHtml).join("") : "当前书没有待处理队列。";
  ensurePlanNextHydrated(plan);
  renderPlanGuide();
}

async function hydratePlanNext(planId) {
  try {
    const result = await query({ command: "plan_get", planId });
    state.planNextCache[planId] = { nextStep: result.nextStep || null, updatedAt: new Date().toISOString() };
    renderReadingQueue();
    renderReadingNowBar();
    renderPlanGuide();
    renderReaderPlanStrip();
  } catch {
    state.planNextCache[planId] = { nextStep: null, updatedAt: new Date().toISOString(), error: true };
    renderReadingNowBar();
    renderPlanGuide();
    renderReaderPlanStrip();
  }
}

function renderPlanGuide() {
  const guide = document.querySelector(".plan-guide");
  const stepEl = $("planGuideStep");
  const titleEl = $("planGuideTitle");
  const metaEl = $("planGuideMeta");
  const openBtn = $("planGuideOpenRangeBtn");
  const executeBtn = $("planGuideExecuteBtn");
  const reviewBtn = $("planGuideReviewBtn");
  const fullBtn = $("planGuideFullBtn");
  if (!guide || !stepEl || !titleEl || !metaEl || !openBtn || !executeBtn || !reviewBtn || !fullBtn) return;
  const status = planGuideStatus();
  ensurePlanNextHydrated(status.plan);
  if (!status.plan) {
    guide.className = "plan-guide empty";
    stepEl.textContent = status.kicker;
    titleEl.textContent = status.title;
    metaEl.textContent = status.meta;
    openBtn.disabled = true;
    executeBtn.disabled = true;
    reviewBtn.disabled = true;
    fullBtn.disabled = true;
    renderReaderPlanStrip(status);
    renderImmersivePlan();
    return;
  }
  guide.className = "plan-guide";
  stepEl.textContent = status.kicker;
  titleEl.textContent = status.title;
  metaEl.textContent = status.meta;
  openBtn.disabled = !status.canOpen;
  executeBtn.disabled = !status.canExecute;
  reviewBtn.disabled = !status.canReview;
  fullBtn.disabled = false;
  renderReaderPlanStrip(status);
  renderImmersivePlan();
}

function renderReaderPlanStrip(status = planGuideStatus()) {
  const strip = $("readerPlanStrip");
  if (!strip) return;
  const createBtn = $("readerPlanStripCreateBtn");
  const openBtn = $("readerPlanStripOpenRangeBtn");
  const executeBtn = $("readerPlanStripExecuteBtn");
  const reviewBtn = $("readerPlanStripReviewBtn");
  const toggleBtn = $("readerPlanStripToggleBtn");
  ensurePlanNextHydrated(status.plan);
  strip.classList.toggle("empty", !status.plan);
  strip.classList.toggle("collapsed", state.readerPlanStripCollapsed);
  $("readerPlanStripKicker").textContent = status.kicker;
  $("readerPlanStripTitle").textContent = state.readerPlanStripCollapsed
    ? (status.plan ? `计划: ${status.title}` : status.title)
    : status.title;
  $("readerPlanStripMeta").textContent = status.meta;
  if (createBtn) {
    createBtn.hidden = !!status.plan;
    createBtn.disabled = !status.canCreate;
  }
  if (openBtn) openBtn.disabled = !status.canOpen;
  if (executeBtn) executeBtn.disabled = !status.canExecute;
  if (reviewBtn) reviewBtn.disabled = !status.canReview;
  if (toggleBtn) {
    toggleBtn.textContent = state.readerPlanStripCollapsed ? "展开" : "收起";
    toggleBtn.setAttribute("aria-expanded", state.readerPlanStripCollapsed ? "false" : "true");
  }
}

function renderImmersivePlan() {
  const button = $("immersivePlanBtn");
  const card = $("immersivePlan");
  if (!button || !card) return;
  const status = planGuideStatus();
  const stepEl = $("immersivePlanStep");
  const titleEl = $("immersivePlanTitle");
  const metaEl = $("immersivePlanMeta");
  const createBtn = $("immersivePlanCreateBtn");
  const openBtn = $("immersivePlanOpenRangeBtn");
  const executeBtn = $("immersivePlanExecuteBtn");
  const reviewBtn = $("immersivePlanReviewBtn");
  button.disabled = !status.plan && !status.canCreate;
  button.textContent = status.plan ? "计划" : "建计划";
  if (createBtn) {
    createBtn.hidden = !!status.plan;
    createBtn.disabled = !status.canCreate;
  }
  if (!status.plan) {
    if (stepEl) stepEl.textContent = status.kicker;
    if (titleEl) titleEl.textContent = status.title;
    if (metaEl) metaEl.textContent = status.meta;
    if (openBtn) openBtn.disabled = true;
    if (executeBtn) executeBtn.disabled = true;
    if (reviewBtn) reviewBtn.disabled = true;
    return;
  }
  if (stepEl) stepEl.textContent = status.kicker;
  if (titleEl) titleEl.textContent = status.title;
  if (metaEl) metaEl.textContent = status.meta;
  if (openBtn) openBtn.disabled = !status.canOpen;
  if (executeBtn) executeBtn.disabled = !status.canExecute;
  if (reviewBtn) reviewBtn.disabled = !status.canReview;
}

function renderBooks() {
  const allBooks = state.snapshot?.books || [];
  const books = visibleBooks();
  const duplicates = duplicateBookIndex(books);
  const list = $("bookList");
  renderReaderBookSelect();
  renderImmersiveLibrary();
  const showToggle = $("showTestBooksToggle");
  const hiddenCount = allBooks.length - books.length;
  if (showToggle) showToggle.checked = showTestBooks();
  const hint = $("libraryFilterHint");
  if (hint) {
    hint.textContent = hiddenCount > 0 && !showTestBooks()
      ? `已隐藏 ${hiddenCount} 本验证书`
      : `${allBooks.length} 本书`;
  }
  if (!books.length) {
    list.className = "book-list empty";
    list.textContent = allBooks.length ? "当前筛选下暂无书籍" : "暂无书籍";
    $("activeBookLabel").textContent = "未选择";
    return;
  }
  const selected = activeBook();
  state.selectedBookId = selected.bookId;
  $("activeBookLabel").textContent = selected.title || selected.bookId;
  list.className = "book-list";
  list.innerHTML = "";
  for (const book of books) {
    const session = readSavedReadingSessionForBook(book.bookId);
    const duplicateLabel = duplicateBookLabel(book, duplicates);
    const meta = [
      book.bookId,
      `${book.chunkCount || 0} chunks`,
      duplicateLabel,
      session?.chunkId ? `继续 ${session.chunkId}` : "",
    ].filter(Boolean).join(" · ");
    const row = document.createElement("article");
    row.className = `book-row ${book.bookId === selected.bookId ? "active" : ""}`;
    row.innerHTML = `
      <button class="book-select" type="button">
        <span><strong>${escapeHtml(book.title || book.bookId)}</strong><small>${escapeHtml(meta)}</small></span>
        <b>${progressPercent(book)}%</b>
      </button>
      <button class="secondary" type="button" data-action="copy-book-progress" data-id="${escapeHtml(book.bookId)}">复制进度</button>
    `;
    row.querySelector(".book-select").addEventListener("click", () => {
      void selectBook(book.bookId);
    });
    list.appendChild(row);
  }
}

function renderReaderBookSelect() {
  const select = $("readerBookSelect");
  if (!select) return;
  const books = visibleBooks();
  const duplicates = duplicateBookIndex(books);
  select.innerHTML = "";
  if (!books.length) {
    select.disabled = true;
    select.appendChild(new Option("暂无书籍", ""));
    return;
  }
  select.disabled = false;
  for (const book of books) {
    const session = readSavedReadingSessionForBook(book.bookId);
    const resume = session?.chunkId ? ` · 继续 ${session.chunkId}` : "";
    const duplicate = duplicateBookLabel(book, duplicates);
    const duplicateText = duplicate ? ` · ${duplicate}` : "";
    select.appendChild(new Option(`${book.title || book.bookId} · ${progressPercent(book)}%${duplicateText}${resume}`, book.bookId));
  }
  const selected = activeBook();
  if (selected?.bookId) select.value = selected.bookId;
}

async function selectBook(bookId, { focusReader = true } = {}) {
  if (!bookId || bookId === state.selectedBookId) {
    renderReaderBookSelect();
    if (focusReader) focusPanel(".reader-surface", "#chunkText");
    return;
  }
  const saved = readSavedReadingSessionForBook(bookId);
  const hasStoredBookSession = hasStoredReadingSessionForBook(bookId);
  state.selectedBookId = bookId;
  state.selectedChunkId = saved?.chunkId || "";
  state.currentChunk = null;
  state.annotations = [];
  state.userNotes = [];
  state.submissions = [];
  state.searchResults = [];
  state.cardInbox = [];
  state.cardCollection = { items: [], bookCards: [] };
  state.selectedCard = null;
  state.novaReply = "";
  state.novaReplyContext = null;
  resetReaderFlow();
  state.lastCompletedChunk = null;
  clearReaderSelection();
  clearEntityPeek();
  await loadChunks(bookId);
  const bookSession = validSavedReadingSessionForBook(bookId);
  if (bookSession?.chunkId) {
    state.selectedChunkId = bookSession.chunkId;
  } else if (hasStoredBookSession) {
    state.selectedChunkId = nextUnreadChunkId(activeBook()) || preferredReadingChunkIdFrom();
  }
  await loadCards(bookId);
  renderAll();
  await readSelectedChunk();
  renderReaderBookSelect();
  if (focusReader) focusPanel(".reader-surface", "#chunkText");
  log(`已切换书籍: ${activeBook()?.title || bookId}`);
}

function renderChunks() {
  const select = $("chunkSelect");
  $("chunkCount").textContent = `${state.chunks.length} 段`;
  select.innerHTML = "";
  if (!state.chunks.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "暂无正文";
    select.appendChild(option);
    $("copyChunkIndexBtn").disabled = true;
    renderChunkNavigation();
    return;
  }
  $("copyChunkIndexBtn").disabled = false;
  for (const chunk of state.chunks) {
    const chunkId = getChunkId(chunk);
    const order = chunkOrder(chunkId);
    const option = document.createElement("option");
    option.value = chunkId;
    option.textContent = `${order === null ? "" : `${order + 1}. `}${chunk.title || chunk.sectionTitle || chunkId || "未命名"}`;
    select.appendChild(option);
  }
  if (!state.selectedChunkId || !state.chunks.some((chunk) => getChunkId(chunk) === state.selectedChunkId)) {
    state.selectedChunkId = preferredReadingChunkIdFrom();
  }
  select.value = state.selectedChunkId;
  renderChunkNavigation();
  renderReaderToc();
  renderPlanRangeStatus();
}

function renderChunkNavigation() {
  const index = chunkOrder(state.selectedChunkId);
  const hasChunk = index !== null;
  const bookSession = validSavedReadingSessionForBook(state.selectedBookId);
  $("chunkPosition").textContent = hasChunk
    ? `当前位置 ${index + 1}/${state.chunks.length}`
    : "未选择位置";
  $("continueReadingBtn").disabled = !activeBook();
  const sessionPercent = Math.round(Number(bookSession?.scrollPercent || 0));
  $("continueReadingBtn").textContent = bookSession?.chunkId
    ? `继续${sessionPercent ? ` · ${sessionPercent}%` : ""}`
    : "继续读";
  $("prevChunkBtn").disabled = !hasChunk || index <= 0;
  $("nextChunkBtn").disabled = !hasChunk || index >= state.chunks.length - 1;
  renderReadingSession();
}

function renderReader() {
  const current = state.currentChunk;
  const chunk = current?.chunk || current || {};
  $("chunkTitle").textContent = readerDisplayTitle(chunk);
  renderChunkTextWithFootprints(readerDisplayText() || "选择一本书后开始阅读。");
  renderSelfCheck();
  renderChunkReview();
  renderReadingSession();
  renderReaderProgress();
  renderImmersiveBookmarks();
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
  const novaPreReads = novaPreReadHistoryForCurrentChunk().slice(0, 2).map((item) => ({
    type: "Nova 预读",
    title: item.note || item.prompt || item.title,
    meta: item.answeredAt || item.chunkId,
    action: "nova-history",
    id: item.id,
  }));
  return [...novaPreReads, ...notes.slice(0, 2), ...annotations.slice(0, 2), ...cards, ...sinks];
}

function renderChunkReview() {
  const panel = $("chunkReviewCard");
  if (!panel) return;
  const selected = activeBook();
  const hasChunk = !!selected && !!state.selectedChunkId && !!currentChunkText();
  const items = hasChunk ? chunkReviewItems() : [];
  $("chunkReviewTitle").textContent = hasChunk ? "本段留下了什么" : "读取段落后回看";
  $("chunkReviewMeta").textContent = hasChunk
    ? `${state.selectedChunkId} · Nova ${novaPreReadHistoryForCurrentChunk().length} · 笔记 ${state.userNotes.length} · 边注 ${state.annotations.length} · 卡片 ${cardsForCurrentChunk().length} · 沉淀 ${sinkPreviewsForCurrentChunk().length}`
    : "笔记、边注、卡片和待沉淀会汇合到这里。";
  $("copyChunkReviewBtn").disabled = !hasChunk;
  $("chunkReviewSinkCurrentBtn").disabled = !hasChunk;
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

function currentChunkSinkTargets() {
  const targets = [];
  if ($("chunkSinkObsidian")?.checked) targets.push("obsidian");
  if ($("chunkSinkObs")?.checked) targets.push("obs");
  if ($("chunkSinkDailyNote")?.checked) targets.push("dailyNote");
  if ($("chunkSinkVcpMemory")?.checked) targets.push("vcpMemory");
  return targets.length ? targets : ["obsidian"];
}

function currentChunkNotesReviewPayload({ quote = null, chunkId: inputChunkId = "", summaryPrefix = "", sourceText = "", sourceTitle = "" } = {}) {
  const selected = activeBook();
  const chunkId = inputChunkId || quote?.chunkId || currentReadingChunkId();
  const chunk = currentReadingChunkObject(chunkId);
  const text = String(sourceText || readerDisplayChunkText(chunkId) || "");
  const targets = currentChunkSinkTargets();
  if (!selected || !chunkId || !text) throw new Error("请先读取一个段落。");
  const selectedText = String(quote?.text || "").trim();
  const sourceQuote = selectedText || text.slice(0, 900);
  const sourceTitleText = selectedText ? `选区 @ ${chunkId}` : (sourceTitle || chunk.title || chunk.sectionTitle || chunkId);
  const novaReplyForChunk = optionsNovaReplyObservation({ quote, chunkId });
  const isCurrentScreenChunk = chunkId === state.selectedChunkId || chunkId === currentReadingChunkId();
  const userNotes = (state.userNotes || []).filter((item) => isCurrentScreenChunk ? (item.chunkId || chunkId) === chunkId : item.chunkId === chunkId);
  const annotations = (state.annotations || []).filter((item) => isCurrentScreenChunk ? (item.chunkId || chunkId) === chunkId : item.chunkId === chunkId);
  const cards = isCurrentScreenChunk ? cardsForCurrentChunk() : cardsForCurrentChunk().filter((card) => card.chunkId === chunkId);
  const noteLines = userNotes.slice(0, 8).map((item) => ({
    section: item.kind === "nova-reply" ? "nova_reply" : "user_note",
    source: "user-note",
    kind: item.kind || "note",
    chunkId: item.chunkId || chunkId,
    quote: item.quote || chunk.title || chunkId,
    note: item.note || item.text || "",
    text: item.note || item.text || "",
  }));
  const annotationLines = annotations.slice(0, 8).map((item) => ({
    section: "annotation",
    source: "annotation",
    kind: item.kind || "annotation",
    author: item.author || "reader",
    chunkId: item.chunkId || chunkId,
    quote: item.quote || "",
    note: item.note || "",
    text: item.note || "",
  }));
  const cardLines = cards.slice(0, 6).map((card) => ({
    section: "reading_card",
    source: "reading-card",
    cardId: card.id || "",
    chunkId: card.chunkId || chunkId,
    title: card.title || card.kicker || card.id || "",
    note: card.message || card.note || card.subtitle || "",
    quote: card.quote || "",
    text: card.message || card.note || card.subtitle || card.title || "",
  }));
  const observations = [
    {
      section: "source_quote",
      source: selectedText ? "reader-selection" : "current-chunk",
      chunkId,
      title: sourceTitleText,
      quote: sourceQuote,
      text: sourceQuote,
      quoteOffset: quote?.offset ?? null,
    },
    novaReplyForChunk,
    ...noteLines,
    ...annotationLines,
    ...cardLines,
  ].filter(Boolean).filter((item) => item.text || item.quote || item.note || item.title);
  const title = chunk.title || chunk.sectionTitle || chunkId;
  const summaryParts = [
    summaryPrefix || `${selectedText ? "选区" : "本段"}沉淀预览：${selected.title || selected.bookId} · ${chunkId}`,
    title ? `标题：${title}` : "",
    selectedText ? `选区：${selectedText.slice(0, 160)}` : "",
    novaReplyForChunk ? "包含当前 Nova 回复。" : "",
    userNotes.length ? `已有用户笔记 ${userNotes.length} 条。` : "",
    annotations.length ? `已有边注 ${annotations.length} 条。` : "",
    cards.length ? `已有卡片 ${cards.length} 张。` : "",
  ].filter(Boolean);
  return {
    command: "review_create",
    bookId: selected.bookId,
    startChunkId: chunkId,
    endChunkId: chunkId,
    summary: summaryParts.join("\n"),
    observations,
    tags: ["co-reading", "sidecar", "chunk-note-sink"],
    sinkPolicy: {
      requireApproval: true,
      obsidian: targets.includes("obsidian"),
      obs: targets.includes("obs"),
      dailyNote: targets.includes("dailyNote"),
      vcpMemory: targets.includes("vcpMemory"),
    },
    createdBy: "CoReadingSidecar",
  };
}

function visibleNovaDisplayForAction() {
  const display = currentNovaDisplay();
  return display?.text && display?.context?.bookId && display?.context?.chunkId ? display : null;
}

function optionsNovaReplyObservation({ quote = null, chunkId: inputChunkId = "" } = {}) {
  const display = visibleNovaDisplayForAction();
  const context = display?.context || {};
  const replyQuote = quote?.text ? quote : novaReplyContextQuote();
  const chunkId = inputChunkId || context.chunkId || quote?.chunkId || currentReadingChunkId();
  if (!display || context.bookId !== state.selectedBookId || context.chunkId !== chunkId) return null;
  const source = context.contextMode === "autonomous-reading" ? "nova-pre-read" : "nova-reply-current";
  return {
    section: context.contextMode === "autonomous-reading" ? "nova_pre_read" : "nova_reply",
    source,
    kind: source,
    chunkId,
    quote: replyQuote?.text || context.prompt || chunkId,
    quoteOffset: replyQuote?.offset ?? null,
    prompt: context.prompt || String($("novaPrompt")?.value || "").trim(),
    note: display.text,
    text: display.text,
  };
}

function novaReplyContextQuote() {
  const context = state.novaReplyContext || {};
  return context.selection
    ? { text: context.selection, offset: context.selectionOffset ?? null }
    : null;
}

async function createNovaReplySinkPreview() {
  const display = visibleNovaDisplayForAction();
  if (!display || display.context.bookId !== state.selectedBookId) throw new Error("请先让 Nova 读当前书或当前段。");
  const selected = activeBook();
  const context = display.context || {};
  const quote = context.contextMode === "autonomous-reading" ? null : (novaReplyContextQuote() || selectedQuote());
  const chunkId = context.chunkId && isKnownChunkId(context.chunkId) ? context.chunkId : currentReadingChunkId();
  const source = await reviewSourceForChunk(selected.bookId, chunkId);
  const result = await createCurrentChunkSinkPreview({
    quote,
    chunkId,
    sourceText: source.text,
    sourceTitle: source.title,
    summaryPrefix: context.contextMode === "autonomous-reading"
      ? `Nova 预读沉淀预览：${activeBook()?.title || activeBook()?.bookId || ""} · ${chunkId}`
      : "",
  });
  focusPanel(".sink-detail", "#sinkPreviewContent");
  return result;
}

async function reviewSourceForChunk(bookId, chunkId) {
  const localText = readerDisplayChunkText(chunkId);
  if (localText) return { text: localText, title: chunkTitleById(chunkId) || chunkId };
  const result = await query({ command: "read_chunk", bookId, chunkId });
  const chunk = result?.chunk || result || {};
  const text = chunkTextFromResult(result);
  if (!text) throw new Error(`无法读取 ${chunkId} 的原文，暂不能生成沉淀预览。`);
  return { text, title: chunk.title || chunk.sectionTitle || chunkTitleById(chunkId) || chunkId };
}

async function createCurrentChunkSinkPreview(options = {}) {
  const reviewResult = await command(currentChunkNotesReviewPayload(options));
  const review = reviewResult.data?.review || reviewResult.raw?.review || reviewResult.review || reviewResult.fullReview || null;
  const reviewId = review?.reviewId || reviewResult.data?.reviewId || reviewResult.raw?.reviewId || reviewResult.reviewId;
  if (!reviewId) throw new Error("已创建评价，但没有返回 reviewId。");
  const previewResult = await command({
    command: "sink_preview_create",
    reviewId,
    targets: currentChunkSinkTargets(),
    requireApproval: true,
    ...sinkDestinationPayload(),
    createdBy: "CoReadingSidecar",
  });
  const opened = await openPreviewFromResult(previewResult, { refreshSnapshot: true });
  if (!opened) await loadSnapshot();
  renderChunkReview();
  renderReaderProgress();
  if (options.focusSink === false) focusPanel(".reader-surface", "#chunkText");
  return { reviewId, previewResult };
}

async function createSelectionSinkPreview() {
  if (!state.readerSelection?.text) captureReaderSelection();
  const quote = state.readerSelection?.text ? state.readerSelection : selectedQuote();
  if (!quote?.text) throw new Error("请先在原文里选中要沉淀的范围。");
  return createCurrentChunkSinkPreview({ quote });
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

function novaReplyNotePayload() {
  const selected = activeBook();
  const display = visibleNovaDisplayForAction();
  const context = display?.context || {};
  const replyChunkId = context.chunkId || currentReadingChunkId();
  if (!selected || !replyChunkId) throw new Error("请先选择一本书和 chunk。");
  if (!display?.text || context.bookId !== selected.bookId) throw new Error("请先让 Nova 读当前书或当前段。");
  const isPreRead = context.contextMode === "autonomous-reading";
  const quote = isPreRead ? null : (novaReplyContextQuote() || selectedQuote());
  const chunk = currentReadingChunkObject(replyChunkId);
  const fallbackQuote = chunk.title || chunk.sectionTitle || replyChunkId;
  const prompt = context.prompt || String($("novaPrompt").value || "").trim();
  return {
    command: "user_note_create",
    bookId: selected.bookId,
    chunkId: replyChunkId,
    quote: quote?.text || fallbackQuote,
    quoteOffset: quote?.offset ?? null,
    note: [
      isPreRead ? "Nova 自主预读" : "Nova 共读回应",
      prompt ? `问题: ${prompt}` : "",
      "",
      display.text
    ].filter(Boolean).join("\n"),
    kind: isPreRead ? "nova-pre-read" : "nova-reply",
    status: "open",
    tags: ["co-reading", "sidecar", isPreRead ? "nova-pre-read" : "nova-reply"],
  };
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
  if (item.previewId) return `sink-${item.previewId}`;
  if (item.cardId) return `card-${item.cardId}`;
  if (item.historyId) return `nova-pre-read-${item.historyId}`;
  if (item.source === "nova-reply-current") return "nova-reply-current";
  return `${item.source}-${item.index}`;
}

function novaReplyBelongsToCurrentChunk() {
  return Boolean(
    state.novaReply
    && state.novaReplyContext?.bookId === state.selectedBookId
    && state.novaReplyContext?.chunkId === currentReadingChunkId()
  );
}

function novaReplyBelongsToChunk(chunkId) {
  return Boolean(
    state.novaReply
    && chunkId
    && state.novaReplyContext?.bookId === state.selectedBookId
    && state.novaReplyContext?.chunkId === chunkId
  );
}

function novaReplyUsableForSelectedBook() {
  const display = visibleNovaDisplayForAction();
  return Boolean(display?.text && display.context?.bookId === state.selectedBookId && display.context?.chunkId);
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

function readerFindRanges(text) {
  const query = String(state.readerFind.query || "").trim();
  if (!query) return [];
  const source = String(text || "");
  const lowerSource = source.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const ranges = [];
  let start = 0;
  while (ranges.length < 120) {
    const index = lowerSource.indexOf(lowerQuery, start);
    if (index < 0) break;
    ranges.push({ id: `find-${ranges.length}`, start: index, end: index + query.length });
    start = index + Math.max(1, query.length);
  }
  return ranges;
}

function mergeReaderRanges(text) {
  const ranges = [];
  for (const range of readingFootprintRanges(text)) {
    ranges.push({ ...range, type: "footprint" });
  }
  for (const range of readerFindRanges(text)) {
    ranges.push({ ...range, type: "find" });
  }
  return ranges.sort((a, b) => a.start - b.start || b.end - a.end || a.type.localeCompare(b.type));
}

function renderTextRanges(source, ranges) {
  let cursor = 0;
  const parts = [];
  const renderedFootprints = [];
  for (const range of ranges) {
    if (range.start < cursor) continue;
    parts.push(escapeHtml(source.slice(cursor, range.start)));
    if (range.type === "find") {
      parts.push(`<mark class="reader-find-mark" data-reader-find-id="${escapeHtml(range.id)}">${escapeHtml(source.slice(range.start, range.end))}</mark>`);
    } else {
      parts.push(`<mark class="reading-mark ${range.item.source === "user-note" ? "mine" : ""}" data-footprint-id="${escapeHtml(range.id)}">${escapeHtml(source.slice(range.start, range.end))}</mark>`);
      renderedFootprints.push(range);
    }
    cursor = range.end;
  }
  parts.push(escapeHtml(source.slice(cursor)));
  return { html: parts.join(""), renderedFootprints };
}

function readerFindRangesForChunks(chunks) {
  const query = String(state.readerFind.query || "").trim();
  if (!query) return [];
  const lowerQuery = query.toLowerCase();
  const ranges = [];
  for (const chunk of chunks) {
    const source = String(chunk.text || "");
    const lowerSource = source.toLowerCase();
    let start = 0;
    while (ranges.length < 120) {
      const index = lowerSource.indexOf(lowerQuery, start);
      if (index < 0) break;
      ranges.push({
        id: `find-${ranges.length}`,
        chunkId: chunk.chunkId,
        start: index,
        end: index + query.length,
      });
      start = index + Math.max(1, query.length);
    }
    if (ranges.length >= 120) break;
  }
  return ranges;
}

function renderChunkTextWithFootprints(text) {
  const chunkText = $("chunkText");
  if (!chunkText) return;
  const chunks = readerDisplayChunks();
  if (!chunks.length) {
    chunkText.textContent = String(text || "");
    renderReadingFootprints([]);
    updateReaderFindMatches([]);
    return;
  }
  const findRanges = readerFindRangesForChunks(chunks);
  const renderedRanges = [];
  chunkText.innerHTML = chunks.map((chunk, index) => {
    const source = String(chunk.text || "");
    const chunkFindRanges = findRanges.filter((range) => range.chunkId === chunk.chunkId).map((range) => ({ ...range, type: "find" }));
    const footprintRanges = chunk.chunkId === state.selectedChunkId
      ? readingFootprintRanges(source).map((range) => ({ ...range, type: "footprint" }))
      : [];
    const { html, renderedFootprints } = renderTextRanges(
      source,
      [...footprintRanges, ...chunkFindRanges].sort((a, b) => a.start - b.start || b.end - a.end || a.type.localeCompare(b.type))
    );
    renderedRanges.push(...renderedFootprints);
    const title = chunk.title || chunkTitleById(chunk.chunkId) || chunk.chunkId;
    const indexText = String((chunkOrder(chunk.chunkId) ?? index) + 1).padStart(2, "0");
    return [
      `<section class="reader-flow-chunk${chunk.chunkId === currentReadingChunkId() ? " active" : ""}" data-reader-flow-chunk-id="${escapeHtml(chunk.chunkId)}">`,
      `<div class="reader-flow-anchor" aria-label="阅读锚点"><span>${escapeHtml(indexText)}</span><strong>${escapeHtml(title)}</strong></div>`,
      `<div class="reader-flow-text">${html}</div>`,
      "</section>",
    ].join("");
  }).join("");
  renderReadingFootprints(renderedRanges);
  updateReaderFindMatches(findRanges);
  window.requestAnimationFrame(() => {
    highlightActiveReaderFlowChunk();
    syncReaderActiveChunkFromScroll({ render: false });
    updateReaderFlowNovaMarks();
  });
}

function updateReaderFindMatches(matches) {
  state.readerFind.matches = matches;
  if (!matches.length) state.readerFind.activeIndex = -1;
  else if (state.readerFind.activeIndex < 0 || state.readerFind.activeIndex >= matches.length) state.readerFind.activeIndex = 0;
  renderReaderFindStatus();
  window.setTimeout(() => applyReaderFindActiveMark(), 0);
}

function applyReaderFindActiveMark({ scroll = false } = {}) {
  document.querySelectorAll(".reader-find-mark.active").forEach((item) => item.classList.remove("active"));
  const active = state.readerFind.activeIndex;
  if (active < 0) return;
  const mark = document.querySelector(`.reader-find-mark[data-reader-find-id="find-${active}"]`);
  if (!mark) return;
  mark.classList.add("active");
  if (scroll) {
    mark.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    window.setTimeout(() => {
      saveReadingSession();
      updateReaderPageStatus();
    }, 300);
  }
}

function renderReaderFindStatus() {
  const status = $("readerFindStatus");
  const input = $("readerFindInput");
  const prev = $("readerFindPrevBtn");
  const next = $("readerFindNextBtn");
  const clear = $("readerFindClearBtn");
  const count = state.readerFind.matches.length;
  if (input && input.value !== state.readerFind.query) input.value = state.readerFind.query;
  if (status) status.textContent = count ? `${state.readerFind.activeIndex + 1}/${count}` : "0/0";
  if (prev) prev.disabled = !count;
  if (next) next.disabled = !count;
  if (clear) clear.disabled = !state.readerFind.query;
}

function setReaderFindQuery(value) {
  state.readerFind.query = String(value || "").trim();
  state.readerFind.activeIndex = 0;
  renderReader();
  if (state.readerFind.matches.length) applyReaderFindActiveMark({ scroll: true });
}

function moveReaderFind(delta) {
  const count = state.readerFind.matches.length;
  if (!count) return;
  state.readerFind.activeIndex = (state.readerFind.activeIndex + delta + count) % count;
  renderReaderFindStatus();
  applyReaderFindActiveMark({ scroll: true });
}

function clearReaderFind() {
  state.readerFind = { query: "", matches: [], activeIndex: -1 };
  renderReader();
}

function renderReadingFootprints(ranges) {
  const rail = $("readingFootprints");
  if (!rail) return;
  const items = currentReadingFootprintItems(7);
  if (!items.length) {
    rail.className = "reading-footprints empty";
    rail.textContent = "暂无高亮足迹";
    setReaderFootprintsOpen(false);
    renderImmersiveReadingMemory();
    return;
  }
  rail.className = "reading-footprints";
  rail.innerHTML = [
    '<button class="footprints-close" type="button" data-action="close-footprints">关闭</button>',
    ...items.map((item, index) => renderFootprintButton({ ...item, index })),
  ].join("");
  setReaderFootprintsOpen(state.readerFootprintsOpen);
  renderImmersiveReadingMemory();
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

function currentLooseFootprints() {
  const items = [];
  if (novaReplyBelongsToCurrentChunk()) {
    items.push({
      source: "nova-reply-current",
      kind: "Nova",
      note: state.novaReply,
      quote: state.novaReplyContext?.prompt || String($("novaPrompt")?.value || "").trim() || "当前段落回应",
      action: "nova",
    });
  }
  const currentReplyIsPreRead = novaReplyBelongsToCurrentChunk() && state.novaReplyContext?.contextMode === "autonomous-reading";
  for (const item of novaPreReadHistoryForCurrentChunk().slice(0, 2)) {
    if (currentReplyIsPreRead && item.note === compactText(state.novaReply, 520)) continue;
    items.push({
      source: "nova-pre-read",
      kind: "Nova 预读",
      note: item.note,
      quote: item.prompt || item.title || item.chunkId,
      historyId: item.id,
      action: "nova-history",
      actionId: item.id,
    });
  }
  for (const card of cardsForCurrentChunk().slice(0, 2)) {
    items.push({
      source: "card",
      kind: "卡片",
      note: card.message || card.note || card.title || card.kicker || "",
      quote: card.quote || card.subtitle || card.chunkId || "",
      cardId: card.id,
      action: "card",
      actionId: card.id,
    });
  }
  for (const preview of sinkPreviewsForCurrentChunk().slice(0, 3)) {
    items.push({
      source: "sink",
      kind: preview.status === "approved" ? "已批准沉淀" : "待沉淀",
      note: preview.destination?.notePath || preview.notePath || preview.previewId,
      quote: preview.sourceType || preview.target || "",
      previewId: preview.previewId,
      action: "sink",
      actionId: preview.previewId,
    });
  }
  return items.filter((item) => item.note || item.quote);
}

function renderFootprintButton({ id, item, index, anchored }) {
  const label = item.source === "user-note" ? "我的笔记" : (item.kind || "边注");
  const actionAttrs = anchored
    ? `data-footprint-id="${escapeHtml(id)}"`
    : `data-footprint-action="${escapeHtml(item.action || "")}" data-id="${escapeHtml(item.actionId || "")}"`;
  const classes = [
    "footprint-card",
    item.source === "user-note" ? "mine" : "",
    !anchored ? "loose" : "",
    item.source === "nova-reply-current" || item.source === "nova-pre-read" ? "nova" : "",
    item.source === "sink" ? "sink" : "",
  ].filter(Boolean).join(" ");
  return `
    <button class="${classes}" type="button" ${actionAttrs}>
      <span>${escapeHtml(index + 1)} · ${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(item.note || item.text || "").slice(0, 90))}</strong>
      <small>${escapeHtml(String(item.quote || "").slice(0, 100))}</small>
    </button>
  `;
}

async function openLooseFootprint(action, id) {
  if (action === "nova") {
    focusPanel(".nova-reading-box", "#novaReply");
    return;
  }
  if (action === "nova-history" && id) {
    await openNovaPreReadHistory(id);
    return;
  }
  if (action === "card" && id) {
    await openQueueCard(id);
    return;
  }
  if (action === "sink" && id) {
    await openQueueSink(id);
  }
}

function renderNovaReply() {
  const reply = $("novaReply");
  const status = $("novaAskStatus");
  const copyButton = $("copyNovaReplyBtn");
  const saveButton = $("saveNovaReplyNoteBtn");
  const sinkButton = $("sinkNovaReplyBtn");
  const autoButton = $("novaAutoReadBtn");
  const bookScoutButton = $("novaBookScoutBtn");
  const autoToggle = $("novaAutoReadToggle");
  if (!reply || !status || !copyButton || !saveButton || !sinkButton || !autoButton || !bookScoutButton || !autoToggle) return;
  const hasBook = !!activeBook();
  const hasChunk = hasBook && !!state.selectedChunkId;
  autoToggle.checked = state.novaAutoReadEnabled;
  autoToggle.disabled = state.novaAskPending;
  renderNovaPreReadHistory();
  const display = currentNovaDisplay();
  if (state.novaAskPending) {
    reply.className = "nova-reply empty";
    reply.textContent = `Nova 正在读。最长会等 ${Math.round(NOVA_REQUEST_TIMEOUT_MS / 60000)} 分钟，你可以继续看书。`;
    status.textContent = "Nova 阅读中";
    copyButton.disabled = true;
    saveButton.disabled = true;
    sinkButton.disabled = true;
    autoButton.disabled = true;
    bookScoutButton.disabled = true;
    renderImmersiveNovaCard();
    renderReaderNovaAside();
    renderReadingQueue();
    return;
  }
  if (state.novaAskError) {
    reply.className = "nova-reply error";
    reply.textContent = state.novaAskError.message;
    status.textContent = state.novaAskError.statusText || "上游不可用";
    copyButton.disabled = true;
    saveButton.disabled = true;
    sinkButton.disabled = true;
    autoButton.disabled = !hasChunk;
    bookScoutButton.disabled = !hasBook;
    renderImmersiveNovaCard();
    renderReaderNovaAside();
    renderReadingQueue();
    return;
  }
  if (!display) {
    reply.className = "nova-reply empty";
    reply.textContent = "Nova 的自主预读和你的提问回应会出现在这里。";
    status.textContent = "待提问";
    copyButton.disabled = true;
    saveButton.disabled = true;
    sinkButton.disabled = true;
    autoButton.disabled = !hasChunk;
    bookScoutButton.disabled = !hasBook;
    renderImmersiveNovaCard();
    renderReaderNovaAside();
    renderReadingQueue();
    return;
  }
  reply.className = display.kind === "stale-reply" || display.kind === "pre-read" ? "nova-reply muted" : "nova-reply";
  reply.textContent = display.text;
  status.textContent = display.statusText;
  copyButton.disabled = false;
  const canUseReply = Boolean(display.canUseReply && novaReplyUsableForSelectedBook());
  saveButton.disabled = !canUseReply;
  sinkButton.disabled = !canUseReply;
  autoButton.disabled = !hasChunk;
  bookScoutButton.disabled = !hasBook;
  renderImmersiveNovaCard();
  renderReaderNovaAside();
  renderReadingQueue();
}

function novaErrorMessage(error, request) {
  const status = error?.status ? `HTTP ${error.status}` : "请求失败";
  const detail = String(error?.message || error || "Nova 暂时没有返回。").trim();
  const target = request?.scope === "book" ? "当前书" : request?.chunkId ? `当前段落: ${request.chunkId}` : "当前段落";
  const timeout = Number(error?.timeoutMs || 0);
  const timeoutText = timeout ? `${Math.round(timeout / 1000)} 秒` : "短时间";
  return [
    `Nova 这次还没有回来。${status}: ${detail}`,
    "",
    `已经等待 ${timeoutText}。`,
    `已保留你的问题和 ${target}，可以继续读书，稍后点“发送给 Nova”重试。`
  ].join("\n");
}

async function askNovaWithPrompt(prompt, { extraContext = {} } = {}) {
  const selected = activeBook();
  if (!selected || !state.selectedChunkId) throw new Error("请先选择一本书和 chunk。");
  const requestBookId = selected.bookId;
  const quote = selectedQuote();
  const requestChunkId = quote.chunkId || currentReadingChunkId();
  const chunk = currentReadingChunkObject(requestChunkId);
  const text = readerDisplayChunkText(requestChunkId);
  if (!text) throw new Error("请先读取当前 chunk。");
  const request = {
    prompt,
    context: {
      ...currentNovaContext(selected, chunk, text, quote, { chunkId: requestChunkId }),
      ...extraContext,
    }
  };
  state.novaLastRequest = {
    bookId: requestBookId,
    chunkId: requestChunkId,
    prompt,
    selection: quote.text || "",
    selectionOffset: quote.offset ?? null,
    contextMode: request.context.contextMode || "",
    requestedAt: new Date().toISOString(),
  };
  state.novaAskError = null;
  state.novaAskPending = true;
  renderNovaReply();
  renderImmersiveNovaCard();
  try {
    const result = await askNova(request);
    state.novaReply = result.content || "Nova 暂无文本回复。";
    state.novaReplyContext = {
      bookId: requestBookId,
      chunkId: requestChunkId,
      prompt,
      selection: quote.text || "",
      selectionOffset: quote.offset ?? null,
      contextMode: request.context.contextMode || "",
      answeredAt: new Date().toISOString(),
    };
    state.novaAskPending = false;
    state.novaAskError = null;
    renderNovaReply();
    if (requestBookId === state.selectedBookId && requestChunkId === currentReadingChunkId()) {
      renderReadingFootprints(readingFootprintRanges(currentReadingChunkText()));
    }
    log(`Nova 已回应 ${requestChunkId}。`);
    return state.novaReply;
  } catch (error) {
    state.novaAskPending = false;
    state.novaAskError = {
      message: novaErrorMessage(error, state.novaLastRequest),
      statusText: error?.status === 502 || error?.status === 504 ? "上游超时" : "可重试",
      at: new Date().toISOString(),
    };
    state.novaReply = "";
    renderNovaReply();
    log(error.message || String(error));
    throw error;
  } finally {
    renderImmersiveNovaCard();
  }
}

async function runNovaAutonomousReading({ manual = false, bookScout = false } = {}) {
  const selected = activeBook();
  if (!selected) return;
  const requestBookId = selected.bookId;
  const requestChunkId = bookScout ? "" : currentReadingChunkId();
  const requestText = bookScout ? "" : readerDisplayChunkText(requestChunkId);
  if (!bookScout && (!requestChunkId || !requestText)) return;
  const key = `${requestBookId}:${bookScout ? "book-scout" : requestChunkId}`;
  if (manual) {
    window.clearTimeout(state.novaAutoReadTimer);
  }
  if (state.novaAskPending || state.novaAutoReadInFlight.has(key)) {
    log("Nova 已经在读，等这次回来即可。");
    return state.novaReply;
  }
  if (manual) state.novaAutoReadSeen.add(key);
  if (!manual) {
    const hasHistory = bookScout ? !!novaBookScoutHistoryForBook(requestBookId) : !!novaPreReadHistoryForCurrentChunk()[0];
    if (!state.novaAutoReadEnabled || state.novaAutoReadSeen.has(key) || hasHistory) return;
    state.novaAutoReadSeen.add(key);
  }
  state.novaAutoReadInFlight.add(key);
  const prompt = bookScout ? buildNovaBookScoutPrompt() : buildNovaAutonomousReadingPrompt();
  $("novaPrompt").value = prompt;
  const quote = bookScout ? { text: "", offset: null } : selectedQuote();
  state.novaLastRequest = {
    bookId: requestBookId,
    chunkId: requestChunkId,
    prompt,
    selection: quote.text || "",
    selectionOffset: quote.offset ?? null,
    contextMode: "autonomous-reading",
    scope: bookScout ? "book" : "chunk",
    requestedAt: new Date().toISOString(),
  };
  state.novaAskError = null;
  state.novaAskPending = true;
  renderNovaReply();
  try {
    const payload = {
      action: "pre_read",
      bookId: requestBookId,
      bookTitle: selected.title || selected.bookId,
      prompt,
      maxCandidates: bookScout ? 4 : 3,
      force: manual,
    };
    if (!bookScout) {
      payload.chunkId = requestChunkId;
      payload.chunkTitle = chunkTitleById(requestChunkId);
      payload.selection = { text: quote.text || "", offset: quote.offset ?? null };
    }
    const response = await runNovaAgent(payload);
    const run = response.run || {};
    const result = response.result || run.result || {};
    const replyChunkId = run.chunkId || result.chosenChunkId || requestChunkId;
    state.novaReply = result.content || result.note || "Nova 暂无文本回复。";
    state.novaReplyContext = {
      bookId: run.bookId || requestBookId,
      chunkId: replyChunkId,
      prompt: run.prompt || prompt,
      selection: run.selection?.text || quote.text || "",
      selectionOffset: run.selection?.offset ?? quote.offset ?? null,
      contextMode: "autonomous-reading",
      scope: bookScout ? "book" : "chunk",
      backend: result.backend || run.result?.backend || "",
      model: result.model || run.result?.model || "",
      answeredAt: run.completedAt || new Date().toISOString(),
    };
    mergeNovaAgentRun(run);
    recordNovaPreReadReply(state.novaReplyContext, state.novaReply, run);
    state.novaAskPending = false;
    state.novaAskError = null;
    renderNovaReply();
    if (requestBookId === state.selectedBookId && replyChunkId === currentReadingChunkId()) {
      renderReadingFootprints(readingFootprintRanges(currentReadingChunkText()));
    }
    log(bookScout ? `Nova Agent 已先看本书: ${replyChunkId || requestBookId}。` : `Nova Agent 已预读 ${replyChunkId || requestChunkId}。`);
    return state.novaReply;
  } catch (error) {
    state.novaAskPending = false;
    state.novaAskError = {
      message: novaErrorMessage(error, state.novaLastRequest),
      statusText: error?.status === 502 || error?.status === 504 ? "上游超时" : "可重试",
      at: new Date().toISOString(),
    };
    if (error?.data?.details?.run) mergeNovaAgentRun(error.data.details.run);
    state.novaReply = "";
    renderNovaReply();
    log(error.message || String(error));
    throw error;
  } finally {
    state.novaAutoReadInFlight.delete(key);
    if (!bookScout && state.novaAutoReadEnabled) maybeScheduleNovaBookScout(1200);
    renderImmersiveNovaCard();
  }
}

function maybeScheduleNovaAutonomousReading() {
  window.clearTimeout(state.novaAutoReadTimer);
  state.novaAutoReadTimer = window.setTimeout(() => {
    void runNovaAutonomousReading().catch((error) => {
      log(error.message || String(error));
    });
  }, 700);
}

function shouldAutoScoutSelectedBook() {
  const selected = activeBook();
  if (!state.novaAutoReadEnabled || !selected?.bookId || state.novaAskPending) return false;
  const key = `${selected.bookId}:book-scout`;
  return !state.novaAutoReadSeen.has(key)
    && !state.novaAutoReadInFlight.has(key)
    && !novaBookScoutHistoryForBook(selected.bookId);
}

function maybeScheduleNovaBookScout(delayMs = 2200) {
  window.clearTimeout(state.novaAutoBookScoutTimer);
  if (!shouldAutoScoutSelectedBook()) return;
  state.novaAutoBookScoutTimer = window.setTimeout(() => {
    if (!shouldAutoScoutSelectedBook()) return;
    void runNovaAutonomousReading({ bookScout: true }).catch((error) => {
      log(error.message || String(error));
    });
  }, delayMs);
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
      obs: form.get("obs") === "on",
      dailyNote: form.get("dailyNote") === "on",
      vcpMemory: form.get("vcpMemory") === "on",
    },
    createdBy: "CoReadingSidecar",
  };
}

function fillPlanFormForCurrentSection() {
  const selected = activeBook();
  const range = currentSectionRange();
  if (!selected || !range) throw new Error("请先定位到一个章节。");
  const form = $("planForm");
  form.elements.mode.value = "range";
  form.elements.startChunkId.value = range.startChunkId;
  form.elements.endChunkId.value = range.endChunkId;
  form.elements.query.value = range.title;
  renderPlanRangeStatus();
  return { selected, range };
}

async function createPlanForCurrentSection() {
  const { selected, range } = fillPlanFormForCurrentSection();
  const payload = {
    ...buildPlanCreatePayload(selected, new FormData($("planForm"))),
    title: `${selected.title || selected.bookId} · ${range.title} 共读计划`,
  };
  const result = await command(payload);
  await loadSnapshot();
  renderPlanGuide();
  renderReaderProgress();
  focusPanel(".plan-guide", "#planGuideExecuteBtn");
  log(`已创建本章计划: ${range.title} · ${range.startChunkId} -> ${range.endChunkId}`);
  return result;
}

function reviewTargetsFromForm(form) {
  const targets = [];
  if (form.get("obsidian") === "on") targets.push("obsidian");
  if (form.get("obs") === "on") targets.push("obs");
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
      obs: targets.includes("obs"),
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
      mayCreateSinkPreviewLater: Boolean(payload.sinkPolicy?.obsidian || payload.sinkPolicy?.obs || payload.sinkPolicy?.dailyNote || payload.sinkPolicy?.vcpMemory),
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
        ...sinkDestinationPayload(),
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
        ...sinkDestinationPayload(),
        createdBy: "CoReadingSidecar",
      },
      createSinkPreviewFromCards: {
        command: "sink_preview_create_from_cards",
        bookId: selected.bookId,
        cardIds: [card.id || ""].filter(Boolean),
        limit: 200,
        title: `${card.title || card.kicker || card.id || "阅读卡片"} 卡片沉淀`,
        ...sinkDestinationPayload(),
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
    ...sinkDestinationPayload(),
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

function chunkTextFromResult(result) {
  const chunk = result?.chunk || result || {};
  return String(result?.text || chunk.text || "");
}

function chunkById(chunkId) {
  return state.chunks.find((chunk) => getChunkId(chunk) === chunkId) || null;
}

function isKnownChunkId(chunkId) {
  return Boolean(chunkId && state.chunks.some((chunk) => getChunkId(chunk) === chunkId));
}

function readerFlowMatchesCurrentBook() {
  const selected = activeBook();
  return Boolean(
    selected
    && state.readerFlow.bookId === selected.bookId
    && state.readerFlow.anchorChunkId === state.selectedChunkId
    && state.readerFlow.chunks.length
  );
}

function readerDisplayChunks() {
  if (readerFlowMatchesCurrentBook()) {
    return state.readerFlow.chunks.filter((item) => item.text && item.text.trim());
  }
  const text = currentChunkText();
  return text ? [{
    chunkId: state.selectedChunkId,
    title: chunkTitleById(state.selectedChunkId),
    text,
  }] : [];
}

function currentReadingChunkId({ preferSelection = false } = {}) {
  const selectionChunkId = preferSelection ? state.readerSelection?.chunkId : "";
  const candidate = selectionChunkId || state.readerActiveChunkId || state.selectedChunkId;
  return isKnownChunkId(candidate) ? candidate : state.selectedChunkId;
}

function readerDisplayChunkText(chunkId = currentReadingChunkId()) {
  if (!chunkId) return "";
  if (chunkId === state.selectedChunkId) return currentChunkText();
  return String(readerDisplayChunks().find((item) => item.chunkId === chunkId)?.text || "");
}

function currentReadingChunkText({ preferSelection = false } = {}) {
  return readerDisplayChunkText(currentReadingChunkId({ preferSelection })) || currentChunkText();
}

function currentReadingChunkObject(chunkId = currentReadingChunkId()) {
  if (chunkId === state.selectedChunkId) return state.currentChunk?.chunk || state.currentChunk || chunkById(chunkId) || {};
  return chunkById(chunkId) || {};
}

function setReaderActiveChunkId(chunkId = state.selectedChunkId) {
  if (!isKnownChunkId(chunkId)) return false;
  if (state.readerActiveChunkId === chunkId) return false;
  state.readerActiveChunkId = chunkId;
  return true;
}

function emptyReaderFlow() {
  return { bookId: "", anchorChunkId: "", chunks: [], totalCount: 0, complete: false, loading: false };
}

function resetReaderFlow() {
  state.readerFlowRequestId += 1;
  state.readerFlow = emptyReaderFlow();
  state.readerActiveChunkId = "";
}

function readerDisplayTitle(chunk = {}) {
  const selected = activeBook();
  const title = selected?.title || selected?.bookId || chunk.title || chunk.sectionTitle || chunkTitleById(state.selectedChunkId);
  return title || "阅读";
}

function readerFlowChunkIds(anchorChunkId = state.selectedChunkId) {
  const index = chunkOrder(anchorChunkId);
  if (index === null) return anchorChunkId ? [anchorChunkId] : [];
  return state.chunks.slice(index).map(getChunkId).filter(Boolean);
}

function readerFlowChunkFromResult(chunkId, result) {
  return {
    chunkId,
    title: chunkTitleById(chunkId),
    text: chunkTextFromResult(result),
  };
}

function setReaderFlowFromCurrent(selected) {
  const ids = readerFlowChunkIds(state.selectedChunkId);
  state.readerActiveChunkId = state.selectedChunkId;
  state.readerFlow = {
    bookId: selected?.bookId || "",
    anchorChunkId: state.selectedChunkId,
    chunks: [{
      chunkId: state.selectedChunkId,
      title: chunkTitleById(state.selectedChunkId),
      text: currentChunkText(),
    }],
    totalCount: ids.length || 1,
    complete: false,
    loading: true,
  };
}

function renderReaderPreservingScroll() {
  const chunkText = $("chunkText");
  const scrollTop = Number(chunkText?.scrollTop || 0);
  const scrollLeft = Number(chunkText?.scrollLeft || 0);
  renderReader();
  window.requestAnimationFrame(() => {
    const next = $("chunkText");
    if (!next) return;
    next.scrollTop = scrollTop;
    next.scrollLeft = scrollLeft;
    updateReaderPageStatus();
  });
}

async function loadReaderFlow(selected) {
  if (!selected || !state.selectedChunkId) return;
  const requestId = ++state.readerFlowRequestId;
  const anchorChunkId = state.selectedChunkId;
  const ids = readerFlowChunkIds(anchorChunkId);
  const totalCount = ids.length;
  const chunks = [];
  for (let start = 0; start < ids.length; start += READER_FLOW_BATCH_SIZE) {
    const batch = ids.slice(start, start + READER_FLOW_BATCH_SIZE);
    const batchChunks = await Promise.all(batch.map(async (chunkId) => {
      try {
        const result = chunkId === anchorChunkId && state.currentChunk
          ? state.currentChunk
          : await query({ command: "read_chunk", bookId: selected.bookId, chunkId });
        return readerFlowChunkFromResult(chunkId, result);
      } catch {
        return { chunkId, title: chunkTitleById(chunkId), text: "" };
      }
    }));
    if (requestId !== state.readerFlowRequestId || selected.bookId !== state.selectedBookId || anchorChunkId !== state.selectedChunkId) return;
    chunks.push(...batchChunks.filter((item) => item.text.trim()));
    const isComplete = start + READER_FLOW_BATCH_SIZE >= ids.length;
    state.readerFlow = {
      bookId: selected.bookId,
      anchorChunkId,
      chunks: chunks.length ? chunks.slice() : state.readerFlow.chunks,
      totalCount,
      complete: isComplete,
      loading: !isComplete,
    };
    renderReaderPreservingScroll();
  }
}

function readerDisplayText() {
  const chunks = readerDisplayChunks();
  return chunks.length
    ? chunks.map((item) => item.text.trim()).filter(Boolean).join("\n\n")
    : currentChunkText();
}

function compactText(value, maxChars = 1800) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
}

function novaTocPreview(limit = 18) {
  return state.chunks.slice(0, limit).map((chunk, index) => ({
    chunkId: getChunkId(chunk),
    title: chunk.title || chunk.sectionTitle || getChunkId(chunk),
    sectionTitle: chunk.sectionTitle || chunk.title || "",
    position: `${index + 1}/${state.chunks.length}`,
    read: Boolean(chunk.read),
  }));
}

async function novaAutonomousCandidates(selected) {
  if (!selected || !state.chunks.length) return [];
  const uniqueIds = novaAutonomousCandidateIds();
  const candidates = [];
  for (const chunkId of uniqueIds) {
    try {
      const result = await query({ command: "read_chunk", bookId: selected.bookId, chunkId });
      const chunk = result?.chunk || result || {};
      candidates.push({
        chunkId,
        title: chunk.title || chunk.sectionTitle || chunkTitleById(chunkId),
        text: compactText(String(result?.text || chunk.text || ""), 1800),
      });
    } catch {
      // 候选段失败时跳过，保留其它可读上下文。
    }
  }
  return candidates;
}

function readerSelectionChunkId(selection = window.getSelection?.()) {
  const node = selection?.anchorNode || selection?.focusNode || null;
  const element = node?.nodeType === 3 ? node.parentElement : node;
  const section = element?.closest?.(".reader-flow-chunk");
  return section?.dataset?.readerFlowChunkId || currentReadingChunkId();
}

function offsetInReaderChunk(chunkId, text) {
  const source = readerDisplayChunkText(chunkId);
  const offset = source.indexOf(text);
  return offset >= 0 ? offset : null;
}

function selectedQuote() {
  if (state.readerSelection?.text) return state.readerSelection;
  const selection = window.getSelection?.();
  const text = selection ? String(selection.toString() || "").trim() : "";
  if (!selection || !text) return { text: "", offset: null };
  const chunkText = $("chunkText");
  const anchorInsideReader = selection.anchorNode && chunkText.contains(selection.anchorNode);
  const focusInsideReader = selection.focusNode && chunkText.contains(selection.focusNode);
  const chunkId = anchorInsideReader && focusInsideReader ? readerSelectionChunkId(selection) : currentReadingChunkId();
  const offset = anchorInsideReader && focusInsideReader ? offsetInReaderChunk(chunkId, text) : null;
  return { text: text.slice(0, 500), offset, rect: null, chunkId };
}

function liveSelectedQuote() {
  const selection = window.getSelection?.();
  const text = selection ? String(selection.toString() || "").trim() : "";
  if (!selection || !text) return { text: "", offset: null, rect: null };
  const chunkText = $("chunkText");
  const anchorInsideReader = selection.anchorNode && chunkText.contains(selection.anchorNode);
  const focusInsideReader = selection.focusNode && chunkText.contains(selection.focusNode);
  if (!anchorInsideReader || !focusInsideReader) return { text: "", offset: null, rect: null };
  const chunkId = readerSelectionChunkId(selection);
  const offset = offsetInReaderChunk(chunkId, text);
  return { text: text.slice(0, 500), offset, rect: selectionFloatingRect(selection), chunkId };
}

function selectionFloatingRect(selection = window.getSelection?.()) {
  if (!selection || selection.rangeCount < 1) return null;
  const range = selection.getRangeAt(0);
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
  const rect = rects[0] || range.getBoundingClientRect();
  if (!rect || !rect.width || !rect.height) return null;
  return {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    right: Math.round(rect.right),
    bottom: Math.round(rect.bottom),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function positionImmersiveSelectionDock(dock) {
  if (!state.immersiveReading || !state.readerSelection?.rect) {
    dock.classList.remove("selection-dock-floating");
    dock.style.removeProperty("--selection-dock-left");
    dock.style.removeProperty("--selection-dock-top");
    dock.style.removeProperty("--selection-dock-width");
    return;
  }
  const rect = state.readerSelection.rect;
  const assistantWidth = document.body.classList.contains("immersive-assistant-collapsed")
    ? 0
    : Math.max(0, window.innerWidth - (document.querySelector(".assistant-pane")?.getBoundingClientRect().left || window.innerWidth));
  const maxRight = Math.max(280, window.innerWidth - assistantWidth - 18);
  const width = Math.min(680, Math.max(320, maxRight - 36));
  const left = Math.max(18, Math.min(rect.left, maxRight - width));
  const top = Math.max(18, Math.min(window.innerHeight - 112, rect.bottom + 10));
  dock.classList.add("selection-dock-floating");
  dock.style.setProperty("--selection-dock-left", `${Math.round(left)}px`);
  dock.style.setProperty("--selection-dock-top", `${Math.round(top)}px`);
  dock.style.setProperty("--selection-dock-width", `${Math.round(width)}px`);
}

function renderSelectionDock() {
  const dock = $("selectionDock");
  if (!dock) return;
  const quote = state.readerSelection?.text || "";
  dock.hidden = !quote;
  document.body.classList.toggle("reader-selection-active", Boolean(quote));
  positionImmersiveSelectionDock(dock);
  const quoteLabel = quote ? `${quote.length} 字 · ${quote.slice(0, 180)}` : "未选择原文";
  $("selectionDockQuote").textContent = quoteLabel;
  $("selectionAskNovaBtn").disabled = !quote;
  $("selectionBacktrackBtn").disabled = !quote;
  $("selectionSinkBtn").disabled = !quote;
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
  state.readerSelection = { text: "", offset: null, rect: null };
  window.getSelection?.().removeAllRanges?.();
  closeImmersiveNotesPane();
  closeImmersiveQuickNote({ clear: true });
  renderSelectionDock();
}

function clearEntityPeek() {
  state.entityPeek = null;
  renderEntityPeek();
}

function quotePayloadFromForm(form) {
  const selected = selectedQuote();
  const quote = String(form.get("quote") || "").trim() || selected.text;
  const chunkId = selected.chunkId || currentReadingChunkId();
  const sourceText = readerDisplayChunkText(chunkId);
  const offset = selected.text && quote === selected.text ? selected.offset : sourceText.indexOf(quote);
  return { quote, quoteOffset: offset >= 0 ? offset : undefined, chunkId };
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

function buildNovaAutonomousReadingPrompt() {
  return [
    "请你作为 Nova 自主阅读当前段落，不等我指定问题。",
    "你可以自己选择最值得看的角度：概念、隐喻、结构、疑点、值得停留的句子或后续线索。",
    "输出保持短而有用：",
    "1. 你决定先看哪里，为什么；",
    "2. 对这一段做一条具体评论，必须锚定原文；",
    "3. 选一句值得摘下来的话；",
    "4. 给我一个下一步阅读动作。",
    "不要泛泛总结，不要假装读了未传入的后文。"
  ].join("\n");
}

function buildNovaBookScoutPrompt() {
  const selected = activeBook();
  const title = selected?.title || selected?.bookId || "这本书";
  return [
    `请你作为 Nova 在我继续读《${title}》之前，先自主巡读一次。`,
    "你可以从系统传入的目录和候选正文里自己挑一个最值得停留的位置。",
    "输出保持短而有用：",
    "1. 你先看了哪里，为什么选这里；",
    "2. 对这个段落做一条具体评论，必须锚定原文；",
    "3. 选一句值得我稍后留意的话；",
    "4. 给我一个下一步阅读动作。",
    "只能评论已传入的候选正文，不要假装读完整本书。"
  ].join("\n");
}

function prepareNovaPromptFromCurrentReading() {
  if (!state.readerSelection?.text) captureReaderSelection();
  const quote = selectedQuote();
  if (quote.text) {
    $("novaPrompt").value = buildNovaPromptFromSelection();
    log("已把选区带入 Nova 提问。");
  } else if (!$("novaPrompt").value.trim()) {
    $("novaPrompt").value = "请陪我继续读当前段落：先定位这一段，再指出一句值得停留的话，最后给一个下一步。";
  }
  revealNovaForReadingAction();
  focusPanel(".nova-reading-box", "#novaPrompt");
}

function openImmersiveNovaCard({ prompt = "" } = {}) {
  if (!state.immersiveReading) {
    prepareNovaPromptFromCurrentReading();
    return;
  }
  if (!state.readerSelection?.text) captureReaderSelection();
  const input = $("immersiveNovaPrompt");
  if (input && prompt) input.value = prompt;
  else if (input && !input.value.trim()) input.value = buildNovaPromptFromSelection();
  state.immersiveNovaCardOpen = true;
  renderImmersiveNovaCard();
  window.setTimeout(() => $("immersiveNovaPrompt")?.focus(), 80);
}

function closeImmersiveNovaCard() {
  state.immersiveNovaCardOpen = false;
  renderImmersiveNovaCard();
}

function renderImmersiveNovaCard() {
  const card = $("immersiveNovaCard");
  if (!card) return;
  card.hidden = !state.immersiveNovaCardOpen;
  if (card.hidden) return;
  const quote = state.readerSelection?.text || selectedQuote().text || "";
  const meta = $("immersiveNovaMeta");
  const reply = $("immersiveNovaReply");
  const ask = $("immersiveNovaAskBtn");
  const save = $("immersiveNovaSaveBtn");
  const sink = $("immersiveNovaSinkBtn");
  const display = currentNovaDisplay();
  if (meta) {
    const chunkId = currentReadingChunkId();
    const base = quote ? `${quote.length} 字选区 · ${chunkId}` : `当前段 · ${chunkId || "未选择"}`;
    meta.textContent = display?.statusText ? `${base} · ${display.statusText}` : base;
  }
  if (state.novaAskPending) {
    if (reply) {
      reply.className = "immersive-nova-reply empty";
      reply.textContent = `Nova 正在读。最长会等 ${Math.round(NOVA_REQUEST_TIMEOUT_MS / 60000)} 分钟。`;
    }
    if (ask) ask.disabled = true;
    if (save) save.disabled = true;
    if (sink) sink.disabled = true;
    return;
  }
  if (ask) ask.disabled = false;
  if (state.novaAskError) {
    if (reply) {
      reply.className = "immersive-nova-reply error";
      reply.textContent = state.novaAskError.message;
    }
    if (save) save.disabled = true;
    if (sink) sink.disabled = true;
    return;
  }
  if (reply) {
    reply.className = display?.text ? "immersive-nova-reply" : "immersive-nova-reply empty";
    reply.textContent = display?.text || "Nova 的回应会在这里。";
  }
  const canUseReply = Boolean(display?.canUseReply && novaReplyUsableForSelectedBook());
  if (save) save.disabled = !canUseReply;
  if (sink) sink.disabled = !canUseReply;
}

async function askNovaFromImmersiveCard() {
  const button = $("immersiveNovaAskBtn");
  if (button) button.disabled = true;
  try {
    const input = $("immersiveNovaPrompt");
    const prompt = String(input?.value || "").trim() || buildNovaPromptFromSelection();
    $("novaPrompt").value = prompt;
    await askNovaWithPrompt(prompt);
  } catch {
    // askNovaWithPrompt already logs and renders the user-facing error.
  } finally {
    renderImmersiveNovaCard();
  }
}

async function saveNovaReplyFromImmersiveCard() {
  const button = $("immersiveNovaSaveBtn");
  if (button) button.disabled = true;
  try {
    const result = await command(novaReplyNotePayload());
    await readSelectedChunk();
    state.immersiveNovaCardOpen = true;
    renderImmersiveNovaCard();
    log(`已把 Nova 回复存成笔记: ${result.data?.noteId || state.selectedChunkId}`);
  } catch (error) {
    log(error.message || String(error));
  } finally {
    renderImmersiveNovaCard();
  }
}

async function sinkNovaReplyFromImmersiveCard() {
  const button = $("immersiveNovaSinkBtn");
  if (button) button.disabled = true;
  try {
    const result = await createNovaReplySinkPreview();
    state.immersiveNovaCardOpen = true;
    renderImmersiveNovaCard();
    log(`已生成 Nova 回复沉淀预览: ${result.reviewId}`);
  } catch (error) {
    log(error.message || String(error));
  } finally {
    renderImmersiveNovaCard();
    renderChunkReview();
  }
}

function prepareNoteFromCurrentReading() {
  if (!state.readerSelection?.text) captureReaderSelection();
  if (state.readerSelection?.text || selectedQuote().text) {
    fillFormFromSelection("userNoteForm");
    log("已把选区带入我的笔记。");
  }
  openImmersiveNotesPane();
  focusPanel("#userNoteForm", '#userNoteForm textarea[name="note"]');
}

async function saveUserNote({ quote, quoteOffset, chunkId: inputChunkId = "", note, status = "open", kind = "note" }) {
  const selected = activeBook();
  const chunkId = inputChunkId || selectedQuote().chunkId || currentReadingChunkId();
  if (!selected || !chunkId) throw new Error("请先选择一本书和一个 chunk。");
  if (!quote || !note) throw new Error("用户笔记需要引用和内容。");
  await command({
    command: "user_note_create",
    bookId: selected.bookId,
    chunkId,
    quote,
    quoteOffset,
    note,
    kind,
    status,
    tags: ["co-reading", "sidecar", "user-note"],
  });
}

async function saveAnnotation({ quote, quoteOffset, chunkId: inputChunkId = "", note, kind = "annotation" }) {
  const selected = activeBook();
  const chunkId = inputChunkId || selectedQuote().chunkId || currentReadingChunkId();
  if (!selected || !chunkId) throw new Error("请先选择一本书和一个 chunk。");
  if (!quote || !note) throw new Error("边注需要引用和内容。");
  await command({
    command: "annotate",
    bookId: selected.bookId,
    chunkId,
    quote,
    quoteOffset,
    note,
    kind,
    tags: ["co-reading", "sidecar"],
  });
}

function currentNovaContext(selected, chunk, text, quote, { chunkId = state.selectedChunkId } = {}) {
  const index = chunkOrder(chunkId);
  return {
    coReadingContextVersion: "2026-06-selection-dock",
    contextMode: quote?.text ? "chunk+selection" : "chunk",
    runtimeAgent: "Nova",
    productMode: "single-agent-reader",
    bookId: selected.bookId,
    bookTitle: selected.title || selected.bookId,
    chunkId,
    chunkTitle: chunk.title || chunk.sectionTitle || chunkId,
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
    renderImmersiveBacktrack();
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
  renderImmersiveBacktrack();
}

function backtrackRanges(evidence = state.backtrackEvidence) {
  if (!evidence) return [];
  const ranges = evidence.evidence?.rangeSummaries || evidence.ranges || [];
  if (ranges.length) return ranges;
  return (evidence.chunkIds || []).slice(0, 6).map((chunkId) => ({ startChunkId: chunkId, endChunkId: chunkId, chunkIds: [chunkId], label: chunkId }));
}

function renderImmersiveBacktrack() {
  const card = $("immersiveBacktrack");
  if (!card) return;
  const evidence = state.backtrackEvidence;
  const ranges = backtrackRanges(evidence);
  const anchors = evidence?.evidence?.anchorSnippets || [];
  const step = $("immersiveBacktrackStep");
  const title = $("immersiveBacktrackTitle");
  const meta = $("immersiveBacktrackMeta");
  const list = $("immersiveBacktrackList");
  const openBtn = $("immersiveBacktrackOpenBtn");
  const planBtn = $("immersiveBacktrackPlanBtn");
  const sinkBtn = $("immersiveBacktrackSinkBtn");
  const approveBtn = $("immersiveBacktrackApproveSinkBtn");
  const executeBtn = $("immersiveBacktrackExecuteSinkBtn");
  const openSinkBtn = $("immersiveBacktrackOpenSinkBtn");
  const sinkPreview = state.backtrackSinkPreviewId && state.selectedSinkPreview?.previewId === state.backtrackSinkPreviewId
    ? state.selectedSinkPreview
    : null;
  if (!evidence) {
    if (step) step.textContent = "兴趣回溯";
    if (title) title.textContent = "暂无回溯证据";
    if (meta) meta.textContent = "选中原文后点击追线索。";
    if (list) {
      list.className = "reader-backtrack-list empty";
      list.textContent = "暂无证据";
    }
    if (openBtn) openBtn.disabled = true;
    if (planBtn) planBtn.disabled = true;
    if (sinkBtn) sinkBtn.disabled = true;
    if (approveBtn) approveBtn.disabled = true;
    if (executeBtn) executeBtn.disabled = true;
    if (openSinkBtn) openSinkBtn.disabled = true;
    return;
  }
  if (step) step.textContent = `${anchors.length} 个锚点 · ${ranges.length} 组范围`;
  if (title) title.textContent = evidence.evidence?.title || `兴趣点回溯: ${evidence.query || evidence.anchorChunkId || ""}`;
  if (meta) meta.textContent = [
    `线索 ${evidence.query || ""}`,
    `覆盖 ${(evidence.chunkIds || []).length} chunks`,
    state.backtrackSinkPreviewId ? `预览 ${state.backtrackSinkPreviewId}${sinkPreview?.status ? ` · ${sinkPreview.status}` : ""}` : "",
  ].filter(Boolean).join(" · ");
  if (list) {
    list.className = ranges.length ? "reader-backtrack-list" : "reader-backtrack-list empty";
    list.innerHTML = ranges.length
      ? ranges.slice(0, 6).map((range, index) => {
        const chunkIds = range.chunkIds || [range.startChunkId, range.endChunkId].filter(Boolean);
        const target = range.startChunkId || chunkIds[0] || evidence.anchorChunkId;
        const label = range.label || `${range.startChunkId || target}${range.endChunkId && range.endChunkId !== target ? ` -> ${range.endChunkId}` : ""}`;
        return `
          <button type="button" data-backtrack-chunk-id="${escapeHtml(target || "")}" ${target ? "" : "disabled"}>
            <span>${escapeHtml(String(index + 1).padStart(2, "0"))}</span>
            <strong>${escapeHtml(label || target || "范围")}</strong>
            <small>${escapeHtml((range.summary || range.intent || chunkIds.join(", ") || "").slice(0, 140))}</small>
          </button>
        `;
      }).join("")
      : "没有可打开的范围。";
  }
  if (openBtn) openBtn.disabled = !ranges.length;
  if (planBtn) planBtn.disabled = !ranges.length;
  if (sinkBtn) sinkBtn.disabled = !ranges.length;
  if (approveBtn) approveBtn.disabled = !state.backtrackSinkPreviewId || sinkPreview?.status !== "pending";
  if (executeBtn) executeBtn.disabled = !state.backtrackSinkPreviewId || sinkPreview?.status !== "approved";
  if (openSinkBtn) openSinkBtn.disabled = !state.backtrackSinkPreviewId;
}

async function createImmersiveBacktrackSinkPreview() {
  const previewId = await sinkTrailGuide({ openPreview: false });
  if (!previewId) throw new Error("回溯沉淀没有返回预览 ID。");
  state.backtrackSinkPreviewId = previewId;
  state.selectedSinkPreview = await loadSinkPreview(previewId);
  state.selectedSinkDiff = null;
  renderSinkDetail();
  renderSinks();
  renderImmersiveBacktrack();
  log(`已生成回溯沉淀预览: ${previewId}`);
}

async function approveImmersiveBacktrackSinkPreview() {
  if (!state.backtrackSinkPreviewId) throw new Error("请先生成回溯沉淀预览。");
  state.selectedSinkPreview = await loadSinkPreview(state.backtrackSinkPreviewId);
  state.selectedSinkDiff = null;
  renderSinkDetail();
  await updateSinkPreviewContent(state.selectedSinkPreview, { status: "approved", note: "immersive backtrack approve" });
  state.selectedSinkPreview = await loadSinkPreview(state.backtrackSinkPreviewId);
  renderSinkDetail();
  renderSinks();
  renderImmersiveBacktrack();
  log(`已批准回溯沉淀预览: ${state.backtrackSinkPreviewId}`);
}

async function executeImmersiveBacktrackSinkPreview() {
  if (!state.backtrackSinkPreviewId) throw new Error("请先生成并批准回溯沉淀预览。");
  state.selectedSinkPreview = await loadSinkPreview(state.backtrackSinkPreviewId);
  state.selectedSinkDiff = null;
  renderSinkDetail();
  if (state.selectedSinkPreview.status !== "approved") throw new Error("请先批准回溯沉淀预览。");
  const executed = await executeSelectedSinkPreview();
  state.selectedSinkPreview = await loadSinkPreview(state.backtrackSinkPreviewId);
  state.selectedSinkDiff = null;
  renderSinkDetail();
  renderSinks();
  renderImmersiveBacktrack();
  if (executed) log(`已写入回溯沉淀: ${state.backtrackSinkPreviewId}`);
}

async function openImmersiveBacktrackSinkPreview() {
  if (!state.backtrackSinkPreviewId) throw new Error("当前没有回溯沉淀预览。");
  await openQueueSink(state.backtrackSinkPreviewId);
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
        targets: currentChunkSinkTargets(),
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
  const preview = sinkPreviewsForCurrentChunk()[0] || visibleSinkPreviewsForBook(activeBook())[0] || null;
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

async function approveCurrentChunkSinkPreview() {
  const preview = sinkPreviewsForCurrentChunk().find((item) => item.status === "pending");
  if (!preview?.previewId) throw new Error("当前段没有待批准沉淀。");
  $("cardSinkDrawer").open = true;
  state.selectedSinkPreview = await loadSinkPreview(preview.previewId);
  state.selectedSinkDiff = null;
  renderSinkDetail();
  renderSinks();
  await updateSinkPreviewContent(state.selectedSinkPreview, { status: "approved", note: "reader approve current chunk sink" });
  focusPanel(".sink-detail", "#sinkPreviewContent");
  log(`已批准本段沉淀: ${preview.previewId}`);
}

async function executeCurrentChunkSinkPreview() {
  const preview = sinkPreviewsForCurrentChunk().find((item) => item.status === "approved");
  if (!preview?.previewId) throw new Error("当前段没有已批准沉淀。");
  $("cardSinkDrawer").open = true;
  state.selectedSinkPreview = await loadSinkPreview(preview.previewId);
  state.selectedSinkDiff = null;
  renderSinkDetail();
  renderSinks();
  if (sinkPreviewNeedsVaultPath(state.selectedSinkPreview) && !applyPreviewVaultPath(state.selectedSinkPreview)) {
    focusPanel(".sink-settings", "#vaultPath");
    $("vaultPath")?.focus();
    log("请先填写 Obsidian Vault 路径，再写入本段。");
    return;
  }
  const executed = await executeSelectedSinkPreview();
  focusPanel(".sink-detail", "#sinkPreviewContent");
  if (executed) log(`已写入本段沉淀: ${preview.previewId}`);
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

function executedPlanStepFromResult(result) {
  const data = result?.data || result?.raw || result || {};
  return data.executedStep || data.recorded?.recordedStep || data.execution?.recordedStep || null;
}

async function openExecutedPlanRange(result, fallbackStep) {
  const step = executedPlanStepFromResult(result) || fallbackStep;
  const targetChunkId = step?.chunkIds?.[0] || step?.range?.startChunkId || step?.startChunkId;
  if (!targetChunkId) return false;
  await selectChunk(targetChunkId, true);
  return true;
}

async function executePlanGuideStep() {
  const { plan, nextStep } = planGuideSelection();
  if (!plan) throw new Error("当前没有活跃计划。");
  if (!nextStep) throw new Error("当前没有可执行的计划下一步。");
  setStatus("执行计划中", "busy");
  const result = await api("/api/command", {
    method: "POST",
    body: JSON.stringify({ command: "plan_execute_step", planId: plan.planId }),
  });
  delete state.planNextCache[plan.planId];
  const openedPreview = await openPreviewFromResult(result, { refreshSnapshot: false });
  await loadSnapshot();
  const openedRange = await openExecutedPlanRange(result, nextStep);
  try {
    await copyPlanExecutionArtifacts(plan.planId, result);
  } catch (error) {
    log(`计划已执行，但复制工件失败: ${error.message || String(error)}`);
  }
  renderReadingQueue();
  renderReadingNowBar();
  renderPlanGuide();
  if (openedPreview) {
    focusPanel(".sink-panel", "#sinkDetail");
  } else {
    focusPanel(".reader-surface", "#chunkText");
  }
  log(`已执行计划一步: ${nextStep.title || nextStep.stepId || plan.planId}${openedRange ? "，已打开范围" : ""}`);
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
    $("previewSinkLocalDiffBtn").disabled = true;
    $("compactSinkContentBtn").disabled = true;
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
  $("previewSinkLocalDiffBtn").disabled = !editable;
  $("compactSinkContentBtn").disabled = !editable;
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
  const queue = [
    result,
    result?.data,
    result?.raw,
    result?.details,
    result?.details?.data,
    result?.toolResult,
    result?.toolResult?.details,
    result?.toolResult?.details?.data,
    result?.sinkPreview,
    result?.sinkPreview?.data,
    result?.sinkPreview?.raw,
  ];
  const seen = new Set();
  while (queue.length) {
    const data = queue.shift();
    if (!data || typeof data !== "object" || seen.has(data)) continue;
    seen.add(data);
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
    if (runPreviewId) return runPreviewId;
    queue.push(data.data, data.raw, data.details, data.result, data.result?.data);
  }
  return null;
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
  if (data.kind === "local-content-diff") {
    panel.className = data.hasCriticalRemoval ? "obsidian-diff-panel warning" : "obsidian-diff-panel";
    const warning = data.hasCriticalRemoval
      ? `警示：${data.criticalRemovedFields.map((field) => `${field.label} -${field.removedLineCount}`).join("、")}，保存/批准前请确认没有丢失来源证据。`
      : "";
    const fields = (data.fields || []).map((field) => `${field.changed ? "* " : "- "}${field.label}: +${field.addedLineCount || 0} / -${field.removedLineCount || 0}`).join("\n");
    const detail = [warning, fields, data.preview].filter(Boolean).join("\n\n");
    panel.innerHTML = `
      <strong>${data.identical ? "正文未改动" : "保存前改动"}</strong>
      <small>新增 ${escapeHtml(data.addedLineCount || 0)} · 移除 ${escapeHtml(data.removedLineCount || 0)}</small>
      <pre>${escapeHtml(detail || "无差异")}</pre>
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

function skillActionState(action, { selected = activeBook(), hasChunk = !!selected && !!state.selectedChunkId } = {}) {
  if (action === "pre-read") {
    return {
      label: hasChunk ? "预读本段" : "先看本书",
      disabled: !selected,
      status: selected
        ? (hasChunk ? "Nova 会自己选择当前段附近候选。" : "Nova 会先从目录和正文候选里挑一处。")
        : "选择书籍后可用。"
    };
  }
  const actions = {
    review: ["写评注", "打开当前段评注表单。"],
    backtrack: ["追线索", "按选区、搜索框或当前标题回溯证据。"],
    notes: ["记笔记", "打开当前段私有笔记和边注。"],
    sink: ["生成预览", "创建待批准沉淀预览，不会直接写入。"],
  };
  const [label, readyStatus] = actions[action] || ["使用", "执行这个技能。"];
  return {
    label,
    disabled: !hasChunk,
    status: hasChunk ? readyStatus : "选择书籍和段落后可用。"
  };
}

function renderSkillOverview() {
  const list = $("skillOverviewList");
  if (!list) return;
  const skills = Array.isArray(state.agentSkills) ? state.agentSkills : [];
  if (!skills.length) {
    list.className = "skill-overview-list empty";
    list.textContent = "技能目录暂不可用；阅读器正文和本地笔记仍可继续使用。";
    return;
  }
  list.className = "skill-overview-list";
  const selected = activeBook();
  const hasChunk = !!selected && !!state.selectedChunkId;
  list.innerHTML = skills.map((skill) => {
    const tools = Array.isArray(skill.tools) ? skill.tools : [];
    const toolLabel = tools.length ? `${tools.length} 个工具` : "无工具";
    const action = skillActionState(skill.action || "", { selected, hasChunk });
    return `<article class="skill-card" data-skill-id="${escapeHtml(skill.id)}">
      <div>
        <span>${escapeHtml(skill.category || "skill")} · ${escapeHtml(toolLabel)}</span>
        <strong>${escapeHtml(skill.label || skill.id)}</strong>
        <p>${escapeHtml(skill.summary || "")}</p>
        <small>${escapeHtml(skill.howToUse || "")}</small>
        <em class="skill-card-state">${escapeHtml(action.status)}</em>
      </div>
      <button class="secondary compact skill-card-action" type="button" data-skill-action="${escapeHtml(skill.action || "")}" ${action.disabled ? "disabled" : ""}>${escapeHtml(action.label)}</button>
    </article>`;
  }).join("");
}

function closeSkillsPane() {
  const pane = document.querySelector(".skills-pane");
  const toggle = $("skillsPageToggleBtn");
  if (!pane) return;
  pane.hidden = true;
  document.body.classList.remove("skills-pane-open");
  if (toggle) toggle.setAttribute("aria-expanded", "false");
}

async function useAgentSkill(action) {
  const selected = activeBook();
  const hasChunk = !!selected && !!state.selectedChunkId;
  if (action === "pre-read") {
    if (!selected) throw new Error("请先选择一本书。");
    closeSkillsPane();
    await runNovaAutonomousReading({ manual: true, bookScout: !hasChunk });
    focusPanel(".reader-surface", "#chunkText");
    return;
  }
  if (action === "review") {
    if (!hasChunk) throw new Error("请先选择一本书和段落。");
    const form = $("reviewForm");
    form.elements.startChunkId.value = currentReadingChunkId();
    form.elements.endChunkId.value = currentReadingChunkId();
    form.elements.summary.value = form.elements.summary.value || `读到 ${currentReadingChunkId()}：`;
    renderReviewRangeStatus();
    openContainingDrawer(form);
    focusPanel("#reviewForm", '#reviewForm textarea[name="summary"]');
    return;
  }
  if (action === "backtrack") {
    if (!hasChunk) throw new Error("请先选择一本书和段落。");
    closeSkillsPane();
    await createBacktrackPlan(currentReadingChunkId());
    focusPanel("#backtrackEvidence", "#backtrackEvidence");
    return;
  }
  if (action === "notes") {
    if (!hasChunk) throw new Error("请先选择一本书和段落。");
    const quote = selectedQuote();
    if (quote.text) fillQuoteFromSelection("userNoteForm");
    focusPanel("#userNoteForm", '#userNoteForm textarea[name="note"]');
    return;
  }
  if (action === "sink") {
    if (!hasChunk) throw new Error("请先选择一本书和段落。");
    closeSkillsPane();
    const result = await createCurrentChunkSinkPreview({ focusSink: true });
    log(`已生成本段沉淀预览: ${result.reviewId}`);
    return;
  }
}

function renderAll() {
  renderMetrics();
  renderSkillOverview();
  renderBooks();
  renderChunks();
  renderReaderToc();
  renderReader();
  renderReadingSession();
  renderReaderProgress();
  renderReadingNowBar();
  renderWaypoints();
  renderReadingQueue();
  renderPlanGuide();
  renderReaderPlanStrip();
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
    resetReaderFlow();
    return;
  }
  state.chunks = (await query({ command: "list_chunks", bookId })) || [];
  if (!state.chunks.some((chunk) => getChunkId(chunk) === state.selectedChunkId)) {
    const saved = validSavedReadingSessionForBook(bookId);
    state.selectedChunkId = saved?.chunkId && state.chunks.some((chunk) => getChunkId(chunk) === saved.chunkId)
      ? saved.chunkId
      : preferredReadingChunkIdFrom();
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
  const saved = validSavedReadingSessionForBook(selected.bookId);
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
  setReaderFlowFromCurrent(selected);
  renderReader();
  void loadReaderFlow(selected).catch((error) => log(error.message || String(error)));
  renderChunkReview();
  renderAnnotations();
  renderUserNotes();
  renderSubmissions();
  if (saved?.bookId === state.selectedBookId && saved?.chunkId === state.selectedChunkId) restoreSavedScroll(saved);
  else saveReadingSession();
  renderReaderProgress();
  renderReadingQueue();
  maybeScheduleNovaAutonomousReading();
  maybeScheduleNovaBookScout();
}

async function selectChunk(chunkId, autoRead = true, { resetScroll = true } = {}) {
  clearReaderSelection();
  clearEntityPeek();
  state.readerFind = { query: "", matches: [], activeIndex: -1 };
  state.selfCheck.hintVisible = false;
  state.currentChunk = null;
  state.annotations = [];
  state.userNotes = [];
  state.submissions = [];
  state.illustrationSuggestions = [];
  state.selectedChunkId = chunkId;
  if (resetScroll) saveReadingSession({ chunkId, scrollTop: 0, scrollLeft: 0, scrollPercent: 0 });
  $("chunkSelect").value = chunkId;
  renderChunks();
  if (autoRead) await readSelectedChunk();
  renderReaderProgress();
  renderReadingQueue();
}

async function moveChunk(delta, { restoreEnd = false } = {}) {
  const index = chunkOrder(state.selectedChunkId);
  if (index === null) return;
  const next = state.chunks[index + delta];
  const nextId = getChunkId(next);
  if (!nextId) return;
  await selectChunk(nextId, true);
  if (restoreEnd) jumpReaderToPageEnd();
}

async function continueReading() {
  const selected = activeBook();
  if (!selected) return;
  const saved = validSavedReadingSessionForBook(selected.bookId);
  if (saved?.chunkId && state.chunks.some((chunk) => getChunkId(chunk) === saved.chunkId)) {
    await selectChunk(saved.chunkId, true, { resetScroll: false });
    restoreSavedScroll(saved);
    focusPanel(".reader-surface", "#chunkText");
    log(`已回到本书现场: ${selected.title || selected.bookId} · ${saved.chunkId}`);
    return;
  }
  clearReaderSelection();
  clearEntityPeek();
  state.selfCheck.hintVisible = false;
  const result = await query({ command: "continue", bookId: selected.bookId });
  if (result?.completed) {
    log(result.message || "这本书已经读完。");
    return;
  }
  const returnedId = getChunkId(result?.chunk || result);
  const returnedIndex = chunkOrder(returnedId);
  const returnedChunk = state.chunks[returnedIndex ?? -1];
  const nextId = isPreferredReadingChunk(returnedChunk) ? returnedId : preferredReadingChunkIdFrom(returnedIndex ?? 0);
  if (nextId) {
    state.selectedChunkId = nextId;
    $("chunkSelect").value = nextId;
  }
  state.currentChunk = result;
  state.annotations = [];
  state.userNotes = [];
  state.submissions = [];
  saveReadingSession({ chunkId: state.selectedChunkId, scrollTop: 0, scrollLeft: 0, scrollPercent: 0 });
  renderChunks();
  renderReader();
  await readSelectedChunk();
  log(result.message || `继续阅读 ${selected.title || selected.bookId} · ${state.selectedChunkId}`);
}

async function markReadAndMaybeAdvance({ advance = false } = {}) {
  const selected = activeBook();
  if (!selected || !state.selectedChunkId) return;
  const completedChunkId = state.selectedChunkId;
  const completedTitle = chunkTitleById(completedChunkId);
  const currentIndex = chunkOrder(state.selectedChunkId);
  const nextId = currentIndex === null ? "" : getChunkId(state.chunks[currentIndex + 1]);
  const nextTitle = chunkTitleById(nextId);
  await command({ command: "mark_read", bookId: selected.bookId, chunkId: state.selectedChunkId });
  recordReadingVisitCompletion(selected.bookId);
  state.lastCompletedChunk = {
    bookId: selected.bookId,
    bookTitle: selected.title || selected.bookId,
    chunkId: completedChunkId,
    title: completedTitle,
    nextChunkId: nextId,
    nextTitle,
    completedAt: new Date().toISOString(),
  };
  await loadSnapshot();
  if (advance && nextId) {
    await selectChunk(nextId, true);
    focusPanel(".reader-surface", "#chunkText");
    log(`已读完 ${completedChunkId}，进入 ${nextId}。可点“回看 ${completedChunkId}”整理刚读内容。`);
    return;
  }
  await readSelectedChunk();
  log(nextId ? `已标记读完，下一段是 ${nextId}。` : "已标记读完，本书到达最后一段。");
}

async function openLastCompletedChunkReview() {
  const last = state.lastCompletedChunk;
  if (!last?.chunkId || last.bookId !== state.selectedBookId) throw new Error("还没有可回看的刚读段落。");
  await selectChunk(last.chunkId, true);
  focusPanel("#chunkReviewCard", "#copyChunkReviewBtn");
  log(`已回看刚读: ${last.chunkId}${last.title ? ` · ${last.title}` : ""}`);
}

async function reviewLastCompletedInReader() {
  const last = state.lastCompletedChunk;
  if (!last?.chunkId || last.bookId !== state.selectedBookId) throw new Error("还没有可回看的刚读段落。");
  await selectChunk(last.chunkId, true);
  focusPanel(".reader-surface", "#chunkText");
  log(`已回看刚读: ${last.chunkId}${last.title ? ` · ${last.title}` : ""}`);
}

async function resumeAfterLastCompletedReview() {
  const last = state.lastCompletedChunk;
  if (!last?.nextChunkId || last.bookId !== state.selectedBookId) throw new Error("还没有可回到的继续阅读位置。");
  await selectChunk(last.nextChunkId, true);
  focusPanel(".reader-surface", "#chunkText");
  log(`已回到继续读: ${last.nextChunkId}${last.nextTitle ? ` · ${last.nextTitle}` : ""}`);
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

function openImmersiveNotesPane() {
  closeImmersiveToolsPane();
  closeImmersiveFootprints();
  if (!state.immersiveReading) return;
  document.body.classList.add("immersive-notes-open");
}

function closeImmersiveNotesPane() {
  document.body.classList.remove("immersive-notes-open");
}

function openImmersiveQuickNote() {
  if (!state.readerSelection?.text) captureReaderSelection();
  if (!state.readerSelection?.text) {
    log("请先选中要记下来的原文。");
    return;
  }
  const panel = $("immersiveQuickNote");
  if (!panel) return;
  panel.hidden = false;
  state.quickNoteLastQuote = null;
  setQuickSinkPreview(null);
  $("immersiveQuickNoteStatus").textContent = `引用：${state.readerSelection.text.slice(0, 80)}`;
  window.setTimeout(() => $("immersiveQuickNoteInput")?.focus(), 80);
}

function closeImmersiveQuickNote({ clear = false } = {}) {
  const panel = $("immersiveQuickNote");
  if (panel) panel.hidden = true;
  if (clear) {
    $("immersiveQuickNoteInput").value = "";
    state.quickNoteLastQuote = null;
    setQuickSinkPreview(null);
  }
}

function setQuickSinkPreview(preview) {
  state.quickNoteSinkPreviewId = preview?.previewId || "";
  const status = preview?.status || "";
  $("immersiveQuickSinkBtn").disabled = !state.quickNoteLastQuote;
  $("immersiveQuickApproveSinkBtn").disabled = status !== "pending";
  $("immersiveQuickExecuteSinkBtn").disabled = status !== "approved";
}

function openImmersiveToolsPane() {
  closeImmersiveNotesPane();
  closeImmersiveFootprints();
  if (!state.immersiveReading) return;
  document.body.classList.add("immersive-tools-open");
}

function closeImmersiveToolsPane() {
  document.body.classList.remove("immersive-tools-open");
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
    applyNovaAgentRuns(snapshot.agentRuns || []);
    state.backgroundRunners = state.snapshot.backgroundRunners || [];
    const savedBookExists = saved?.bookId && state.snapshot.books?.some((book) => book.bookId === saved.bookId);
    const selected = chooseInitialBook(state.snapshot, saved);
    state.selectedBookId = selected?.bookId || "";
    await loadChunks(state.selectedBookId);
    const bookSession = validSavedReadingSessionForBook(state.selectedBookId);
    const hasStoredBookSession = hasStoredReadingSessionForBook(state.selectedBookId);
    if (bookSession?.chunkId) {
      state.selectedChunkId = bookSession.chunkId;
    } else if (hasStoredBookSession) {
      state.selectedChunkId = nextUnreadChunkId(selected) || preferredReadingChunkIdFrom();
    } else if (savedBookExists && saved?.bookId === state.selectedBookId && saved.chunkId && state.chunks.some((chunk) => getChunkId(chunk) === saved.chunkId)) {
      state.selectedChunkId = saved.chunkId;
    } else if (selected?.lastChunkId && state.chunks.some((chunk) => getChunkId(chunk) === selected.lastChunkId)) {
      state.selectedChunkId = nextUnreadChunkId(selected) || selected.lastChunkId;
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

function titleFromLocalBookPath(relativePath) {
  return String(relativePath || "")
    .split(/[\\/]/)
    .pop()
    .replace(/\.[^.]+$/, "")
    .replace(/\s*\((Z-Library|z-lib|未知)[^)]+\)\s*$/i, "")
    .trim();
}

function renderLocalLibraryBooks(data) {
  const select = $("localLibrarySelect");
  const status = $("localLibraryStatus");
  if (!select || !status) return;
  const books = Array.isArray(data?.books) ? data.books : [];
  select.innerHTML = "";
  if (!books.length) {
    select.disabled = true;
    select.appendChild(new Option("未找到可导入的书", ""));
    status.textContent = data?.root ? `${data.root} · 0 本` : "未找到书";
    return;
  }
  select.disabled = false;
  select.appendChild(new Option("选择一本本地书", ""));
  for (const book of books) {
    const label = `${book.relativePath} · ${book.format || "txt"} · ${formatBytes(book.size)}`;
    select.appendChild(new Option(label, book.relativePath));
  }
  status.textContent = `${data.root || "本地书库"} · ${books.length} 本`;
}

async function loadLocalLibrary() {
  const button = $("refreshLocalLibraryBtn");
  const status = $("localLibraryStatus");
  if (button) button.disabled = true;
  if (status) status.textContent = "扫描中";
  try {
    const data = await api("/api/local-library");
    renderLocalLibraryBooks(data);
    log(`已扫描本地书库: ${data.count || 0} 本`);
    return data;
  } catch (error) {
    if (status) status.textContent = "扫描失败";
    log(error.message || String(error));
    throw error;
  } finally {
    if (button) button.disabled = false;
  }
}

async function importLocalLibraryBook(formEl) {
  const form = new FormData(formEl);
  const relativePath = String(form.get("relativePath") || "").trim();
  if (!relativePath) {
    setFormError(formEl, "请先扫描并选择一本本地书。");
    return;
  }
  const title = String(form.get("title") || "").trim() || titleFromLocalBookPath(relativePath);
  setStatus("导入中", "busy");
  const imported = await importLocalLibraryPayload({
    relativePath,
    title,
    author: String(form.get("author") || "").trim(),
    headingRegex: String(form.get("headingRegex") || "").trim(),
    maxChars: Number(form.get("maxChars") || 12000),
    overwrite: form.get("overwrite") === "on",
  });
  log(imported);
  const keepSelectValue = relativePath;
  formEl.reset();
  $("localLibrarySelect").value = keepSelectValue;
  await openImportedBook(imported);
  focusPanel(".reader-surface", "#chunkText");
}

async function importLocalLibraryPayload(payload) {
  return api("/api/local-library/import", {
    method: "POST",
    body: JSON.stringify({
      relativePath: payload.relativePath,
      title: payload.title,
      author: payload.author || "",
      headingRegex: payload.headingRegex || "",
      maxChars: Number(payload.maxChars || 12000),
      overwrite: Boolean(payload.overwrite),
    }),
  });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  return bytesToBase64(bytes);
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function renderImportProgress(label = "", percent = 0) {
  const box = $("importProgress");
  const text = $("importProgressLabel");
  const fill = $("importProgressFill");
  if (!box || !text || !fill) return;
  box.hidden = !label;
  text.textContent = label || "准备导入";
  fill.style.width = `${clampPercent(percent)}%`;
}

async function importSmallFile(file, options) {
  const maxBytes = 1_250_000;
  if (file.size > maxBytes) {
    return null;
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

async function importChunkedFile(file, options) {
  const partBytes = 700_000;
  let upload = null;
  try {
    renderImportProgress("建立分片导入", 1);
    upload = await query({
      command: "import_begin",
      filename: file.name,
      format: fileFormat(file),
      bookId: bookIdFromFile(file),
      expectedBytes: file.size,
      title: options.title || undefined,
      author: options.author || undefined,
      maxChars: options.maxChars || undefined,
      headingRegex: options.headingRegex || undefined,
      overwrite: options.overwrite,
    });
    const uploadId = upload.uploadId;
    if (!uploadId) throw new Error("分片导入没有返回 uploadId。");
    let partIndex = 0;
    for (let start = 0; start < file.size; start += partBytes) {
      const end = Math.min(file.size, start + partBytes);
      const buffer = await file.slice(start, end).arrayBuffer();
      await query({
        command: "import_part",
        uploadId,
        index: partIndex,
        dataBase64: bytesToBase64(new Uint8Array(buffer)),
      });
      partIndex += 1;
      renderImportProgress(`上传 ${Math.round((end / file.size) * 100)}%`, (end / file.size) * 90);
    }
    renderImportProgress("解析 EPUB/TXT", 95);
    return query({ command: "import_finish", uploadId });
  } catch (error) {
    if (upload?.uploadId) {
      try {
        await query({ command: "import_cancel", uploadId: upload.uploadId });
      } catch {
        // Best effort cleanup; original import error is more useful to show.
      }
    }
    throw error;
  }
}

async function importFile(file, options) {
  const small = await importSmallFile(file, options);
  if (small) return small;
  return importChunkedFile(file, options);
}

async function openImportedBook(imported) {
  const bookId = imported?.bookId || imported?.data?.bookId || imported?.book?.bookId || "";
  if (!bookId) {
    await loadSnapshot();
    return;
  }
  state.selectedBookId = bookId;
  const firstChunkId = imported?.firstChunkId || imported?.data?.firstChunkId || "";
  state.selectedChunkId = firstChunkId;
  state.currentChunk = null;
  state.annotations = [];
  state.userNotes = [];
  state.submissions = [];
  state.searchResults = [];
  await loadSnapshot();
  state.selectedBookId = bookId;
  await loadChunks(bookId);
  const importedFirst = state.chunks.find((chunk) => getChunkId(chunk) === firstChunkId);
  state.selectedChunkId = isPreferredReadingChunk(importedFirst)
    ? firstChunkId
    : preferredReadingChunkIdFrom();
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
        ...sinkDestinationPayload(),
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
        ...sinkDestinationPayload(),
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
        ...sinkDestinationPayload(),
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
        ...sinkDestinationPayload(),
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
        ...sinkDestinationPayload(),
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
  const summary = event.target.closest("button[data-action='open-reading-memory']");
  if (summary) {
    toggleImmersiveFootprints();
    return;
  }
  const loose = event.target.closest("#immersiveReadingMemory button[data-footprint-action]");
  if (loose) {
    try {
      await openLooseFootprint(loose.dataset.footprintAction || "", loose.dataset.id || "");
    } catch (error) {
      log(error.message || String(error));
    }
    return;
  }
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

$("readingFootprints").addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.dataset.action === "close-footprints") {
    setReaderFootprintsOpen(false);
    closeImmersiveFootprints();
    focusPanel(".reader-surface", "#chunkText");
    return;
  }
  const id = target.dataset.footprintId || "";
  if (id) {
    focusReadingFootprint(id);
    return;
  }
  try {
    await openLooseFootprint(target.dataset.footprintAction || "", target.dataset.id || "");
  } catch (error) {
    log(error.message || String(error));
  }
});

$("readingQueueList").addEventListener("click", async (event) => {
  const target = event.target.closest("button[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  const id = target.dataset.id || "";
  target.disabled = true;
  try {
    if (action === "queue-read") {
      const saved = validSavedReadingSessionForBook(state.selectedBookId);
      await selectChunk(id, true, { resetScroll: !(saved?.chunkId === id) });
      if (saved?.chunkId === id) restoreSavedScroll(saved);
      focusPanel(".reader-surface", "#chunkText");
      return;
    }
    if (action === "queue-nova") {
      await runNovaAutonomousReading({ manual: true });
      focusPanel(".reader-surface", "#chunkText");
      return;
    }
    if (action === "queue-nova-history") {
      await openNovaPreReadHistory(id, { selectTarget: true });
      focusPanel(".nova-reading-box", "#novaReply");
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

$("novaPreReadHistory").addEventListener("click", async (event) => {
  const target = event.target.closest("button[data-nova-history-id]");
  if (!target) return;
  target.disabled = true;
  try {
    await openNovaPreReadHistory(target.dataset.novaHistoryId, { selectTarget: true });
    focusPanel(".nova-reading-box", "#novaReply");
  } catch (error) {
    log(error.message || String(error));
  } finally {
    target.disabled = false;
    renderNovaPreReadHistory();
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

$("planGuideExecuteBtn").addEventListener("click", async () => {
  $("planGuideExecuteBtn").disabled = true;
  try {
    await executePlanGuideStep();
  } catch (error) {
    log(error.message || String(error));
  } finally {
    renderReadingNowBar();
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

  $("readerPlanStripCreateBtn").addEventListener("click", async () => {
    $("readerPlanStripCreateBtn").disabled = true;
    try {
      await createPlanForCurrentSection();
    } catch (error) {
      log(error.message || String(error));
    } finally {
      renderReaderProgress();
      renderPlanGuide();
    }
  });

  $("readerPlanStripOpenRangeBtn").addEventListener("click", async () => {
    $("readerPlanStripOpenRangeBtn").disabled = true;
    try {
      await openPlanGuideRange();
    } catch (error) {
      log(error.message || String(error));
    } finally {
      renderReaderProgress();
      renderPlanGuide();
    }
  });

  $("readerPlanStripExecuteBtn").addEventListener("click", async () => {
    $("readerPlanStripExecuteBtn").disabled = true;
    try {
      await executePlanGuideStep();
    } catch (error) {
      log(error.message || String(error));
    } finally {
      renderReaderProgress();
      renderPlanGuide();
    }
  });

  $("readerPlanStripReviewBtn").addEventListener("click", async () => {
    $("readerPlanStripReviewBtn").disabled = true;
    try {
      await reviewPlanGuideStep();
    } catch (error) {
      log(error.message || String(error));
    } finally {
      renderPlanGuide();
    }
  });

  $("readerPlanStripToggleBtn").addEventListener("click", () => {
    setReaderPlanStripCollapsed(!state.readerPlanStripCollapsed);
  });

  $("chunkText").addEventListener("mouseup", () => {
    window.setTimeout(() => {
      captureReaderSelection();
  }, 0);
});
$("chunkText").addEventListener("click", async (event) => {
  const target = event.target.closest("button[data-nova-history-id]");
  if (!target) return;
  event.preventDefault();
  target.disabled = true;
  try {
    revealNovaForReadingAction();
    await openNovaPreReadHistory(target.dataset.novaHistoryId, { selectTarget: false });
    focusPanel(".nova-reading-box", "#novaReply");
    highlightNovaPreReadHistoryItem(target.dataset.novaHistoryId);
  } catch (error) {
    log(error.message || String(error));
  } finally {
    target.disabled = false;
  }
});
$("chunkText").addEventListener("dblclick", (event) => {
  if (!state.immersiveReading) return;
  event.preventDefault();
  clearReaderSelection();
  window.setTimeout(() => {
    toggleImmersiveCleanRead();
  }, 0);
});
$("chunkText").addEventListener("keyup", (event) => {
  if (event.key === "Shift" || event.key.startsWith("Arrow")) {
    captureReaderSelection();
  }
});
$("chunkText").addEventListener("scroll", () => {
  handleReaderScroll();
}, { passive: true });
window.addEventListener("resize", () => {
  if (state.immersiveReading && state.readerSelection?.text) renderSelectionDock();
});
document.addEventListener("selectionchange", () => {
  if (!state.immersiveReading) return;
  window.clearTimeout(state.selectionCaptureTimer);
  state.selectionCaptureTimer = window.setTimeout(() => {
    const quote = liveSelectedQuote();
    if (quote.text) {
      state.readerSelection = quote;
      renderSelectionDock();
    }
  }, 80);
});
function askNovaFromSelection() {
  if (!state.readerSelection?.text) captureReaderSelection();
  if (!state.readerSelection?.text) {
    log("请先在原文里选中一段想问 Nova 的话。");
    return;
  }
  const prompt = buildNovaPromptFromSelection();
  $("novaPrompt").value = prompt;
  if (state.immersiveReading) {
    openImmersiveNovaCard({ prompt });
    return;
  }
  revealNovaForReadingAction();
  focusPanel(".nova-reading-box", "#novaPrompt");
  $("askNovaBtn").click();
}

$("selectionAskNovaBtn").addEventListener("click", askNovaFromSelection);
$("selectionBacktrackBtn").addEventListener("click", async () => {
  const button = $("selectionBacktrackBtn");
  if (!state.readerSelection?.text) captureReaderSelection();
  if (!state.readerSelection?.text) {
    log("请先在原文里选中一段线索。");
    return;
  }
  button.disabled = true;
  try {
    await runTrailGuideBacktrack();
    if (state.immersiveReading) openImmersiveBacktrack();
    log(`已按选区追线索: ${trailGuideQuery()}`);
  } catch (error) {
    log(error.message || String(error));
  } finally {
    renderSelectionDock();
    renderTrailGuide();
  }
});
$("selectionSinkBtn").addEventListener("click", async () => {
  const button = $("selectionSinkBtn");
  if (!state.readerSelection?.text) captureReaderSelection();
  if (!state.readerSelection?.text) {
    log("请先在原文里选中要沉淀的范围。");
    return;
  }
  button.disabled = true;
  try {
    const result = await createSelectionSinkPreview();
    log(`已生成选区沉淀预览: ${result.reviewId}`);
  } catch (error) {
    log(error.message || String(error));
  } finally {
    renderSelectionDock();
    renderChunkReview();
  }
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
  if (state.immersiveReading) {
    openImmersiveQuickNote();
    return;
  }
  fillFormFromSelection("userNoteForm");
  openImmersiveNotesPane();
  focusPanel("#userNoteForm", '#userNoteForm textarea[name="note"]');
});
$("selectionAnnotateBtn").addEventListener("click", () => {
  if (!state.readerSelection?.text) captureReaderSelection();
  fillFormFromSelection("annotationForm");
  openImmersiveNotesPane();
  focusPanel("#annotationForm", '#annotationForm textarea[name="note"]');
});
$("selectionClearBtn").addEventListener("click", () => {
  clearReaderSelection();
});

async function saveImmersiveQuickNote(kind = "note") {
  const button = kind === "annotation" ? $("immersiveQuickAnnotationSaveBtn") : $("immersiveQuickNoteSaveBtn");
  const input = $("immersiveQuickNoteInput");
  const status = $("immersiveQuickNoteStatus");
  const quote = selectedQuote();
  const note = String(input?.value || "").trim();
  if (!quote.text || !note) {
    if (status) status.textContent = "需要选区和内容。";
    return;
  }
  button.disabled = true;
  try {
    if (kind === "annotation") await saveAnnotation({ quote: quote.text, quoteOffset: quote.offset, chunkId: quote.chunkId, note, kind: "annotation" });
    else await saveUserNote({ quote: quote.text, quoteOffset: quote.offset, chunkId: quote.chunkId, note, status: "open" });
    await readSelectedChunk();
    $("immersiveQuickNote").hidden = false;
    state.quickNoteLastQuote = quote;
    if (status) status.textContent = kind === "annotation" ? "已保存边注，可生成沉淀预览。" : "已保存笔记，可生成沉淀预览。";
    setQuickSinkPreview(null);
    input.value = "";
    log(kind === "annotation" ? "已保存选区边注。" : "已保存选区笔记。");
  } catch (error) {
    if (status) status.textContent = error.message || String(error);
    log(error.message || String(error));
  } finally {
    button.disabled = false;
  }
}

$("immersiveQuickNoteSaveBtn")?.addEventListener("click", () => void saveImmersiveQuickNote("note"));
$("immersiveQuickAnnotationSaveBtn")?.addEventListener("click", () => void saveImmersiveQuickNote("annotation"));
$("immersiveQuickNoteCloseBtn")?.addEventListener("click", () => closeImmersiveQuickNote());
$("immersiveQuickSinkBtn")?.addEventListener("click", async () => {
  const button = $("immersiveQuickSinkBtn");
  const status = $("immersiveQuickNoteStatus");
  const quote = state.quickNoteLastQuote || selectedQuote();
  if (!quote?.text) {
    if (status) status.textContent = "先保存一条选区笔记或边注。";
    return;
  }
  button.disabled = true;
  try {
    if (status) status.textContent = "正在生成沉淀预览...";
    const result = await createCurrentChunkSinkPreview({ quote });
    const preview = state.selectedSinkPreview;
    state.quickNoteLastQuote = quote;
    $("immersiveQuickNote").hidden = false;
    setQuickSinkPreview(preview);
    if (status) status.textContent = preview?.previewId ? "已生成预览，请先批准。" : "已生成预览，请在沉淀详情查看。";
    if (!state.immersiveReading) focusPanel(".sink-detail", "#sinkPreviewContent");
    log(`已生成快速笔记沉淀预览: ${result.reviewId}`);
  } catch (error) {
    if (status) status.textContent = error.message || String(error);
    log(error.message || String(error));
  } finally {
    button.disabled = !state.quickNoteLastQuote;
  }
});
$("immersiveQuickApproveSinkBtn")?.addEventListener("click", async () => {
  const button = $("immersiveQuickApproveSinkBtn");
  const status = $("immersiveQuickNoteStatus");
  if (!state.quickNoteSinkPreviewId) return;
  button.disabled = true;
  try {
    if (status) status.textContent = "正在批准沉淀预览...";
    state.selectedSinkPreview = await loadSinkPreview(state.quickNoteSinkPreviewId);
    state.selectedSinkDiff = null;
    renderSinkDetail();
    await updateSinkPreviewContent(state.selectedSinkPreview, { status: "approved", note: "immersive quick note approve" });
    $("immersiveQuickNote").hidden = false;
    setQuickSinkPreview(state.selectedSinkPreview);
    if (status) status.textContent = "已批准预览，可以执行写入。";
  } catch (error) {
    if (status) status.textContent = error.message || String(error);
    log(error.message || String(error));
  }
});
$("immersiveQuickExecuteSinkBtn")?.addEventListener("click", async () => {
  const button = $("immersiveQuickExecuteSinkBtn");
  const status = $("immersiveQuickNoteStatus");
  if (!state.quickNoteSinkPreviewId) return;
  button.disabled = true;
  try {
    if (status) status.textContent = "正在执行写入...";
    state.selectedSinkPreview = await loadSinkPreview(state.quickNoteSinkPreviewId);
    state.selectedSinkDiff = null;
    renderSinkDetail();
    if (state.selectedSinkPreview.status !== "approved") throw new Error("请先批准沉淀预览。");
    const executed = await executeSelectedSinkPreview();
    $("immersiveQuickNote").hidden = false;
    setQuickSinkPreview(state.selectedSinkPreview);
    if (status) status.textContent = executed ? "已执行写入，可在沉淀详情回读。" : "执行未完成，请查看沉淀详情。";
  } catch (error) {
    if (status) status.textContent = error.message || String(error);
    log(error.message || String(error));
  }
});
$("immersiveQuickNoteInput")?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  void saveImmersiveQuickNote(event.shiftKey ? "annotation" : "note");
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
    if (action === "sink-current") {
      target.disabled = true;
      try {
        const result = await createCurrentChunkSinkPreview();
        log(`已生成本段沉淀预览: ${result.reviewId}`);
      } finally {
        renderChunkReview();
      }
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
    if (action === "nova-history") {
      await openNovaPreReadHistory(id);
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
    const response = await runNovaAgent({
      ...payload,
      action: "interest_backtrack",
      createPlan: true,
      budget: { maxChunksPerStep: 2, maxAnnotationsPerChunk: 2 },
      annotationDensity: "medium",
      sinkPolicy: { requireApproval: true, obsidian: true },
      bookTitle: selected.title || selected.bookId,
      chunkTitle: chunkTitleById(anchorChunkId),
      createdBy: "CoReadingSidecar",
    });
    const run = response.run || {};
    const result = response.result || run.result || {};
    state.backtrackEvidence = result.backtrack || response.backtrack || result.data || result.raw || result;
    if (run.id) mergeNovaAgentRun(run);
    renderBacktrackEvidence();
    await loadSnapshot();
    log(result.backtrack || result);
  } catch (error) {
    log(error.message || String(error));
  }
}

async function runTrailGuideBacktrack() {
  const selected = activeBook();
  if (!selected || !state.selectedChunkId) throw new Error("请先选择一本书和 chunk。");
  const query = trailGuideQuery();
  if (query) $("searchInput").value = query;
  const response = await runNovaAgent({
    ...backtrackPayload(selected.bookId, state.selectedChunkId),
    action: "interest_backtrack",
    chunkId: state.selectedChunkId,
    bookTitle: selected.title || selected.bookId,
    chunkTitle: chunkTitleById(state.selectedChunkId),
    createPlan: false,
    includeEvidence: true,
  });
  const run = response.run || {};
  const result = response.result || run.result || {};
  state.backtrackEvidence = result.backtrack || response.backtrack || result.data || result.raw || result;
  if (run.id) mergeNovaAgentRun(run);
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

async function sinkTrailGuide({ openPreview = true } = {}) {
  const selected = activeBook();
  if (!selected || !state.selectedChunkId) throw new Error("请先选择一本书和 chunk。");
  const evidence = state.backtrackEvidence;
  if (!evidence) throw new Error("当前没有回溯证据。");
  saveSinkSettings();
  const response = await runNovaAgent({
    action: "tool_call",
    tool: "backtrack_sink_preview_create",
    ...backtrackPayload(selected.bookId, evidence.anchorChunkId || state.selectedChunkId),
    ...sinkDestinationPayload(),
    requireApproval: true,
    bookTitle: selected.title || selected.bookId,
    chunkTitle: chunkTitleById(evidence.anchorChunkId || state.selectedChunkId),
    createdBy: "CoReadingSidecar",
  });
  const run = response.run || {};
  const result = response.result || run.result || {};
  state.backtrackEvidence = result.backtrack || response.backtrack || evidence;
  if (run.id) mergeNovaAgentRun(run);
  renderBacktrackEvidence();
  const previewId = previewIdFromResult(response.toolResult || result.toolResult || result);
  if (previewId && openPreview) await openQueueSink(previewId);
  return previewId;
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
      ...sinkDestinationPayload(),
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
    renderImportProgress("准备导入", 0);
    const imported = await importFile(file, {
      title: String(form.get("title") || "").trim(),
      author: String(form.get("author") || "").trim(),
      headingRegex: String(form.get("headingRegex") || "").trim(),
      maxChars: Number(form.get("maxChars") || 12000),
      overwrite: form.get("overwrite") === "on",
    });
    log(imported);
    formEl.reset();
    renderImportProgress("导入完成", 100);
    await openImportedBook(imported);
  } catch (error) {
    setStatus("导入失败");
    setFormError(formEl, error.message || String(error));
  } finally {
    window.setTimeout(() => renderImportProgress("", 0), 1200);
  }
});
$("refreshLocalLibraryBtn")?.addEventListener("click", () => {
  void loadLocalLibrary().catch((error) => {
    const formEl = $("localLibraryForm");
    if (formEl) setFormError(formEl, error.message || String(error));
  });
});
$("localLibrarySelect")?.addEventListener("change", (event) => {
  const formEl = $("localLibraryForm");
  const titleInput = formEl?.querySelector('input[name="title"]');
  if (titleInput && !titleInput.value.trim()) {
    titleInput.value = titleFromLocalBookPath(event.target.value);
  }
});
$("localLibraryForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formEl = event.currentTarget;
  clearFormError(formEl);
  try {
    await importLocalLibraryBook(formEl);
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
    renderImportProgress("准备导入", 0);
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
    renderImportProgress("导入完成", 100);
    await openImportedBook(imported);
    focusPanel(".reader-surface", "#chunkText");
  } catch (error) {
    setStatus("导入失败");
    setFormError(formEl, error.message || String(error));
  } finally {
    window.setTimeout(() => renderImportProgress("", 0), 1200);
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
      "- 判断是否适合写入 Obsidian/OBS/DailyNote/VCPMemory。",
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

$("previewSinkLocalDiffBtn").addEventListener("click", () => {
  const preview = state.selectedSinkPreview;
  if (!preview || preview.status === "exported") {
    log("请先选择可编辑的沉淀预览。");
    return;
  }
  const original = typeof preview.content === "string" ? preview.content : JSON.stringify(preview.content || preview, null, 2);
  const current = $("sinkPreviewContent").value || "";
  state.selectedSinkDiff = localContentDiff(original, current);
  renderObsidianDiffPanel();
  log(state.selectedSinkDiff.identical ? "当前正文未改动。" : "已生成保存前改动对照。");
});

$("compactSinkContentBtn").addEventListener("click", () => {
  const preview = state.selectedSinkPreview;
  if (!preview || preview.status === "exported") {
    log("请先选择可编辑的沉淀预览。");
    return;
  }
  const before = $("sinkPreviewContent").value || "";
  const compacted = compactSinkPreviewContent(before);
  if (!compacted || compacted === before) {
    log("当前正文无需精简。");
    return;
  }
  $("sinkPreviewContent").value = compacted;
  $("sinkPreviewContent").focus();
  log("已精简当前正文，确认后请保存或保存并批准。");
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
  await updateSinkPreviewContent(preview, { status, note });
}

async function updateSinkPreviewContent(preview, { status, note }) {
  if (!preview?.previewId) return;
  try {
    const criticalRemoval = confirmSinkCriticalRemoval(preview, { status });
    if (!criticalRemoval.allowed) return;
    await command(sinkSavePayload(preview, { status, note: sinkNoteWithCriticalRemovalAudit(note, criticalRemoval) }));
    const result = await query({ command: "sink_preview_get", previewId: preview.previewId });
    state.selectedSinkPreview = result.preview || result;
    renderSinkDetail();
    renderSinks();
    await loadSnapshot();
  } catch (error) {
    log(error.message || String(error));
  }
}

function sinkSavePayload(preview, { status, note }) {
  const payload = {
    command: "sink_preview_update",
    previewId: preview.previewId,
    status: status || preview.status || "pending",
    content: $("sinkPreviewContent").value,
    note,
    updatedBy: "CoReadingSidecar",
  };
  const criticalRemovals = state.selectedSinkDiff?.kind === "local-content-diff"
    ? criticalRemovalAuditFields(state.selectedSinkDiff)
    : [];
  if (criticalRemovals.length) payload.criticalRemovals = criticalRemovals;
  return payload;
}

function confirmSinkCriticalRemoval(preview, { status }) {
  const original = typeof preview.content === "string" ? preview.content : JSON.stringify(preview.content || preview, null, 2);
  const current = $("sinkPreviewContent").value || "";
  const diff = localContentDiff(original, current);
  state.selectedSinkDiff = diff;
  renderObsidianDiffPanel();
  if (!diff.hasCriticalRemoval) return { allowed: true, diff: null };
  const fields = diff.criticalRemovedFields.map((field) => `${field.label} -${field.removedLineCount}`).join("、");
  const action = status === "approved" ? "保存并批准" : "保存";
  const ok = window.confirm(`检测到关键来源字段被删除：${fields}。\n\n继续${action}可能让沉淀丢失来源证据，确认继续？`);
  if (!ok) log(`已取消${action}：关键来源字段存在删除。`);
  return { allowed: ok, diff };
}

function sinkNoteWithCriticalRemovalAudit(note, criticalRemoval) {
  const fields = criticalRemovalAuditFields(criticalRemoval?.diff)
    .map((field) => `${field.field} -${field.removedLineCount}`)
    .join(", ");
  if (!fields) return note;
  return [note, `critical removal confirmed: ${fields}`].filter(Boolean).join("; ");
}

function criticalRemovalAuditFields(diff) {
  return (diff?.criticalRemovedFields || []).map((field) => ({
    field: field.label,
    heading: field.heading,
    removedLineCount: field.removedLineCount || 0,
    addedLineCount: field.addedLineCount || 0,
  }));
}

function localContentDiff(original, current) {
  const beforeLines = String(original || "").split(/\r?\n/);
  const afterLines = String(current || "").split(/\r?\n/);
  const { added, removed } = lineMultisetDiff(beforeLines, afterLines);
  const fields = sinkContentDiffFields(original, current);
  const criticalRemovedFields = fields.filter((field) => field.critical && field.removedLineCount > 0);
  const preview = [
    ...added.slice(0, 40).map((line) => `+ ${line}`),
    ...removed.slice(0, 40).map((line) => `- ${line}`),
  ].join("\n");
  return {
    kind: "local-content-diff",
    identical: String(original || "") === String(current || ""),
    addedLineCount: added.length,
    removedLineCount: removed.length,
    addedPreview: added.slice(0, 40),
    removedPreview: removed.slice(0, 40),
    fields,
    criticalRemovedFields,
    hasCriticalRemoval: criticalRemovedFields.length > 0,
    preview,
  };
}

function lineMultisetDiff(beforeLines, afterLines) {
  const beforeSet = new Map();
  const afterSet = new Map();
  for (const line of beforeLines) beforeSet.set(line, (beforeSet.get(line) || 0) + 1);
  for (const line of afterLines) afterSet.set(line, (afterSet.get(line) || 0) + 1);
  const added = [];
  const removed = [];
  const seenAdded = new Map();
  const seenRemoved = new Map();
  for (const line of afterLines) {
    const used = seenAdded.get(line) || 0;
    const baseline = beforeSet.get(line) || 0;
    if (used >= baseline) added.push(line);
    seenAdded.set(line, used + 1);
  }
  for (const line of beforeLines) {
    const used = seenRemoved.get(line) || 0;
    const baseline = afterSet.get(line) || 0;
    if (used >= baseline) removed.push(line);
    seenRemoved.set(line, used + 1);
  }
  return { added, removed };
}

function sinkContentDiffFields(original, current) {
  const fields = [
    { label: "摘要", heading: "摘要", next: ["判断", "来源原文", "我的笔记与边注", "Nova 回应", "阅读卡片", "其他观察", "引文与锚点", "问题", "下一步"] },
    { label: "来源原文", heading: "来源原文", next: ["我的笔记与边注", "Nova 回应", "阅读卡片", "其他观察", "引文与锚点", "问题", "下一步"], critical: true },
    { label: "Nova 回应", heading: "Nova 回应", next: ["阅读卡片", "其他观察", "引文与锚点", "问题", "下一步"] },
    { label: "引文锚点", heading: "引文与锚点", next: ["问题", "下一步"], critical: true },
  ];
  return fields.map((field) => {
    const before = markdownSection(original, field.heading, field.next);
    const after = markdownSection(current, field.heading, field.next);
    const { added, removed } = lineMultisetDiff(before.split(/\r?\n/), after.split(/\r?\n/));
    return {
      ...field,
      changed: before !== after,
      addedLineCount: added.filter((line) => line.trim()).length,
      removedLineCount: removed.filter((line) => line.trim()).length,
    };
  });
}

function compactSinkPreviewContent(content) {
  const source = String(content || "").trim();
  if (!source) return "";
  const frontmatterMatch = source.match(/^---[\s\S]*?---\s*/);
  const frontmatter = frontmatterMatch ? frontmatterMatch[0].trim() : "";
  const body = frontmatter ? source.slice(frontmatterMatch[0].length) : source;
  const title = (body.match(/^# .+$/m) || ["# 共读沉淀"])[0];
  const summary = markdownSection(body, "摘要", ["判断", "来源原文", "我的笔记与边注", "Nova 回应", "阅读卡片", "其他观察", "引文与锚点", "问题", "下一步"]);
  const sourceQuote = markdownSection(body, "来源原文", ["我的笔记与边注", "Nova 回应", "阅读卡片", "其他观察", "引文与锚点", "问题", "下一步"]);
  const novaReply = markdownSection(body, "Nova 回应", ["阅读卡片", "其他观察", "引文与锚点", "问题", "下一步"]);
  const anchors = markdownSection(body, "引文与锚点", ["问题", "下一步"]);
  return [
    frontmatter,
    title,
    "",
    "## 摘要",
    "",
    clampMarkdownBlock(summary, 600) || "待补摘要。",
    "",
    "## 来源原文",
    "",
    clampMarkdownBlock(sourceQuote, 900) || "待补来源。",
    "",
    "## Nova 回应",
    "",
    clampMarkdownBlock(novaReply, 1200) || "待补 Nova 回应。",
    "",
    "## 引文与锚点",
    "",
    clampMarkdownBlock(anchors, 600) || "待补锚点。",
    "",
  ].filter((part, index, parts) => part || parts[index - 1] !== "").join("\n").trim() + "\n";
}

function markdownSection(markdown, heading, nextHeadings = []) {
  const escaped = escapeRegExp(heading);
  const start = new RegExp(`^##\\s+${escaped}\\s*$`, "m").exec(markdown);
  if (!start) return "";
  const afterHeading = start.index + start[0].length;
  const rest = markdown.slice(afterHeading);
  const nextPattern = nextHeadings.length
    ? new RegExp(`^##\\s+(?:${nextHeadings.map(escapeRegExp).join("|")})\\s*$`, "m")
    : /^##\s+/m;
  const next = nextPattern.exec(rest);
  return rest.slice(0, next ? next.index : undefined).trim();
}

function clampMarkdownBlock(text, maxLength) {
  const value = String(text || "").trim();
  if (value.length <= maxLength) return value;
  const clipped = value.slice(0, maxLength).trimEnd();
  return `${clipped}\n\n...`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  if (!preview) return false;
  try {
    saveSinkSettings();
    await command(sinkExecutePayload(preview));
    await refreshExecutedSinkPreview(preview.previewId);
    await loadSnapshot();
    return true;
  } catch (error) {
    log(error.message || String(error));
    return false;
  }
}

function sinkExecutePayload(preview) {
  const destination = preview.destination || {};
  const settings = sinkDestinationPayload();
  return {
    command: "sink_execute",
    previewId: preview.previewId,
    vaultPath: settings.vaultPath || destination.vaultPath || undefined,
    dailyNoteRoot: settings.dailyNoteRoot,
    vcpMemoryRoot: settings.vcpMemoryRoot,
    obsOutputDir: settings.obsOutputDir || destination.outputDir || undefined,
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
  const select = event.target;
  select.disabled = true;
  void selectChunk(select.value, true).catch((error) => {
    log(error.message || String(error));
  }).finally(() => {
    select.disabled = !state.chunks.length;
    renderPlanRangeStatus();
    renderReviewRangeStatus();
  });
});
$("readerBookSelect").addEventListener("change", (event) => {
  const select = event.target;
  select.disabled = true;
  void selectBook(select.value).catch((error) => {
    log(error.message || String(error));
  }).finally(() => {
    renderReaderBookSelect();
  });
});
$("readerTocToggleBtn")?.addEventListener("click", toggleReaderToc);
$("readerTocSearch").addEventListener("input", renderReaderToc);
$("readerTocList").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-reader-toc-chunk-id]");
  if (!button) return;
  button.disabled = true;
  closeReaderToc();
  void selectChunk(button.dataset.readerTocChunkId, true).then(() => {
    focusPanel(".reader-surface", "#chunkText");
  }).catch((error) => {
    log(error.message || String(error));
  }).finally(renderReaderToc);
});
$("showTestBooksToggle")?.addEventListener("change", async (event) => {
  setShowTestBooks(event.target.checked);
  const selected = activeBook();
  if (selected && selected.bookId !== state.selectedBookId) {
    await selectBook(selected.bookId, { focusReader: false });
  } else {
    renderBooks();
    renderReaderBookSelect();
  }
  log(showTestBooks() ? "已显示验证书。" : "已隐藏验证书。");
});
$("chunkText").addEventListener("scroll", () => {
  handleReaderScroll();
}, { passive: true });
$("readingMapTrack").addEventListener("click", async (event) => {
  const target = event.target.closest("button[data-chunk-id]");
  if (!target) return;
  await selectChunk(target.dataset.chunkId, true);
  const bookmark = target.dataset.bookmark === "true" ? bookmarkForChunk(target.dataset.chunkId) : null;
  if (bookmark) restoreSavedScroll(bookmark);
  focusPanel(".reader-surface", "#chunkText");
});
$("waypointList").addEventListener("click", async (event) => {
  const target = event.target.closest("button[data-waypoint-chunk-id]");
  if (!target) return;
  await selectChunk(target.dataset.waypointChunkId, true);
  if (target.dataset.waypointAction === "bookmark") {
    const bookmark = bookmarkForChunk(target.dataset.waypointChunkId);
    if (bookmark) restoreSavedScroll(bookmark);
  }
  focusPanel(".reader-surface", "#chunkText");
  log(`已打开路标: ${target.dataset.waypointChunkId}`);
});
$("bookmarkChunkBtn").addEventListener("click", () => {
  const bookmark = saveBookmarkForCurrentChunk();
  renderReaderProgress();
  log(bookmark ? `已插入书签: ${bookmark.chunkId}` : "请先选择一本书和 chunk。");
});
$("planCurrentSectionBtn").addEventListener("click", () => {
  $("planCurrentSectionBtn").disabled = true;
  void createPlanForCurrentSection().catch((error) => {
    log(error.message || String(error));
  }).finally(renderReaderProgress);
});
$("waypointBookmarkBtn").addEventListener("click", () => {
  const bookmark = saveBookmarkForCurrentChunk();
  renderReaderProgress();
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
  void setImmersiveReading(!state.immersiveReading);
});
$("readerNextBtn").addEventListener("click", () => {
  $("readerNextBtn").disabled = true;
  void markReadAndMaybeAdvance({ advance: true }).catch((error) => {
    log(error.message || String(error));
  }).finally(renderReaderProgress);
});
$("readerReviewLastBtn").addEventListener("click", () => {
  $("readerReviewLastBtn").disabled = true;
  void openLastCompletedChunkReview().catch((error) => {
    log(error.message || String(error));
  }).finally(renderReaderProgress);
});
$("readerResumeNextBtn").addEventListener("click", () => {
  $("readerResumeNextBtn").disabled = true;
  void resumeAfterLastCompletedReview().catch((error) => {
    log(error.message || String(error));
  }).finally(renderReaderProgress);
});
$("readerAskNovaBtn").addEventListener("click", () => {
  prepareNovaPromptFromCurrentReading();
});
$("readerOpenSinkBtn").addEventListener("click", async () => {
  if (state.immersiveReading || state.readingFocus) {
    await setImmersiveReading(false);
  }
  await openBestSinkPreview();
});
$("readerApproveSinkBtn").addEventListener("click", () => {
  $("readerApproveSinkBtn").disabled = true;
  void approveCurrentChunkSinkPreview().catch((error) => {
    log(error.message || String(error));
  }).finally(renderReaderProgress);
});
$("readerExecuteSinkBtn").addEventListener("click", () => {
  $("readerExecuteSinkBtn").disabled = true;
  void executeCurrentChunkSinkPreview().catch((error) => {
    log(error.message || String(error));
  }).finally(renderReaderProgress);
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
$("sessionScoutNovaBtn").addEventListener("click", async () => {
  const button = $("sessionScoutNovaBtn");
  button.disabled = true;
  try {
    await runNovaAutonomousReading({ manual: true, bookScout: true });
    revealNovaForReadingAction();
  } catch (error) {
    log(error.message || String(error));
  } finally {
    renderReadingSession();
    renderNovaReply();
  }
});
$("sessionRestartBtn").addEventListener("click", async () => {
  const selected = activeBook();
  if (!selected) return;
  $("sessionRestartBtn").disabled = true;
  try {
    if (state.restartUndo?.bookId === selected.bookId) {
      await undoRestartReadingSession();
      return;
    }
    const previous = validSavedReadingSessionForBook(selected.bookId);
    clearSavedReadingSessionForBook(selected.bookId);
    const firstChunkId = preferredReadingChunkIdFrom();
    if (!firstChunkId) throw new Error("当前书没有可读取的段落。");
    await selectChunk(firstChunkId, true);
    saveReadingSession({ chunkId: firstChunkId, scrollTop: 0 });
    rememberRestartUndo(previous);
    focusPanel(".reader-surface", "#chunkText");
    log(`已清除本书断点，从头阅读: ${selected.title || selected.bookId}。5 秒内可撤销。`);
  } catch (error) {
    log(error.message || String(error));
  } finally {
    $("sessionRestartBtn").disabled = !activeBook();
    renderReaderProgress();
    renderReadingSession();
  }
});
$("sessionResumeBtn").addEventListener("click", async () => {
  const saved = validSavedReadingSessionForBook(state.selectedBookId);
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
  prepareNovaPromptFromCurrentReading();
});
$("sessionNoteBtn").addEventListener("click", () => {
  prepareNoteFromCurrentReading();
});
$("sessionTargetInput").addEventListener("change", (event) => {
  setReadingVisitTarget(event.target.value);
});
$("sessionCopySummaryBtn").addEventListener("click", async () => {
  try {
    const selected = activeBook();
    await copyTextToClipboard(readingVisitCopySummary(selected));
    log(`已复制本次阅读摘要: ${selected.title || selected.bookId}`);
  } catch (error) {
    log(error.message || String(error));
  }
});
$("sessionSinkVisitBtn").addEventListener("click", () => {
  $("sessionSinkVisitBtn").disabled = true;
  void createReadingVisitSinkPreview().catch((error) => {
    log(error.message || String(error));
  }).finally(renderReadingSession);
});
$("sessionEndVisitBtn").addEventListener("click", endReadingVisit);
$("sessionHistoryList").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-session-history-action][data-session-history-id]");
  if (!button) return;
  const item = readReadingVisitHistory().find((historyItem) => historyItem.id === button.dataset.sessionHistoryId);
  if (!item) {
    log("这条阅读历史已经不存在。");
    renderReadingVisitHistory();
    return;
  }
  button.disabled = true;
  if (button.dataset.sessionHistoryAction === "copy") {
    void copyTextToClipboard(readingVisitHistorySummary(item)).then(() => {
      log(`已复制历史阅读摘要: ${item.bookTitle || item.bookId}`);
    }).catch((error) => {
      log(error.message || String(error));
    }).finally(renderReadingVisitHistory);
    return;
  }
  void createReadingVisitSinkPreview(item).catch((error) => {
    log(error.message || String(error));
  }).finally(renderReadingVisitHistory);
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
$("readingNowPlanBtn").addEventListener("click", async () => {
  $("readingNowPlanBtn").disabled = true;
  try {
    if (activePlanForBook(activeBook())) await openPlanGuideRange();
    else await createPlanForCurrentSection();
  } catch (error) {
    log(error.message || String(error));
  } finally {
    renderReadingNowBar();
    renderPlanGuide();
  }
});
$("readingNowAskBtn").addEventListener("click", () => {
  prepareNovaPromptFromCurrentReading();
});
$("readingNowNoteBtn").addEventListener("click", () => {
  prepareNoteFromCurrentReading();
});
$("readerFootprintsBtn").addEventListener("click", toggleReaderFootprints);
$("readerNovaAsideToggleBtn").addEventListener("click", toggleReaderNovaAside);
$("readerNovaAsideFocusBtn").addEventListener("click", focusReaderNovaAside);
$("readerNovaAsideSaveBtn").addEventListener("click", () => void saveReaderNovaAside());
$("readerNovaAsideSinkBtn").addEventListener("click", () => void sinkReaderNovaAside());
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
  const { quote, quoteOffset, chunkId } = quotePayloadFromForm(form);
  const note = String(form.get("note") || "").trim();
  try {
    await saveAnnotation({ quote, quoteOffset, chunkId, note, kind: String(form.get("kind") || "annotation") });
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
  const { quote, quoteOffset, chunkId } = quotePayloadFromForm(form);
  const note = String(form.get("note") || "").trim();
  try {
    await saveUserNote({ quote, quoteOffset, chunkId, note, status: String(form.get("status") || "open") });
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
    const prompt = String($("novaPrompt").value || "").trim() || "请陪我读这一段：解释重点，指出一句值得停留的话，再给一个下一步。";
    await askNovaWithPrompt(prompt);
  } catch (error) {
    log(error.message || String(error));
  } finally {
    button.disabled = false;
  }
});
$("novaAutoReadBtn").addEventListener("click", async () => {
  const button = $("novaAutoReadBtn");
  button.disabled = true;
  try {
    await runNovaAutonomousReading({ manual: true });
  } catch (error) {
    log(error.message || String(error));
  } finally {
    button.disabled = false;
    renderNovaReply();
  }
});
$("novaBookScoutBtn").addEventListener("click", async () => {
  const button = $("novaBookScoutBtn");
  button.disabled = true;
  try {
    await runNovaAutonomousReading({ manual: true, bookScout: true });
  } catch (error) {
    log(error.message || String(error));
  } finally {
    button.disabled = false;
    renderNovaReply();
  }
});
$("askNovaSelectionBtn").addEventListener("click", () => {
  if (!$("novaPrompt").value.trim() || selectedQuote().text) $("novaPrompt").value = buildNovaPromptFromSelection();
  $("askNovaBtn").click();
});
$("novaAutoReadToggle").addEventListener("change", (event) => {
  setNovaAutoReadEnabled(event.target.checked);
  if (state.novaAutoReadEnabled) maybeScheduleNovaAutonomousReading();
});
$("toggleNovaPaneBtn").addEventListener("click", () => setNovaPaneCollapsed(!state.novaPaneCollapsed));
$("narrowNovaPaneBtn").addEventListener("click", () => setNovaPaneWidth("medium"));
$("wideNovaPaneBtn").addEventListener("click", () => setNovaPaneWidth("wide"));
$("copyNovaReplyBtn").addEventListener("click", async () => {
  try {
    const display = currentNovaDisplay();
    if (!display?.text) throw new Error("当前没有可复制的 Nova 文本。");
    await copyTextToClipboard(display.text);
    log(display.kind === "pre-read" ? "已复制 Nova 预读。" : "已复制 Nova 回复。");
  } catch (error) {
    log(error.message || String(error));
  }
});
$("saveNovaReplyNoteBtn").addEventListener("click", async () => {
  $("saveNovaReplyNoteBtn").disabled = true;
  try {
    const result = await command(novaReplyNotePayload());
    await readSelectedChunk();
    log(`已把 Nova 回复存成笔记: ${result.data?.noteId || state.selectedChunkId}`);
  } catch (error) {
    log(error.message || String(error));
  } finally {
    renderNovaReply();
  }
});
$("sinkNovaReplyBtn").addEventListener("click", async () => {
  $("sinkNovaReplyBtn").disabled = true;
  try {
    const result = await createNovaReplySinkPreview();
    log(`已生成 Nova 回复沉淀预览: ${result.reviewId}`);
  } catch (error) {
    log(error.message || String(error));
  } finally {
    renderNovaReply();
    renderChunkReview();
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
  try {
    const previewId = await sinkTrailGuide({ openPreview: true });
    await loadSnapshot();
    log(previewId ? `已创建回溯沉淀预览: ${previewId}` : "已请求回溯沉淀预览。");
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
        ...sinkDestinationPayload(),
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
  handleReaderScroll();
}, { passive: true });

void Promise.allSettled([loadSinkDefaults(), loadAgentSkills()]).finally(loadSnapshot);

setInterval(() => {
  if (state.backgroundRunners.some((runner) => ["running", "waiting"].includes(runner.status))) {
    void loadSnapshot();
  }
}, 3000);
