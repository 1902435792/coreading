#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const PLUGIN_DIR = __dirname;
const FRONTEND_DIR = path.join(PLUGIN_DIR, "frontend");
const PROMPTS_DIR = path.join(PLUGIN_DIR, "prompts");
const WRAPPER_PATH = path.join(PLUGIN_DIR, "CoReadingMCP.cjs");
const PROJECT_ROOT = process.env.PROJECT_BASE_PATH || path.resolve(PLUGIN_DIR, "..", "..");
const DEFAULT_DATA_DIR = path.join(PROJECT_ROOT, "data", "co-reading-mcp");
const DATA_DIR = path.resolve(process.env.CO_READING_DATA_DIR || process.env.READING_MCP_DATA_DIR || DEFAULT_DATA_DIR);
const VENDOR_DIR = path.resolve(process.env.CO_READING_VENDOR_DIR || path.join(PLUGIN_DIR, "vendor", "co-reading-mcp"));

const HOST = process.env.CO_READING_SIDECAR_HOST || "127.0.0.1";
const PORT = Number(process.env.CO_READING_SIDECAR_PORT || 8791);
const MAX_BODY_BYTES = Number(process.env.CO_READING_SIDECAR_MAX_BODY_BYTES || 2_000_000);
const NOVA_BRIDGE_URL = process.env.CO_READING_NOVA_BRIDGE_URL || "http://127.0.0.1:3100/v1/chat/completions";
const NOVA_MODEL = process.env.CO_READING_NOVA_MODEL || "gpt-5.5";
const NOVA_GUIDE_PATH = process.env.CO_READING_NOVA_GUIDE_PATH || path.join(PROMPTS_DIR, "CoReadingNovaGuide.txt");
const NOVA_TIMEOUT_MS = Math.max(3000, Math.min(300000, Number(process.env.CO_READING_NOVA_TIMEOUT_MS || 240000)));
const LOCAL_LIBRARY_DIR = path.resolve(process.env.CO_READING_LIBRARY_DIR || "D:\\书库");

process.env.READING_MCP_DATA_DIR = DATA_DIR;
process.env.READING_IMPORT_MAX_BYTES = process.env.READING_IMPORT_MAX_BYTES || "100000000";
const IMPORT_MAX_BYTES = Number(process.env.READING_IMPORT_MAX_BYTES || 100_000_000);
const UPLOAD_SESSIONS = new Map();

function configuredSinkDefaults() {
  const defaults = {
    vaultPath: process.env.CO_READING_OBSIDIAN_VAULT_DIR || "",
    dailyNoteRoot: process.env.CO_READING_DAILY_NOTE_ROOT || process.env.KNOWLEDGEBASE_ROOT_PATH || "",
    vcpMemoryRoot: process.env.CO_READING_VCP_MEMORY_ROOT || process.env.VCP_MEMORY_ROOT || ""
  };
  return Object.fromEntries(
    Object.entries(defaults)
      .map(([key, value]) => [key, String(value || "").trim()])
      .filter(([, value]) => value)
  );
}

const ALLOWED_COMMANDS = new Set([
  "list_tools",
  "list_books",
  "list_chunks",
  "read_chunk",
  "continue",
  "import_file",
  "import_begin",
  "import_part",
  "import_finish",
  "import_cancel",
  "list_annotations",
  "annotate",
  "user_note_create",
  "user_note_list",
  "submit_notes",
  "list_submissions",
  "read_submission",
  "search",
  "mark_read",
  "card_inbox",
  "card_collection",
  "open_card",
  "save_card",
  "dismiss_card",
  "list_cards",
  "collect_card",
  "progress",
  "plan_create",
  "interest_backtrack",
  "plan_list",
  "plan_get",
  "plan_update",
  "plan_next_step",
  "plan_execute_step",
  "plan_run",
  "plan_record_step",
  "review_create",
  "review_list",
  "review_get",
  "sink_preview_create",
  "sink_preview_create_from_cards",
  "sink_preview_create_from_backtrack",
  "sink_preview_list",
  "sink_preview_get",
  "sink_preview_update",
  "sink_execute",
  "obsidian_note_read",
  "obsidian_note_diff",
  "obsidian_note_merge",
  "obsidian_note_suggest_integration",
  "obsidian_note_apply_integration_choice",
  "obsidian_note_preview_replace_range",
  "obsidian_note_confirm_replace_range",
  "obsidian_note_integrate",
  "obsidian_note_status",
  "obsidian_vault_status",
  "obsidian_vault_snapshot",
  "obsidian_vault_snapshot_list",
  "obsidian_vault_snapshot_diff",
  "obsidian_vault_index_build",
  "obsidian_vault_index_list",
  "obsidian_vault_index_get",
  "obsidian_vault_index_refresh_check",
  "obsidian_vault_index_refresh",
  "obsidian_vault_sync_plan_create",
  "obsidian_vault_sync_action_apply",
  "obsidian_note_resolve",
  "illustration_create",
  "illustration_list",
  "illustration_get",
  "illustration_update",
  "illustration_suggest"
]);

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

const LOCAL_BOOK_EXTENSIONS = new Set([".epub", ".txt", ".text", ".md", ".markdown"]);

async function handleCardImage(res, cardId) {
  const storeModule = await import(pathToFileURL(path.join(VENDOR_DIR, "src", "store.js")).href);
  const rendererModule = await import(pathToFileURL(path.join(VENDOR_DIR, "src", "card-renderer.js")).href);
  const card = await storeModule.readCard(decodeURIComponent(cardId));
  const image = rendererModule.renderCardImageContent(card);
  res.writeHead(200, {
    "content-type": image.mimeType || "image/svg+xml",
    "cache-control": "no-store"
  });
  res.end(Buffer.from(image.data || "", "base64"));
}

function sendJson(res, status, value) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value, null, 2));
}

function sendError(res, status, message, details) {
  sendJson(res, status, { status: "error", error: message, details: details || null });
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error(`Request body exceeds ${MAX_BODY_BYTES} bytes.`);
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function parseJsonBlock(text) {
  if (Array.isArray(text) || (text && typeof text === "object")) return text;
  const raw = String(text || "").trim();
  const fenced = raw.match(/```json\s*([\s\S]*?)\s*```/);
  if (fenced) return JSON.parse(fenced[1]);
  if (raw.startsWith("{") || raw.startsWith("[")) return JSON.parse(raw);
  const arrayMatch = raw.match(/\n(\[[\s\S]*\])\s*$/);
  if (arrayMatch) return JSON.parse(arrayMatch[1]);
  const objectMatch = raw.match(/\n(\{[\s\S]*\})\s*$/);
  if (objectMatch) return JSON.parse(objectMatch[1]);
  return null;
}

function isPathInside(parent, target) {
  const relative = path.relative(parent, target);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function localBookFormat(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".epub") return "epub";
  if (ext === ".md" || ext === ".markdown") return "markdown";
  return "txt";
}

function localBookFormatRank(format) {
  if (format === "epub") return 0;
  if (format === "markdown") return 1;
  return 2;
}

function bookIdFromLocalPath(relativePath) {
  return path.basename(String(relativePath || ""), path.extname(String(relativePath || "")))
    .trim()
    .replace(/[^\w.\-\u4e00-\u9fff]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `local-book-${Date.now()}`;
}

function safeLocalBookPath(relativePath) {
  const raw = String(relativePath || "").trim();
  if (!raw) throw new Error("relativePath 是必需参数。");
  if (path.isAbsolute(raw)) throw new Error("本地书源只接受相对路径。");
  const resolved = path.resolve(LOCAL_LIBRARY_DIR, raw);
  if (!isPathInside(LOCAL_LIBRARY_DIR, resolved)) throw new Error("本地书源路径越界。");
  return resolved;
}

async function listLocalLibraryBooks() {
  const maxFiles = 200;
  const results = [];
  async function walk(dir) {
    if (results.length >= maxFiles) return;
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= maxFiles) return;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!LOCAL_BOOK_EXTENSIONS.has(ext)) continue;
      const stat = await fs.promises.stat(fullPath);
      results.push({
        name: entry.name,
        relativePath: path.relative(LOCAL_LIBRARY_DIR, fullPath),
        size: stat.size,
        format: localBookFormat(fullPath),
        updatedAt: stat.mtime.toISOString()
      });
    }
  }
  if (fs.existsSync(LOCAL_LIBRARY_DIR)) await walk(LOCAL_LIBRARY_DIR);
  results.sort((a, b) => (
    localBookFormatRank(a.format) - localBookFormatRank(b.format)
    || a.relativePath.localeCompare(b.relativePath, "zh-CN")
  ));
  return { status: "success", root: LOCAL_LIBRARY_DIR, count: results.length, books: results };
}

async function importLocalLibraryBook(payload) {
  const filePath = safeLocalBookPath(payload.relativePath);
  const stat = await fs.promises.stat(filePath);
  if (!stat.isFile()) throw new Error("本地书源路径不是文件。");
  if (stat.size > IMPORT_MAX_BYTES) {
    const error = new Error(`Imported file exceeds ${IMPORT_MAX_BYTES} bytes`);
    error.statusCode = 413;
    throw error;
  }
  const ext = path.extname(filePath).toLowerCase();
  if (!LOCAL_BOOK_EXTENSIONS.has(ext)) throw new Error("仅支持 EPUB/TXT/Markdown 本地书源。");
  const dataBase64 = (await fs.promises.readFile(filePath)).toString("base64");
  const result = await runWrapper({
    command: "import_file",
    filename: path.basename(filePath),
    format: localBookFormat(filePath),
    bookId: payload.bookId || bookIdFromLocalPath(payload.relativePath),
    title: payload.title,
    author: payload.author,
    maxChars: payload.maxChars,
    headingRegex: payload.headingRegex,
    overwrite: payload.overwrite,
    dataBase64
  });
  const data = result.data || {};
  return {
    ...result,
    ...data,
    command: "import_local_book",
    data,
    source: { root: LOCAL_LIBRARY_DIR, relativePath: payload.relativePath }
  };
}

function sidecarUploadDir(uploadId) {
  return path.join(DATA_DIR, "uploads", "sidecar", uploadId);
}

function importOptionPayload(payload, extra = {}) {
  return {
    filename: payload.filename,
    format: payload.format,
    bookId: payload.bookId,
    title: payload.title,
    author: payload.author,
    maxChars: payload.maxChars,
    headingRegex: payload.headingRegex,
    minSectionChars: payload.minSectionChars,
    overwrite: payload.overwrite,
    ...extra
  };
}

async function beginSidecarImport(payload) {
  if (!payload.filename) throw new Error("filename 是必需参数。");
  const expectedBytes = Number(payload.expectedBytes || 0) || null;
  if (expectedBytes && expectedBytes > IMPORT_MAX_BYTES) {
    const error = new Error(`Imported file exceeds ${IMPORT_MAX_BYTES} bytes`);
    error.statusCode = 413;
    throw error;
  }
  const uploadId = crypto.randomUUID();
  const dir = sidecarUploadDir(uploadId);
  await fs.promises.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, "upload.bin");
  await fs.promises.writeFile(filePath, "");
  UPLOAD_SESSIONS.set(uploadId, {
    uploadId,
    filePath,
    dir,
    options: importOptionPayload(payload),
    expectedBytes,
    bytes: 0,
    parts: 0,
    createdAt: new Date().toISOString()
  });
  return {
    status: "success",
    command: "import_begin",
    data: {
      uploadId,
      filename: payload.filename,
      expectedBytes,
      maxImportBytes: IMPORT_MAX_BYTES,
      message: "Sidecar upload started."
    },
    raw: null,
    stderr: null
  };
}

async function appendSidecarImportPart(payload) {
  const uploadId = String(payload.uploadId || "");
  const session = UPLOAD_SESSIONS.get(uploadId);
  if (!session) throw new Error(`Unknown uploadId: ${uploadId}`);
  if (payload.index !== undefined && Number(payload.index) !== session.parts) {
    throw new Error(`Unexpected part index ${payload.index}; expected ${session.parts}`);
  }
  const buffer = Buffer.from(String(payload.dataBase64 || ""), "base64");
  if (!buffer.length) throw new Error("Import part is empty");
  if (session.bytes + buffer.length > IMPORT_MAX_BYTES) {
    const error = new Error(`Imported file exceeds ${IMPORT_MAX_BYTES} bytes`);
    error.statusCode = 413;
    throw error;
  }
  await fs.promises.appendFile(session.filePath, buffer);
  session.bytes += buffer.length;
  session.parts += 1;
  return {
    status: "success",
    command: "import_part",
    data: { uploadId, bytes: session.bytes, parts: session.parts, done: false },
    raw: null,
    stderr: null
  };
}

async function finishSidecarImport(payload) {
  const uploadId = String(payload.uploadId || "");
  const session = UPLOAD_SESSIONS.get(uploadId);
  if (!session) throw new Error(`Unknown uploadId: ${uploadId}`);
  const info = await fs.promises.stat(session.filePath);
  if (info.size === 0) throw new Error("Imported file is empty");
  if (session.expectedBytes && info.size !== session.expectedBytes) {
    throw new Error(`Uploaded ${info.size} bytes, expected ${session.expectedBytes}`);
  }
  const dataBase64 = (await fs.promises.readFile(session.filePath)).toString("base64");
  try {
    const result = await runWrapper({
      command: "import_file",
      ...session.options,
      dataBase64
    });
    UPLOAD_SESSIONS.delete(uploadId);
    await fs.promises.rm(session.dir, { recursive: true, force: true });
    return { ...result, command: "import_finish" };
  } catch (error) {
    throw error;
  }
}

async function cancelSidecarImport(payload) {
  const uploadId = String(payload.uploadId || "");
  const session = UPLOAD_SESSIONS.get(uploadId);
  if (!session) {
    return { status: "success", command: "import_cancel", data: { uploadId, cancelled: false }, raw: null, stderr: null };
  }
  UPLOAD_SESSIONS.delete(uploadId);
  await fs.promises.rm(session.dir, { recursive: true, force: true });
  return { status: "success", command: "import_cancel", data: { uploadId, cancelled: true }, raw: null, stderr: null };
}

async function runCommand(payload) {
  const command = String(payload.command || "").trim();
  if (command === "import_begin") return beginSidecarImport(payload);
  if (command === "import_part") return appendSidecarImportPart(payload);
  if (command === "import_finish") return finishSidecarImport(payload);
  if (command === "import_cancel") return cancelSidecarImport(payload);
  return runWrapper(payload);
}

function runWrapper(payload) {
  return new Promise((resolve, reject) => {
    const command = String(payload.command || "").trim();
    if (!ALLOWED_COMMANDS.has(command)) {
      const error = new Error(`Unsupported CoReading command: ${command || "<empty>"}`);
      error.statusCode = 400;
      reject(error);
      return;
    }

    const child = spawn(process.execPath, [WRAPPER_PATH], {
      cwd: PLUGIN_DIR,
      env: process.env,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      let outer = null;
      try {
        outer = JSON.parse(stdout || "{}");
      } catch (error) {
        reject(new Error(`CoReadingMCP returned non-JSON stdout: ${stdout.slice(0, 1000)}`));
        return;
      }
      if (code !== 0 || outer.status !== "success") {
        const error = new Error(outer.error || `CoReadingMCP failed with exit code ${code}`);
        error.statusCode = 502;
        error.details = { outer, stderr };
        reject(error);
        return;
      }
      let data = null;
      try {
        data = parseJsonBlock(outer.result);
      } catch {
        data = null;
      }
      resolve({
        status: "success",
        command,
        data,
        raw: outer.result,
        stderr: stderr.trim() || null
      });
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

function postJson(url, payload, headers = {}, { timeoutMs = 30000, label = "request" } = {}) {
  return new Promise((resolve, reject) => {
    const endpoint = new URL(url);
    const body = JSON.stringify(payload);
    const client = endpoint.protocol === "https:" ? https : http;
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    const req = client.request(
      endpoint,
      {
        method: "POST",
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-length": Buffer.byteLength(body),
          ...headers
        }
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = JSON.parse(text || "{}");
          } catch {
            json = { raw: text };
          }
          if (res.statusCode >= 400) {
            const error = new Error(json.error?.message || json.error || `Nova bridge HTTP ${res.statusCode}`);
            error.statusCode = 502;
            error.details = { bridgeStatus: res.statusCode, body: json };
            finish(reject, error);
            return;
          }
          finish(resolve, json);
        });
      }
    );
    req.setTimeout(timeoutMs, () => {
      const error = new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`);
      error.statusCode = 504;
      error.details = { timeoutMs, label };
      finish(reject, error);
      req.destroy(error);
    });
    req.on("error", (error) => finish(reject, error));
    req.write(body);
    req.end();
  });
}

function compactText(value, maxChars = 7000) {
  const text = String(value || "").trim();
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n\n[已截断 ${text.length - maxChars} 字]` : text;
}

function readNovaGuide() {
  try {
    return fs.existsSync(NOVA_GUIDE_PATH) ? fs.readFileSync(NOVA_GUIDE_PATH, "utf8").trim() : "";
  } catch {
    return "";
  }
}

async function askNova(body) {
  const apiKey = process.env.CO_READING_NOVA_API_KEY || process.env.VCP_API_KEY || "";
  const context = body.context || {};
  const novaGuide = readNovaGuide();
  const messages = [
    {
      role: "system",
      content: [
        "你是读书版 Nova，负责陪用户细读文本。",
        "只基于当前段落、选区、笔记和明确传入的上下文回应；不要假装读完整本书。",
        "优先帮助用户自己读：解释这段在说什么，指出值得停留的句子，给一个下一步阅读动作。",
        "用户没问工程实现时，不展开 VCP/插件细节。",
        "如果上下文不足，直接说需要哪一段或哪条笔记。",
        novaGuide ? `\n${novaGuide}` : ""
      ].filter(Boolean).join("\n")
    },
    {
      role: "user",
      content: [
        `书名: ${context.bookTitle || context.bookId || ""}`,
        `bookId: ${context.bookId || ""}`,
        `chunkId: ${context.chunkId || ""}`,
        `标题: ${context.chunkTitle || ""}`,
        `上下文模式: ${context.contextMode || "chunk"}`,
        `选区 offset: ${context.selectionOffset ?? ""}`,
        `协议: ${context.coReadingContextVersion || "inline"}`,
        "",
        "当前原文:",
        compactText(context.text || "", 6000),
        "",
        "选区:",
        compactText(context.selection || "", 1200),
        "",
        "目录预览:",
        compactText(JSON.stringify(context.tocPreview || [], null, 2), 1800),
        "",
        "Nova 可自主选择的候选段:",
        compactText(JSON.stringify(context.autonomousCandidates || [], null, 2), 5000),
        "",
        "用户问题/笔记:",
        compactText(body.prompt || "", 1800),
        "",
        "边界:",
        context.instructionBoundary || "只基于当前传入文本回应。"
      ].join("\n")
    }
  ];
  const result = await postJson(
    NOVA_BRIDGE_URL,
    {
      model: body.model || NOVA_MODEL,
      messages,
      temperature: body.temperature ?? 0.4,
      stream: false,
      maxAttempts: 1,
      metadata: {
        source: "CoReadingMCP",
        interaction: "single-short-reading-ask",
        timeoutMs: NOVA_TIMEOUT_MS
      }
    },
    apiKey ? { authorization: `Bearer ${apiKey}` } : {},
    { timeoutMs: NOVA_TIMEOUT_MS, label: "Nova bridge request" }
  );
  return {
    status: "success",
    model: body.model || NOVA_MODEL,
    timeoutMs: NOVA_TIMEOUT_MS,
    content: String(result.choices?.[0]?.message?.content || result.output_text || result.content || "").trim(),
    raw: result
  };
}

const BACKGROUND_RUNNERS = new Map();
const RUNNER_JOBS_PATH = path.join(DATA_DIR, "runner_jobs.json");
const NOVA_AGENT_RUNS_PATH = path.join(DATA_DIR, "nova_agent_runs.json");
const NOVA_AGENT_HISTORY_LIMIT = Math.max(20, Math.min(300, Number(process.env.CO_READING_NOVA_AGENT_HISTORY_LIMIT || 80)));
const NOVA_AGENT_ACTIVE_RUNS = new Map();

function readJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function normalizeListLimit(value, fallback = 50, min = 1, max = NOVA_AGENT_HISTORY_LIMIT) {
  const number = Number(value || fallback);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function normalizeAgentAction(action) {
  const raw = String(action || "pre_read").trim().toLowerCase().replace(/[-\s]+/g, "_");
  const aliases = {
    autonomous_reading: "pre_read",
    nova_pre_read: "pre_read",
    preread: "pre_read",
    pre_read_current: "pre_read"
  };
  return aliases[raw] || raw;
}

function novaAgentActiveKey(action, payload) {
  return [
    normalizeAgentAction(action),
    String(payload.bookId || "").trim(),
    String(payload.chunkId || "").trim()
  ].join(":");
}

function createNovaAgentRunId(action, bookId, chunkId) {
  const safe = [action, bookId, chunkId]
    .map((part) => String(part || "").replace(/[^\w.\-\u4e00-\u9fff]+/gu, "-").slice(0, 48))
    .filter(Boolean)
    .join("-");
  return `nova-agent-${safe || "run"}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function readNovaAgentStore() {
  const store = readJsonFile(NOVA_AGENT_RUNS_PATH, { version: 1, runs: [] });
  return {
    version: 1,
    runs: Array.isArray(store.runs) ? store.runs : []
  };
}

function writeNovaAgentStore(store) {
  writeJsonFile(NOVA_AGENT_RUNS_PATH, {
    version: 1,
    updatedAt: new Date().toISOString(),
    runs: (store.runs || []).slice(0, NOVA_AGENT_HISTORY_LIMIT)
  });
}

function normalizeNovaAgentRun(run = {}) {
  const action = normalizeAgentAction(run.action);
  const result = run.result && typeof run.result === "object" ? run.result : {};
  return {
    id: String(run.id || createNovaAgentRunId(action, run.bookId, run.chunkId)),
    action,
    label: String(run.label || (action === "pre_read" ? "Nova 自主预读" : "Nova Agent")),
    status: String(run.status || "success"),
    bookId: String(run.bookId || ""),
    bookTitle: String(run.bookTitle || ""),
    chunkId: String(run.chunkId || ""),
    chunkTitle: String(run.chunkTitle || ""),
    contextMode: String(run.contextMode || result.contextMode || "agent"),
    prompt: compactText(run.prompt || result.prompt || "", 1200),
    selection: run.selection && typeof run.selection === "object" ? {
      text: compactText(run.selection.text || "", 1200),
      offset: run.selection.offset ?? null
    } : { text: "", offset: null },
    startedAt: String(run.startedAt || new Date().toISOString()),
    completedAt: run.completedAt ? String(run.completedAt) : null,
    durationMs: Number(run.durationMs || 0),
    result: {
      content: compactText(result.content || result.note || "", 9000),
      note: compactText(result.note || result.content || "", 9000),
      chosenChunkId: String(result.chosenChunkId || run.chunkId || ""),
      candidates: Array.isArray(result.candidates) ? result.candidates.slice(0, 8) : [],
      contextMode: String(result.contextMode || run.contextMode || "agent"),
      prompt: compactText(result.prompt || run.prompt || "", 1200)
    },
    events: Array.isArray(run.events) ? run.events.slice(0, 80) : [],
    toolResults: Array.isArray(run.toolResults) ? run.toolResults.slice(0, 30) : [],
    error: run.error || null
  };
}

function upsertNovaAgentRun(run) {
  const normalized = normalizeNovaAgentRun(run);
  const store = readNovaAgentStore();
  store.runs = [
    normalized,
    ...store.runs.filter((item) => item.id !== normalized.id)
  ].slice(0, NOVA_AGENT_HISTORY_LIMIT);
  writeNovaAgentStore(store);
  return normalized;
}

function listNovaAgentRuns(filters = {}) {
  const limit = normalizeListLimit(filters.limit, 50);
  return readNovaAgentStore().runs
    .map(normalizeNovaAgentRun)
    .filter((run) => !filters.bookId || run.bookId === String(filters.bookId))
    .filter((run) => !filters.chunkId || run.chunkId === String(filters.chunkId))
    .filter((run) => !filters.action || run.action === normalizeAgentAction(filters.action))
    .sort((a, b) => String(b.completedAt || b.startedAt).localeCompare(String(a.completedAt || a.startedAt)))
    .slice(0, limit);
}

function publicToolResult(name, status, details = {}) {
  return {
    name,
    status,
    at: new Date().toISOString(),
    details
  };
}

function chunkIdOf(chunk) {
  return String(chunk?.id || chunk?.chunkId || "");
}

function chunkTitleOf(chunk, fallback = "") {
  return String(chunk?.title || chunk?.sectionTitle || fallback || chunkIdOf(chunk));
}

function textFromReadChunkResult(result) {
  const chunk = result?.chunk || result || {};
  return String(result?.text || chunk.text || "");
}

function buildAgentTocPreview(chunks, limit = 24) {
  return chunks.slice(0, limit).map((chunk, index) => ({
    chunkId: chunkIdOf(chunk),
    title: chunkTitleOf(chunk),
    position: `${index + 1}/${chunks.length}`,
    read: Boolean(chunk.read)
  }));
}

function chooseAgentCandidateIds(chunks, anchorChunkId, maxCandidates = 3) {
  const limit = normalizeListLimit(maxCandidates, 3, 1, 6);
  const index = chunks.findIndex((chunk) => chunkIdOf(chunk) === anchorChunkId);
  if (index < 0) return anchorChunkId ? [anchorChunkId] : [];
  const offsets = [0, 1, -1, 2, -2, 3, -3];
  const ids = [];
  for (const offset of offsets) {
    const chunk = chunks[index + offset];
    const id = chunkIdOf(chunk);
    if (id && !ids.includes(id)) ids.push(id);
    if (ids.length >= limit) break;
  }
  return ids;
}

async function agentRunWrapper(command, payload, run) {
  run.events.push({ type: "tool_start", tool: command, at: new Date().toISOString() });
  try {
    const result = await runWrapper({ command, ...payload });
    run.toolResults.push(publicToolResult(command, "success", {
      bookId: payload.bookId || "",
      chunkId: payload.chunkId || "",
      count: Array.isArray(result.data) ? result.data.length : undefined
    }));
    run.events.push({ type: "tool_end", tool: command, status: "success", at: new Date().toISOString() });
    return result;
  } catch (error) {
    run.toolResults.push(publicToolResult(command, "error", { message: error.message || String(error) }));
    run.events.push({ type: "tool_end", tool: command, status: "error", at: new Date().toISOString() });
    throw error;
  }
}

async function readAgentCandidate(bookId, chunkId, run) {
  const result = await agentRunWrapper("read_chunk", { bookId, chunkId }, run);
  const chunk = result.data?.chunk || result.data || {};
  return {
    chunkId,
    title: chunkTitleOf(chunk, chunkId),
    text: compactText(textFromReadChunkResult(result.data), 1800)
  };
}

function buildNovaPreReadAgentPrompt(payload) {
  return compactText(payload.prompt || [
    "请作为共读伙伴先替我读这一小段。",
    "你可以在当前段、下一段或上一段之间自己选择一个最值得停留的位置。",
    "请给出：你先看哪里、这一段在做什么、最值得划线的一点、我下一步读书时该留意什么。",
    "不要把它写成系统说明，也不要假装读完整本书。"
  ].join("\n"), 1400);
}

async function runNovaPreReadAgent(payload) {
  const bookId = String(payload.bookId || "").trim();
  const chunkId = String(payload.chunkId || "").trim();
  if (!bookId || !chunkId) {
    const error = new Error("bookId 和 chunkId 是必需参数。");
    error.statusCode = 400;
    throw error;
  }
  const startedAtMs = Date.now();
  const run = normalizeNovaAgentRun({
    action: "pre_read",
    status: "running",
    bookId,
    bookTitle: payload.bookTitle || "",
    chunkId,
    chunkTitle: payload.chunkTitle || "",
    contextMode: "autonomous-reading",
    prompt: buildNovaPreReadAgentPrompt(payload),
    selection: payload.selection || payload.context?.selection || null,
    startedAt: new Date(startedAtMs).toISOString(),
    result: { contextMode: "autonomous-reading" }
  });
  upsertNovaAgentRun(run);

  try {
    const chunksResult = await agentRunWrapper("list_chunks", { bookId }, run);
    const chunks = Array.isArray(chunksResult.data) ? chunksResult.data : chunksResult.data?.chunks || [];
    const currentMeta = chunks.find((chunk) => chunkIdOf(chunk) === chunkId) || {};
    const candidateIds = chooseAgentCandidateIds(chunks, chunkId, payload.maxCandidates || 3);
    const candidates = [];
    for (const candidateId of candidateIds) {
      candidates.push(await readAgentCandidate(bookId, candidateId, run));
    }
    const current = candidates.find((item) => item.chunkId === chunkId) || await readAgentCandidate(bookId, chunkId, run);
    const prompt = run.prompt;
    const nova = await askNova({
      model: payload.model,
      prompt,
      context: {
        bookId,
        bookTitle: payload.bookTitle || run.bookTitle,
        chunkId,
        chunkTitle: chunkTitleOf(currentMeta, payload.chunkTitle || chunkId),
        text: current.text,
        selection: run.selection.text || "",
        selectionOffset: run.selection.offset ?? null,
        contextMode: "autonomous-reading",
        coReadingContextVersion: "backend-agent-v1",
        tocPreview: buildAgentTocPreview(chunks),
        autonomousCandidates: candidates,
        instructionBoundary: "Nova 可以在 autonomousCandidates 中自行选择先读哪里；只能评论传入候选段和当前段，不要假装读完整本书。"
      }
    });
    run.status = "success";
    run.completedAt = new Date().toISOString();
    run.durationMs = Date.now() - startedAtMs;
    run.bookTitle = payload.bookTitle || run.bookTitle || "";
    run.chunkTitle = chunkTitleOf(currentMeta, payload.chunkTitle || chunkId);
    run.result = {
      content: nova.content || "Nova 暂无文本回复。",
      note: nova.content || "Nova 暂无文本回复。",
      chosenChunkId: chunkId,
      candidates,
      contextMode: "autonomous-reading",
      prompt
    };
    run.events.push({ type: "agent_end", status: "success", at: run.completedAt });
    const saved = upsertNovaAgentRun(run);
    return { status: "success", run: saved, result: saved.result };
  } catch (error) {
    run.status = "error";
    run.completedAt = new Date().toISOString();
    run.durationMs = Date.now() - startedAtMs;
    run.error = { message: error.message || String(error), details: error.details || null };
    run.events.push({ type: "agent_end", status: "error", at: run.completedAt });
    const saved = upsertNovaAgentRun(run);
    error.details = { ...(error.details || {}), run: saved };
    throw error;
  }
}

async function runNovaAgent(payload) {
  const action = normalizeAgentAction(payload.action || payload.task);
  if (action === "pre_read") {
    const key = novaAgentActiveKey(action, payload);
    if (!payload.force && NOVA_AGENT_ACTIVE_RUNS.has(key)) {
      return NOVA_AGENT_ACTIVE_RUNS.get(key);
    }
    const promise = runNovaPreReadAgent({ ...payload, action });
    if (!payload.force) NOVA_AGENT_ACTIVE_RUNS.set(key, promise);
    try {
      return await promise;
    } finally {
      if (NOVA_AGENT_ACTIVE_RUNS.get(key) === promise) NOVA_AGENT_ACTIVE_RUNS.delete(key);
    }
  }
  const error = new Error(`Unsupported Nova agent action: ${action}`);
  error.statusCode = 400;
  throw error;
}

function serializeRunner(runner) {
  const { timer, ...persisted } = runner;
  return persisted;
}

function persistRunnerJobs() {
  writeJsonFile(RUNNER_JOBS_PATH, {
    version: 1,
    updatedAt: new Date().toISOString(),
    jobs: Array.from(BACKGROUND_RUNNERS.values()).map(serializeRunner)
  });
}

function loadRunnerJobs() {
  const store = readJsonFile(RUNNER_JOBS_PATH, { version: 1, jobs: [] });
  const jobs = Array.isArray(store.jobs) ? store.jobs : [];
  for (const job of jobs) {
    if (!job?.planId) continue;
    BACKGROUND_RUNNERS.set(String(job.planId), { ...job, timer: null });
  }
}

function normalizeRunnerNumber(value, fallback, min, max) {
  const number = Number(value || fallback);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function publicRunnerState(runner) {
  if (!runner) return null;
  return {
    planId: runner.planId,
    status: runner.status,
    startedAt: runner.startedAt,
    updatedAt: runner.updatedAt,
    stoppedAt: runner.stoppedAt || null,
    stoppedReason: runner.stoppedReason || null,
    intervalMs: runner.intervalMs,
    maxStepsPerTick: runner.maxStepsPerTick,
    maxTicks: runner.maxTicks || null,
    tickCount: runner.tickCount,
    executedCount: runner.executedCount,
    retryCount: runner.retryCount || 0,
    maxRetries: runner.maxRetries || 0,
    retryDelayMs: runner.retryDelayMs || null,
    nextRunAt: runner.nextRunAt || null,
    lastResult: runner.lastResult || null,
    lastError: runner.lastError || null
  };
}

function listRunnerStates() {
  return Array.from(BACKGROUND_RUNNERS.values()).map(publicRunnerState);
}

function getRunnerState(planId) {
  const runner = BACKGROUND_RUNNERS.get(String(planId || ""));
  return publicRunnerState(runner) || { planId, status: "idle" };
}

function scheduleRunnerTick(runner, delayMs) {
  if (runner.timer) clearTimeout(runner.timer);
  runner.nextRunAt = new Date(Date.now() + Math.max(0, delayMs)).toISOString();
  runner.updatedAt = new Date().toISOString();
  persistRunnerJobs();
  runner.timer = setTimeout(() => {
    void runBackgroundRunnerTick(runner.planId);
  }, Math.max(0, delayMs));
  runner.timer.unref?.();
}

function stopBackgroundRunner(planId, reason = "stopped") {
  const runner = BACKGROUND_RUNNERS.get(String(planId || ""));
  if (!runner) return { planId, status: "idle", stoppedReason: reason };
  if (runner.timer) clearTimeout(runner.timer);
  runner.timer = null;
  runner.status = "stopped";
  runner.stoppedReason = reason;
  runner.stoppedAt = new Date().toISOString();
  runner.updatedAt = runner.stoppedAt;
  runner.nextRunAt = null;
  persistRunnerJobs();
  return publicRunnerState(runner);
}

function finishBackgroundRunner(runner, status, reason, extra = {}) {
  if (runner.timer) clearTimeout(runner.timer);
  runner.timer = null;
  runner.status = status;
  runner.stoppedReason = reason;
  runner.stoppedAt = new Date().toISOString();
  runner.updatedAt = runner.stoppedAt;
  runner.nextRunAt = null;
  Object.assign(runner, extra);
  persistRunnerJobs();
  return publicRunnerState(runner);
}

function buildRunnerFromPayload(payload, existing = null) {
  const planId = String(payload.planId || "").trim();
  if (!planId) {
    const error = new Error("planId is required.");
    error.statusCode = 400;
    throw error;
  }
  const now = new Date().toISOString();
  return {
    planId,
    status: "running",
    startedAt: existing?.startedAt || now,
    updatedAt: now,
    stoppedAt: null,
    stoppedReason: null,
    intervalMs: normalizeRunnerNumber(payload.intervalMs, existing?.intervalMs || 5000, 1000, 60 * 60 * 1000),
    maxStepsPerTick: normalizeRunnerNumber(payload.maxStepsPerTick, existing?.maxStepsPerTick || 1, 1, 10),
    maxTicks: payload.maxTicks ? normalizeRunnerNumber(payload.maxTicks, existing?.maxTicks || 0, 1, 100000) : existing?.maxTicks || null,
    stopOnError: payload.stopOnError !== undefined ? payload.stopOnError !== false : existing?.stopOnError !== false,
    maxRetries: normalizeRunnerNumber(payload.maxRetries, existing?.maxRetries || 0, 0, 100),
    retryDelayMs: normalizeRunnerNumber(payload.retryDelayMs, existing?.retryDelayMs || 5000, 1000, 60 * 60 * 1000),
    retryCount: existing?.retryCount || 0,
    tickCount: existing?.tickCount || 0,
    executedCount: existing?.executedCount || 0,
    lastResult: existing?.lastResult || null,
    lastError: existing?.lastError || null,
    nextRunAt: null,
    timer: null
  };
}

function startBackgroundRunner(payload) {
  const planId = String(payload.planId || "").trim();
  if (!planId) {
    const error = new Error("planId is required.");
    error.statusCode = 400;
    throw error;
  }
  const existing = BACKGROUND_RUNNERS.get(planId);
  if (existing && ["running", "waiting"].includes(existing.status)) return publicRunnerState(existing);

  const runner = buildRunnerFromPayload(payload, existing);
  BACKGROUND_RUNNERS.set(planId, runner);
  scheduleRunnerTick(runner, 0);
  return publicRunnerState(runner);
}

function retryBackgroundRunner(payload) {
  const planId = String(payload.planId || "").trim();
  const existing = BACKGROUND_RUNNERS.get(planId);
  const runner = buildRunnerFromPayload(payload, existing);
  runner.retryCount = 0;
  runner.tickCount = existing?.tickCount || 0;
  runner.executedCount = existing?.executedCount || 0;
  BACKGROUND_RUNNERS.set(planId, runner);
  scheduleRunnerTick(runner, 0);
  return publicRunnerState(runner);
}

function maybeRetryRunner(runner, reason, lastError) {
  runner.lastError = lastError || runner.lastError;
  if ((runner.retryCount || 0) < (runner.maxRetries || 0)) {
    runner.retryCount = (runner.retryCount || 0) + 1;
    runner.status = "waiting";
    runner.stoppedReason = reason;
    runner.updatedAt = new Date().toISOString();
    scheduleRunnerTick(runner, runner.retryDelayMs || runner.intervalMs);
    return true;
  }
  finishBackgroundRunner(runner, "error", reason, { lastError: runner.lastError });
  return false;
}

async function runBackgroundRunnerTick(planId) {
  const runner = BACKGROUND_RUNNERS.get(String(planId || ""));
  if (!runner || !["running", "waiting"].includes(runner.status)) return;
  runner.status = "running";
  runner.tickCount += 1;
  runner.nextRunAt = null;
  runner.updatedAt = new Date().toISOString();
  persistRunnerJobs();

  try {
    const result = await runWrapper({
      command: "plan_run",
      planId: runner.planId,
      maxSteps: runner.maxStepsPerTick,
      stopOnError: runner.stopOnError,
      createdBy: "CoReadingSidecar.backgroundRunner"
    });
    const data = result.data || {};
    const stoppedReason = data.runner?.stoppedReason || null;
    const tickExecuted = Number(data.runner?.executedCount || 0);
    runner.executedCount += Number.isFinite(tickExecuted) ? tickExecuted : 0;
    runner.lastResult = data;
    runner.lastError = data.runner?.error || null;
    runner.updatedAt = new Date().toISOString();

    if (stoppedReason === "locked") {
      runner.status = "waiting";
      scheduleRunnerTick(runner, runner.intervalMs);
      return;
    }
    if (stoppedReason === "error" || runner.lastError) {
      maybeRetryRunner(runner, "error", runner.lastError);
      return;
    }
    if (stoppedReason === "paused" || data.paused) {
      finishBackgroundRunner(runner, "paused", "paused");
      return;
    }
    if (stoppedReason === "completed" || data.completed) {
      finishBackgroundRunner(runner, "completed", "completed");
      return;
    }
    if (runner.maxTicks && runner.tickCount >= runner.maxTicks) {
      finishBackgroundRunner(runner, "stopped", "max_ticks");
      return;
    }
    scheduleRunnerTick(runner, runner.intervalMs);
  } catch (error) {
    maybeRetryRunner(runner, "api_error", {
      message: error.message || String(error),
      details: error.details || null
    });
  }
}

function restoreBackgroundRunners() {
  loadRunnerJobs();
  for (const runner of BACKGROUND_RUNNERS.values()) {
    if (["running", "waiting"].includes(runner.status)) {
      const nextAt = runner.nextRunAt ? Date.parse(runner.nextRunAt) : Date.now();
      const delayMs = Number.isFinite(nextAt) ? Math.max(0, nextAt - Date.now()) : runner.intervalMs || 5000;
      scheduleRunnerTick(runner, delayMs);
    }
  }
}

async function handleApi(req, res, url) {
  const cardImageMatch = url.pathname.match(/^\/api\/cards\/([^/]+)\/image$/);
  if (req.method === "GET" && cardImageMatch) {
    await handleCardImage(res, cardImageMatch[1]);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, {
      status: "ok",
      host: HOST,
      port: PORT,
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      dataDir: DATA_DIR,
      vendorDir: VENDOR_DIR,
      localLibraryDir: LOCAL_LIBRARY_DIR,
      novaTimeoutMs: NOVA_TIMEOUT_MS,
      sinkDefaults: configuredSinkDefaults(),
      runnerJobsPath: RUNNER_JOBS_PATH,
      novaAgentRunsPath: NOVA_AGENT_RUNS_PATH,
      novaAgentRunCount: listNovaAgentRuns({ limit: NOVA_AGENT_HISTORY_LIMIT }).length,
      runnerCount: BACKGROUND_RUNNERS.size,
      activeRunnerCount: listRunnerStates().filter((runner) => ["running", "waiting"].includes(runner.status)).length
    });
  }

  if (req.method === "GET" && url.pathname === "/api/snapshot") {
    const [books, plans, reviews, previews, illustrations, cardInbox, cardCollection] = await Promise.all([
      runWrapper({ command: "list_books" }),
      runWrapper({ command: "plan_list" }),
      runWrapper({ command: "review_list" }),
      runWrapper({ command: "sink_preview_list" }),
      runWrapper({ command: "illustration_list" }),
      runWrapper({ command: "card_inbox", limit: 20 }),
      runWrapper({ command: "card_collection", limit: 20 })
    ]);
    return sendJson(res, 200, {
      status: "success",
      books: Array.isArray(books.data) ? books.data : [],
      plans: plans.data?.plans || [],
      reviews: reviews.data?.reviews || [],
      sinkPreviews: previews.data?.previews || [],
      illustrations: illustrations.data?.illustrations || [],
      cardInbox: Array.isArray(cardInbox.data) ? cardInbox.data : [],
      cardCollection: cardCollection.data || { items: [], bookCards: [] },
      agentRuns: listNovaAgentRuns({ limit: 60 }),
      backgroundRunners: listRunnerStates(),
      raw: {
        list_books: books.raw,
        plan_list: plans.raw,
        review_list: reviews.raw,
        sink_preview_list: previews.raw,
        illustration_list: illustrations.raw,
        card_inbox: cardInbox.raw,
        card_collection: cardCollection.raw
      }
    });
  }

  if (req.method === "POST" && url.pathname === "/api/command") {
    return sendJson(res, 200, await runCommand(await readJsonBody(req)));
  }

  if (req.method === "GET" && url.pathname === "/api/local-library") {
    return sendJson(res, 200, await listLocalLibraryBooks());
  }

  if (req.method === "POST" && url.pathname === "/api/local-library/import") {
    return sendJson(res, 200, await importLocalLibraryBook(await readJsonBody(req)));
  }

  if (req.method === "POST" && url.pathname === "/api/nova/ask") {
    return sendJson(res, 200, await askNova(await readJsonBody(req)));
  }

  if (req.method === "GET" && url.pathname === "/api/agent/runs") {
    return sendJson(res, 200, {
      status: "success",
      runs: listNovaAgentRuns({
        bookId: url.searchParams.get("bookId") || "",
        chunkId: url.searchParams.get("chunkId") || "",
        action: url.searchParams.get("action") || "",
        limit: url.searchParams.get("limit") || 50
      })
    });
  }

  if (req.method === "POST" && url.pathname === "/api/agent/run") {
    return sendJson(res, 200, await runNovaAgent(await readJsonBody(req)));
  }

  if (req.method === "GET" && url.pathname === "/api/runner/status") {
    const planId = url.searchParams.get("planId");
    return sendJson(res, 200, {
      status: "success",
      runner: planId ? getRunnerState(planId) : null,
      runners: planId ? [] : listRunnerStates()
    });
  }

  if (req.method === "POST" && url.pathname === "/api/runner/start") {
    return sendJson(res, 200, { status: "success", runner: startBackgroundRunner(await readJsonBody(req)) });
  }

  if (req.method === "POST" && url.pathname === "/api/runner/retry") {
    return sendJson(res, 200, { status: "success", runner: retryBackgroundRunner(await readJsonBody(req)) });
  }

  if (req.method === "POST" && url.pathname === "/api/runner/stop") {
    const body = await readJsonBody(req);
    return sendJson(res, 200, { status: "success", runner: stopBackgroundRunner(body.planId, body.reason || "user_stopped") });
  }

  return sendError(res, 404, "Not found");
}

async function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const resolved = path.resolve(FRONTEND_DIR, requested);
  const relative = path.relative(FRONTEND_DIR, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return sendError(res, 403, "Forbidden");
  try {
    const body = await fs.promises.readFile(resolved);
    res.writeHead(200, {
      "content-type": CONTENT_TYPES[path.extname(resolved)] || "application/octet-stream"
    });
    res.end(body);
  } catch (error) {
    if (error.code === "ENOENT") return sendError(res, 404, "Not found");
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
    } else {
      await serveStatic(req, res, url);
    }
  } catch (error) {
    sendError(res, Number(error.statusCode || 500), error.message || String(error), error.details);
  }
});

restoreBackgroundRunners();

server.listen(PORT, HOST, () => {
  process.stderr.write(`CoReading sidecar: http://${HOST}:${PORT}\n`);
});
