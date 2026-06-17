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

applySidecarEnvDefaults();

const NOVA_SKILL_PROMPTS_DIR = process.env.CO_READING_NOVA_SKILL_PROMPTS_DIR || path.join(PROMPTS_DIR, "skills");
const DEFAULT_DATA_DIR = path.join(PROJECT_ROOT, "data", "co-reading-mcp");
const DATA_DIR = path.resolve(process.env.CO_READING_DATA_DIR || process.env.READING_MCP_DATA_DIR || DEFAULT_DATA_DIR);
const VENDOR_DIR = path.resolve(process.env.CO_READING_VENDOR_DIR || path.join(PLUGIN_DIR, "vendor", "co-reading-mcp"));

const HOST = process.env.CO_READING_SIDECAR_HOST || "127.0.0.1";
const PORT = Number(process.env.CO_READING_SIDECAR_PORT || 8791);
const MAX_BODY_BYTES = Number(process.env.CO_READING_SIDECAR_MAX_BODY_BYTES || 2_000_000);
const NOVA_BACKENDS = normalizeNovaBackends(process.env.CO_READING_NOVA_BACKENDS || "vcp,bridge");
const NOVA_VCP_URL = normalizeChatCompletionsUrl(process.env.CO_READING_NOVA_VCP_URL || "http://127.0.0.1:6005/v1/chat/completions");
const NOVA_BRIDGE_URL = normalizeChatCompletionsUrl(process.env.CO_READING_NOVA_BRIDGE_URL || "http://127.0.0.1:3100/v1/chat/completions");
const NOVA_AGENT_URL = normalizeAgentAssistantUrl(process.env.CO_READING_NOVA_AGENT_URL || "http://127.0.0.1:6005/v1/human/tool");
const NOVA_AGENT_NAME = process.env.CO_READING_NOVA_AGENT_NAME || "Nova";
const NOVA_AGENT_MAID = process.env.CO_READING_NOVA_AGENT_MAID || "Nova";
const NOVA_AGENT_SESSION = process.env.CO_READING_NOVA_AGENT_SESSION || "coreading-reader";
const NOVA_AGENT_SESSION_SCOPE = String(process.env.CO_READING_NOVA_AGENT_SESSION_SCOPE || "book").toLowerCase();
const NOVA_AGENT_INJECT_TOOLS = process.env.CO_READING_NOVA_AGENT_INJECT_TOOLS || "CoReadingMCP,AnySearch,JinaReader,FileOperator";
const NOVA_MODEL = process.env.CO_READING_NOVA_MODEL || "gpt-5.5";
const NOVA_GUIDE_PATH = process.env.CO_READING_NOVA_GUIDE_PATH || path.join(PROMPTS_DIR, "CoReadingNovaGuide.txt");
const NOVA_TIMEOUT_MS = Math.max(3000, Math.min(600000, Number(process.env.CO_READING_NOVA_TIMEOUT_MS || 360000)));
const NOVA_FALLBACK_TIMEOUT_MS = Math.max(800, Math.min(60000, Number(process.env.CO_READING_NOVA_FALLBACK_TIMEOUT_MS || 1500)));
const LOCAL_LIBRARY_DIR = path.resolve(process.env.CO_READING_LIBRARY_DIR || "D:\\书库");

// 模拟书友圈：独立普通 OpenAI 兼容接口，与 Nova 的 VCP 通道完全分开。
const COMPANION_API_URL = String(process.env.CO_READING_COMPANION_API_URL || "").trim();
const COMPANION_API_KEY = String(process.env.CO_READING_COMPANION_API_KEY || "").trim();
const COMPANION_MODEL = String(process.env.CO_READING_COMPANION_MODEL || "gpt-4o-mini").trim();
const COMPANION_TIMEOUT_MS = Math.max(5000, Math.min(300000, Number(process.env.CO_READING_COMPANION_TIMEOUT_MS || 60000)));
const COMPANION_PERSONAS_PATH = process.env.CO_READING_COMPANION_PERSONAS_PATH
  || path.join(PROMPTS_DIR, "companions", "personas.json");
const COMPANIONS_DIR = path.join(DATA_DIR, "companions");

process.env.READING_MCP_DATA_DIR = DATA_DIR;
process.env.READING_IMPORT_MAX_BYTES = process.env.READING_IMPORT_MAX_BYTES || "100000000";
const IMPORT_MAX_BYTES = Number(process.env.READING_IMPORT_MAX_BYTES || 100_000_000);
const UPLOAD_SESSIONS = new Map();

function configuredSinkDefaults() {
  const defaults = {
    vaultPath: process.env.CO_READING_OBSIDIAN_VAULT_DIR || "",
    dailyNoteRoot: process.env.CO_READING_DAILY_NOTE_ROOT || process.env.KNOWLEDGEBASE_ROOT_PATH || "",
    vcpMemoryRoot: process.env.CO_READING_VCP_MEMORY_ROOT || process.env.VCP_MEMORY_ROOT || "",
    obsOutputDir: process.env.CO_READING_OBS_OUTPUT_DIR || ""
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
  "user_note_delete",
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
  "illustration_suggest",
  "reading_find_weread_context"
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
      let data = outer.data ?? null;
      if (data === null) {
        try {
          data = parseJsonBlock(outer.result);
        } catch {
          data = null;
        }
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
            const error = new Error(novaErrorMessageFromBody(json, `${label} HTTP ${res.statusCode}`));
            error.statusCode = 502;
            error.details = { httpStatus: res.statusCode, label, body: json };
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

function postText(url, body, headers = {}, { timeoutMs = 30000, label = "request" } = {}) {
  return new Promise((resolve, reject) => {
    const endpoint = new URL(url);
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
          "content-type": "text/plain; charset=utf-8",
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
            const error = new Error(novaErrorMessageFromBody(json, `Nova AgentAssistant HTTP ${res.statusCode}`));
            error.statusCode = 502;
            error.details = { agentStatus: res.statusCode, body: json };
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

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function flattenNovaErrorParts(value, depth = 0, seen = new Set()) {
  if (value === null || value === undefined || depth > 4) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenNovaErrorParts(item, depth + 1, seen));
  }
  if (typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);
  const preferred = ["message", "code", "type", "status", "statusCode", "error", "details", "body", "raw"];
  const parts = [];
  for (const key of preferred) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      parts.push(...flattenNovaErrorParts(value[key], depth + 1, seen));
    }
  }
  if (!parts.length) {
    for (const item of Object.values(value).slice(0, 8)) {
      parts.push(...flattenNovaErrorParts(item, depth + 1, seen));
    }
  }
  return parts;
}

function novaErrorPayloadText(value) {
  return [...new Set(flattenNovaErrorParts(value))]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
}

function novaErrorMessageFromBody(body, fallback) {
  return compactText(novaErrorPayloadText(body?.error || body) || fallback, 1000);
}

function compactText(value, maxChars = 7000) {
  const text = String(value || "").trim();
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n\n[已截断 ${text.length - maxChars} 字]` : text;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanNovaVisibleContent(value) {
  return String(value || "")
    .replace(/<!--\s*persona_(delta|expression)\s*:[\s\S]*?-->/giu, "")
    .replace(/<!--\s*persona_[\s\S]*?-->/giu, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeSlug(value, fallback = "default") {
  const safe = String(value || "").trim().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
  return safe || fallback;
}

function normalizeNovaBackends(value) {
  const aliases = new Map([
    ["agent", "agent-assistant"],
    ["assistant", "agent-assistant"],
    ["agent_assistant", "agent-assistant"],
    ["6005", "vcp"],
    ["vcp-chat", "vcp"],
    ["vcp_chat", "vcp"],
    ["vcp-openai", "vcp"],
    ["vcp_openai", "vcp"],
    ["bridge", "bridge"],
    ["3100", "bridge"],
    ["openai", "bridge"],
    ["chat", "bridge"],
    ["chat-completions", "bridge"]
  ]);
  const backends = String(value || "")
    .split(/[,\s]+/u)
    .map((item) => aliases.get(item.trim().toLowerCase()) || item.trim().toLowerCase())
    .filter((item) => item === "vcp" || item === "bridge" || item === "agent-assistant");
  return [...new Set(backends)].length ? [...new Set(backends)] : ["vcp", "bridge"];
}

function normalizeChatCompletionsUrl(value) {
  const raw = String(value || "").trim();
  if (/\/v1\/chat\/completions\/?$/u.test(raw)) return raw.replace(/\/$/u, "");
  const base = raw.replace(/\/+$/u, "").replace(/\/v1$/u, "");
  return `${base}/v1/chat/completions`;
}

function normalizeAgentAssistantUrl(value) {
  const raw = String(value || "http://127.0.0.1:6005").trim();
  if (/\/v1\/human\/tool\/?$/u.test(raw)) return raw.replace(/\/$/u, "");
  const base = raw.replace(/\/+$/u, "").replace(/\/v1$/u, "");
  return `${base}/v1/human/tool`;
}

function novaApiKeyRecord() {
  const candidates = [
    ["CO_READING_NOVA_API_KEY", process.env.CO_READING_NOVA_API_KEY],
    ["VCP_API_KEY", process.env.VCP_API_KEY],
    ["VCP_Key", process.env.VCP_Key],
    ["VCP_KEY", process.env.VCP_KEY],
    ["VCP_SERVER_ACCESS_KEY", process.env.VCP_SERVER_ACCESS_KEY]
  ];
  const found = candidates.find(([, value]) => String(value || "").trim());
  return found ? { source: found[0], value: String(found[1]).trim() } : { source: "", value: "" };
}

function novaApiKey() {
  return novaApiKeyRecord().value;
}

function novaApiKeySource() {
  return novaApiKeyRecord().source;
}

function novaRequestTimeoutMs(body = {}) {
  const requested = Number(body.timeoutMs || body.clientTimeoutMs || 0);
  if (!Number.isFinite(requested) || requested <= 0) return NOVA_TIMEOUT_MS;
  return Math.max(3000, Math.min(NOVA_TIMEOUT_MS, requested));
}

function novaAttemptTimeoutMs(backend, index, totalTimeoutMs) {
  if (backend === "bridge" && NOVA_BACKENDS.includes("vcp") && NOVA_BACKENDS.length > 1) {
    return Math.min(NOVA_FALLBACK_TIMEOUT_MS, totalTimeoutMs);
  }
  if (index === 0 || NOVA_BACKENDS.length === 1) return totalTimeoutMs;
  return Math.max(3000, Math.min(totalTimeoutMs, NOVA_FALLBACK_TIMEOUT_MS * 4));
}

function novaSessionId(context = {}) {
  const base = NOVA_AGENT_SESSION || "coreading-reader";
  if (NOVA_AGENT_SESSION_SCOPE === "global") return safeSlug(base, "coreading-reader");
  if (NOVA_AGENT_SESSION_SCOPE === "chunk" && context.bookId && context.chunkId) {
    return safeSlug(`${base}-${context.bookId}-${context.chunkId}`, base);
  }
  if (context.bookId) return safeSlug(`${base}-${context.bookId}`, base);
  return safeSlug(base, "coreading-reader");
}

function novaToolValue(value) {
  return String(value ?? "")
    .replace(/<<<\[TOOL_REQUEST\]>>>/g, "<<<[TOOL_REQUEST_ESCAPE]>>>")
    .replace(/<<<\[END_TOOL_REQUEST\]>>>/g, "<<<[END_TOOL_REQUEST_ESCAPE]>>>")
    .replace(/「始」/g, "「始ESCAPE」")
    .replace(/「末」/g, "「末ESCAPE」");
}

function buildAgentAssistantBody({ prompt, context }) {
  const fields = [
    ["maid", NOVA_AGENT_MAID],
    ["tool_name", "AgentAssistant"],
    ["agent_name", NOVA_AGENT_NAME],
    ["prompt", prompt],
    ["session_id", novaSessionId(context)]
  ];
  if (NOVA_AGENT_INJECT_TOOLS) fields.push(["inject_tools", NOVA_AGENT_INJECT_TOOLS]);
  return [
    "<<<[TOOL_REQUEST]>>>",
    ...fields.map(([key, value]) => `${key}:「始」${novaToolValue(value)}「末」,`),
    "<<<[END_TOOL_REQUEST]>>>"
  ].join("\n");
}

function extractChoiceContent(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return textFromMaybeSse(content);
  if (Array.isArray(content)) return textFromContentArray(content);
  return "";
}

function textFromContentArray(content) {
  return content
    .map((item) => {
      if (typeof item === "string") return textFromMaybeSse(item);
      if (item && typeof item.text === "string") return item.text;
      if (item && typeof item.content === "string") return textFromMaybeSse(item.content);
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function parseSseChatContent(text) {
  const raw = String(text || "");
  if (!raw.includes("data:")) return null;
  const parts = [];
  let eventCount = 0;
  let choiceCount = 0;
  let contentEventCount = 0;
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    const data = tryParseJson(payload);
    if (!data) continue;
    eventCount += 1;
    if (Array.isArray(data.choices) && data.choices.length) choiceCount += data.choices.length;
    const choice = data.choices?.[0] || {};
    const delta = choice.delta || {};
    const message = choice.message || {};
    const content = delta.content ?? message.content ?? choice.text ?? data.output_text ?? data.text ?? "";
    if (typeof content === "string" && content) {
      contentEventCount += 1;
      parts.push(content);
    } else if (Array.isArray(content)) {
      const textContent = textFromContentArray(content);
      if (textContent) contentEventCount += 1;
      parts.push(textContent);
    }
  }
  return { content: parts.join("").trim(), eventCount, choiceCount, contentEventCount };
}

function looksLikeEmptySseChatStream(value) {
  const parsed = parseSseChatContent(value);
  return Boolean(parsed && parsed.eventCount > 0 && parsed.contentEventCount === 0);
}

function textFromMaybeSse(value) {
  const text = String(value || "");
  const parsed = parseSseChatContent(text);
  if (parsed) return parsed.content;
  return text;
}

function extractNovaContent(data) {
  return String(
    extractChoiceContent(data)
    || (Array.isArray(data?.content) ? textFromContentArray(data.content) : "")
    || data?.output_text
    || textFromMaybeSse(data?.content)
    || textFromMaybeSse(data?.text)
    || textFromMaybeSse(data?.message)
    || textFromMaybeSse(data?.raw)
    || ""
  ).trim();
}

function embeddedNovaContentErrorKind(content) {
  const text = String(content || "");
  const strongMarker = /^\s*\[UPSTREAM_ERROR\]/iu.test(text)
    || /上游API返回状态码\s*\d+/iu.test(text)
    || /"code"\s*:\s*"[^"]+"/iu.test(text)
    || /new_api_error|bad_response_status_code|insufficient_user_quota/iu.test(text);
  if (!strongMarker) return "";
  const statusMatch = text.match(/状态码\s*(\d{3})/u) || text.match(/\bHTTP\s*(\d{3})\b/iu);
  const status = statusMatch ? Number(statusMatch[1]) : null;
  return classifyNovaErrorKind(status, text, "upstream_error");
}

function classifyNovaResponse(backend, result) {
  const content = cleanNovaVisibleContent(extractNovaContent(result));
  const rawText = [
    result?.raw,
    result?.text,
    result?.message,
    result?.content,
    result?.choices?.[0]?.message?.content
  ].find((item) => typeof item === "string" && item.includes("data:"));
  const embedded = content && /^[\[{]/u.test(content.trim()) ? tryParseJson(content.trim()) : null;
  const embeddedError = embedded && typeof embedded === "object" ? embedded.error : null;
  if (result?.error || embeddedError) {
    return {
      ok: false,
      kind: classifyNovaErrorKind(null, result?.error || embeddedError, "upstream_error"),
      backend,
      error: result.error || embeddedError,
      content: content.slice(0, 1200)
    };
  }
  const contentErrorKind = embeddedNovaContentErrorKind(content);
  if (contentErrorKind) {
    return {
      ok: false,
      kind: contentErrorKind,
      backend,
      error: content.slice(0, 1200),
      content: content.slice(0, 1200)
    };
  }
  if (["pending", "queued", "running", "processing"].includes(String(result?.status || "").toLowerCase()) && !content) {
    return {
      ok: false,
      kind: "pending",
      backend,
      status: result.status,
      id: result.id || result.job_id || result.task_id || result.run_id || null
    };
  }
  if (!content) {
    return {
      ok: false,
      kind: looksLikeEmptySseChatStream(rawText) ? "empty_sse_stream" : "empty_response",
      backend,
      diagnostic: looksLikeEmptySseChatStream(rawText)
        ? "Nova backend returned SSE usage events without assistant text."
        : "Nova backend returned no assistant text."
    };
  }
  return { ok: true, kind: "ok", backend, content };
}

function novaAttemptErrorText(error) {
  return [
    error?.message || "",
    novaErrorPayloadText(error?.details || "")
  ].filter(Boolean).join(" ");
}

function classifyNovaErrorKind(upstreamStatus, payload, fallback = "transport_error") {
  const text = novaErrorPayloadText(payload).toLowerCase();
  if (/insufficient[_\s-]*user[_\s-]*quota|quota|余额|额度|credits?/iu.test(text)) return "quota_unavailable";
  if (/rate[_\s-]*limit|too many requests|cooldown|限流|频率/iu.test(text)) return "rate_limited";
  if (/bad[_\s-]*response[_\s-]*status[_\s-]*code|bad response status code/iu.test(text)) return "upstream_http_error";
  if (upstreamStatus === 401) return "unauthorized";
  if (
    upstreamStatus === 403
    && /(unauthori[sz]ed|forbidden|invalid[_\s-]*(api[_\s-]*)?key|api[_\s-]*key|bearer|token|鉴权|认证|密钥)/iu.test(text)
  ) {
    return "unauthorized";
  }
  if (upstreamStatus === 403) return "forbidden";
  if (upstreamStatus) return "upstream_http_error";
  if (/(unauthori[sz]ed|invalid[_\s-]*(api[_\s-]*)?key|api[_\s-]*key|鉴权|认证|密钥)/iu.test(text)) return "unauthorized";
  return fallback;
}

function novaAttemptError(backend, error) {
  const upstreamStatus = error.details?.httpStatus || error.details?.agentStatus || error.details?.bridgeStatus || null;
  const timeout = error.code === "ETIMEDOUT" || error.statusCode === 504;
  const payloadText = novaAttemptErrorText(error);
  return {
    backend,
    kind: error.code === "ECONNREFUSED"
      ? "connection_refused"
      : timeout
        ? "timeout"
        : classifyNovaErrorKind(upstreamStatus, [payloadText, error.details], upstreamStatus ? "upstream_http_error" : "transport_error"),
    message: error.message || String(error),
    statusCode: error.statusCode || null,
    upstreamStatus,
    details: error.details || null
  };
}

function novaFailureResult(body, attempts, timeoutMs = NOVA_TIMEOUT_MS) {
  const vcpFailure = attempts.find((attempt) => attempt.backend === "vcp");
  const bridgeFailure = attempts.find((attempt) => attempt.backend === "bridge");
  const agentFailure = attempts.find((attempt) => attempt.backend === "agent-assistant");
  const failed = [
    vcpFailure ? "6005 VCP 模型接口" : "",
    bridgeFailure ? "3100 bridge" : "",
    agentFailure ? "AgentAssistant /v1/human/tool" : ""
  ].filter(Boolean);
  const authFailed = attempts.some((attempt) => attempt.kind === "unauthorized");
  const quotaFailed = attempts.some((attempt) => attempt.kind === "quota_unavailable");
  const rateLimited = attempts.some((attempt) => attempt.kind === "rate_limited");
  const timedOut = attempts.some((attempt) => attempt.kind === "timeout");
  const statusHint = failed.length ? `${failed.join("、")}没有返回可用文本。` : "Nova 后端没有返回可用文本。";
  let error = `Nova 当前不可用：${statusHint}阅读和本地笔记仍可继续。`;
  if (authFailed) {
    error = "Nova 当前不可用：VCP 鉴权未通过。请确认 VCP_Key、VCP_API_KEY 或 CO_READING_NOVA_API_KEY。阅读和本地笔记仍可继续。";
  } else if (quotaFailed) {
    error = "Nova 当前不可用：VCP 上游返回额度不足或 quota 不可用。阅读和本地笔记仍可继续。";
  } else if (rateLimited) {
    error = "Nova 当前不可用：VCP 上游正在限流或冷却。稍后可重试，阅读和本地笔记仍可继续。";
  } else if (timedOut) {
    error = `Nova 当前不可用：请求等待 ${Math.round(timeoutMs / 1000)} 秒后仍未返回。阅读和本地笔记仍可继续。`;
  }
  return {
    status: "error",
    model: body.model || NOVA_MODEL,
    timeoutMs,
    fallbackTimeoutMs: NOVA_FALLBACK_TIMEOUT_MS,
    backendAttempts: attempts,
    error
  };
}

function throwIfNovaFailed(nova, message = "Nova 当前不可用。") {
  if (nova?.status !== "error") return;
  const error = new Error(nova.error || message);
  error.statusCode = 502;
  error.details = {
    backendAttempts: Array.isArray(nova.backendAttempts) ? nova.backendAttempts : [],
    timeoutMs: nova.timeoutMs,
    fallbackTimeoutMs: nova.fallbackTimeoutMs
  };
  throw error;
}

function readTextFileIfExists(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8").trim() : "";
  } catch {
    return "";
  }
}

function readNovaSkillGuides() {
  try {
    if (!fs.existsSync(NOVA_SKILL_PROMPTS_DIR)) return { count: 0, content: "" };
    const files = fs.readdirSync(NOVA_SKILL_PROMPTS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(txt|md)$/iu.test(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
    const sections = files
      .map((name) => {
        const content = readTextFileIfExists(path.join(NOVA_SKILL_PROMPTS_DIR, name));
        return content ? `## Nova skill: ${name}\n\n${content}` : "";
      })
      .filter(Boolean);
    return { count: sections.length, content: sections.join("\n\n") };
  } catch {
    return { count: 0, content: "" };
  }
}

function readNovaGuide() {
  return readTextFileIfExists(NOVA_GUIDE_PATH);
}

function readNovaAgentGuide() {
  const baseGuide = readNovaGuide();
  const skillGuides = readNovaSkillGuides();
  return [baseGuide, skillGuides.content].filter(Boolean).join("\n\n");
}

function buildNovaMessages(body, novaGuide, { compact = false } = {}) {
  const context = body.context || {};
  const textBudget = compact ? 2400 : 6000;
  const selectionBudget = compact ? 700 : 1200;
  const tocBudget = compact ? 600 : 1800;
  const candidateBudget = compact ? 1200 : 5000;
  const promptBudget = compact ? 900 : 1800;
  return [
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
        compactText(context.text || "", textBudget),
        "",
        "选区:",
        compactText(context.selection || "", selectionBudget),
        "",
        "目录预览:",
        compactText(JSON.stringify(context.tocPreview || [], null, 2), tocBudget),
        "",
        "Nova 可自主选择的候选段:",
        compactText(JSON.stringify(context.autonomousCandidates || [], null, 2), candidateBudget),
        "",
        "用户问题/笔记:",
        compactText(body.prompt || "", promptBudget),
        "",
        "边界:",
        context.instructionBoundary || "只基于当前传入文本回应。"
      ].join("\n")
    }
  ];
}

function buildNovaAgentPrompt(body, novaGuide) {
  return [
    "你现在处在 CoReadingMCP 阅读器里，本轮只处理下面这一次读书请求。",
    "保留你的 Nova 人格、记忆和工具规则；但不要复述无关论坛、公告、日记或系统噪音。",
    "如果需要工具，优先用 CoReadingMCP 读当前书、当前 chunk、搜索或做 bounded 回溯；如果工具不可用，就只基于下方显式文本回应。",
    "",
    "读书 Nova 补充规则：",
    compactText(novaGuide, 9000),
    "",
    "请求上下文：",
    buildNovaMessages(body, "")[1].content
  ].filter(Boolean).join("\n");
}

async function askNovaViaChatBackend(backend, url, body, messages, apiKey, timeoutMs) {
  const stream = body.stream === undefined ? backend === "vcp" : Boolean(body.stream);
  const requestBody = {
    model: body.model || NOVA_MODEL,
    messages,
    stream,
    maxAttempts: 1,
    metadata: {
      source: "CoReadingMCP",
      interaction: "single-short-reading-ask",
      backend,
      timeoutMs
    }
  };
  if (body.temperature !== undefined) requestBody.temperature = body.temperature;
  const raw = await postJson(
    url,
    requestBody,
    apiKey ? { authorization: `Bearer ${apiKey}` } : {},
    { timeoutMs, label: backend === "vcp" ? "Nova VCP model request" : "Nova 3100 bridge request" }
  );
  return { raw, classified: classifyNovaResponse(backend, raw) };
}

async function askNovaViaAgentAssistant(body, prompt, apiKey, timeoutMs) {
  const context = body.context || {};
  const raw = await postText(
    NOVA_AGENT_URL,
    buildAgentAssistantBody({ prompt, context }),
    apiKey ? { authorization: `Bearer ${apiKey}` } : {},
    { timeoutMs, label: "Nova AgentAssistant request" }
  );
  return { raw, classified: classifyNovaResponse("agent-assistant", raw) };
}

/* ---------- 模拟书友圈（personas 评论生成与缓存） ---------- */

const COMPANION_GENERATING = new Set(); // bookId 在飞锁：同一本书同时只允许一个生成请求。

function companionConfigured() {
  return Boolean(COMPANION_API_URL);
}

function loadCompanionPersonas() {
  try {
    const parsed = JSON.parse(fs.readFileSync(COMPANION_PERSONAS_PATH, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item === "object" && item.id && item.name);
  } catch {
    return [];
  }
}

function companionCachePath(bookId) {
  const safe = String(bookId || "book").replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 120) || "book";
  return path.join(COMPANIONS_DIR, `${safe}.json`);
}

function readCompanionCache(bookId) {
  try {
    const parsed = JSON.parse(fs.readFileSync(companionCachePath(bookId), "utf8"));
    if (parsed && typeof parsed === "object" && parsed.chunks && typeof parsed.chunks === "object") return parsed;
  } catch {
    // 没有缓存或损坏都按空处理。
  }
  return { version: 1, bookId, chunks: {} };
}

function writeCompanionCache(bookId, cache) {
  fs.mkdirSync(COMPANIONS_DIR, { recursive: true });
  const file = companionCachePath(bookId);
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
}

function getCompanionComments(bookId, chunkId) {
  const book = String(bookId || "").trim();
  const chunk = String(chunkId || "").trim();
  if (!book || !chunk) {
    const error = new Error("bookId 和 chunkId 是必需参数。");
    error.statusCode = 400;
    throw error;
  }
  const cached = readCompanionCache(book).chunks[chunk];
  return {
    status: "success",
    configured: companionConfigured(),
    bookId: book,
    chunkId: chunk,
    comments: cached?.comments || [],
  };
}

function pickCompanionPersonas(personas, authorName) {
  const author = personas.find((item) => item.id === "author");
  const pool = personas.filter((item) => item.id !== "author");
  const target = 4 + Math.floor(Math.random() * 3); // 每段抽 4-6 人
  const picked = [];
  if (author) {
    picked.push({ ...author, name: String(authorName || "").trim() || author.name });
  }
  while (picked.length < target && pool.length) {
    const total = pool.reduce((sum, item) => sum + (Number(item.weight) || 1), 0);
    let roll = Math.random() * total;
    let index = 0;
    for (let i = 0; i < pool.length; i += 1) {
      roll -= Number(pool[i].weight) || 1;
      if (roll <= 0) {
        index = i;
        break;
      }
    }
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

function buildCompanionPrompt(personas, { bookTitle, author, chunkTitle, text }) {
  const roster = personas
    .map((item) => `- personaId: ${item.id} | 名字: ${item.name} | 身份: ${item.identity || "书友"} | 口吻: ${item.voice || "自然"}`)
    .join("\n");
  const system = [
    "你在为一本书的某个段落生成“模拟书友评论”，这些评论最终都会向读者明确标注为 AI 演绎，不得冒充真实发言。",
    "规则：",
    "1. 只输出一个 JSON 数组，不要任何解释文字，不要 Markdown 代码块标记。",
    '2. 每个元素形如 {"personaId":"...","quote":"...","text":"..."}。',
    "3. quote 必须是下面正文的逐字连续子串（建议 15-60 字，不要跨段、不要自行改字或加省略号），text 是该人物针对这句话的短评，不超过 120 字。",
    `4. 每个人物最多 1 条，总共 3-${personas.length} 条；对这段没话可说的人物就不要出现。`,
    "5. 评论要贴合人物身份与口吻，但只能基于正文内容，禁止编造正文之外的情节或事实。",
    "可选人物名单：",
    roster,
  ].join("\n");
  const user = [
    `书名：${bookTitle || "未知"}`,
    `作者：${author || "未知"}`,
    `章节：${chunkTitle || ""}`,
    "正文：",
    String(text || "").slice(0, 6000),
  ].join("\n");
  return { system, user };
}

function parseCompanionArray(content) {
  const raw = String(content || "").trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function validateCompanionComments(content, personas, chunkText, { bookId, chunkId }) {
  const parsed = parseCompanionArray(content);
  if (!parsed) return [];
  const byId = new Map(personas.map((item) => [String(item.id), item]));
  const seen = new Set();
  const comments = [];
  for (const item of parsed) {
    const persona = byId.get(String(item?.personaId || ""));
    const quote = String(item?.quote || "").trim();
    const text = String(item?.text || "").trim();
    if (!persona || !quote || !text) continue;
    if (seen.has(persona.id)) continue; // 每人最多 1 条
    if (chunkText.indexOf(quote) < 0) continue; // 服务端逐字子串校验，不合格直接丢弃
    seen.add(persona.id);
    comments.push({
      id: `companion-${chunkId}-${persona.id}-${crypto.randomBytes(3).toString("hex")}`,
      personaId: String(persona.id),
      name: String(persona.name),
      // 数据层强制拼 AI 演绎，持久化后不可去除。
      role: `AI 演绎 · ${persona.identity || "书友"}`,
      quote,
      text: text.slice(0, 120),
      bookId,
      chunkId,
    });
    if (comments.length >= 6) break;
  }
  return comments;
}

async function generateCompanionComments(body) {
  const bookId = String(body?.bookId || "").trim();
  const chunkId = String(body?.chunkId || "").trim();
  if (!bookId || !chunkId) {
    const error = new Error("bookId 和 chunkId 是必需参数。");
    error.statusCode = 400;
    throw error;
  }
  if (!companionConfigured()) {
    return { status: "not_configured", configured: false, bookId, chunkId, comments: [] };
  }
  const existing = readCompanionCache(bookId).chunks[chunkId];
  if (existing) {
    return { status: "success", cached: true, bookId, chunkId, comments: existing.comments || [] };
  }
  if (COMPANION_GENERATING.has(bookId)) {
    return { status: "generating", bookId, chunkId, comments: [] };
  }
  COMPANION_GENERATING.add(bookId);
  try {
    const read = await runCommand({ command: "read_chunk", bookId, chunkId });
    const chunkText = String(read?.data?.text || read?.data?.chunk?.text || "");
    if (!chunkText.trim()) {
      const error = new Error(`无法读取 ${bookId}/${chunkId} 的原文。`);
      error.statusCode = 502;
      throw error;
    }
    const allPersonas = loadCompanionPersonas();
    if (!allPersonas.length) {
      const error = new Error(`personas 配置为空或不可读：${COMPANION_PERSONAS_PATH}`);
      error.statusCode = 502;
      throw error;
    }
    const personas = pickCompanionPersonas(allPersonas, read?.data?.author);
    const prompt = buildCompanionPrompt(personas, {
      bookTitle: read?.data?.title,
      author: read?.data?.author,
      chunkTitle: read?.data?.chunk?.title || read?.data?.chunk?.sectionTitle || chunkId,
      text: chunkText,
    });
    // 单次请求、不重试、不级联；超时由 postJson 销毁请求。
    const response = await postJson(
      COMPANION_API_URL,
      {
        model: COMPANION_MODEL,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        temperature: 0.9,
        stream: false,
      },
      COMPANION_API_KEY ? { authorization: `Bearer ${COMPANION_API_KEY}` } : {},
      { timeoutMs: COMPANION_TIMEOUT_MS, label: "companion request" }
    );
    const content = response?.choices?.[0]?.message?.content || "";
    const comments = validateCompanionComments(content, personas, chunkText, { bookId, chunkId });
    if (!comments.length) {
      const error = new Error("书友评论生成结果没有任何条目通过校验（JSON 解析失败或 quote 不在原文里），本次不缓存。");
      error.statusCode = 502;
      throw error;
    }
    // 写前重读缓存，避免覆盖同书其它 chunk 刚写入的数据。
    const cache = readCompanionCache(bookId);
    cache.bookId = bookId;
    cache.chunks[chunkId] = {
      generatedAt: new Date().toISOString(),
      model: COMPANION_MODEL,
      comments,
    };
    writeCompanionCache(bookId, cache);
    return { status: "success", cached: false, bookId, chunkId, comments };
  } finally {
    COMPANION_GENERATING.delete(bookId);
  }
}


async function askNova(body) {
  const apiKey = novaApiKey();
  const timeoutMs = novaRequestTimeoutMs(body);
  const novaGuide = readNovaGuide();
  const messages = buildNovaMessages(body, novaGuide, { compact: true });
  const agentPrompt = buildNovaAgentPrompt(body, readNovaAgentGuide());
  const attempts = [];

  for (const [index, backend] of NOVA_BACKENDS.entries()) {
    const attemptTimeoutMs = novaAttemptTimeoutMs(backend, index, timeoutMs);
    try {
      const result = backend === "agent-assistant"
        ? await askNovaViaAgentAssistant(body, agentPrompt, apiKey, attemptTimeoutMs)
        : await askNovaViaChatBackend(
          backend,
          backend === "vcp" ? NOVA_VCP_URL : NOVA_BRIDGE_URL,
          body,
          messages,
          apiKey,
          attemptTimeoutMs
        );
      const attempt = {
        backend,
        kind: result.classified.kind,
        ok: result.classified.ok,
        timeoutMs: attemptTimeoutMs,
        status: result.raw?.status || null,
        id: result.raw?.id || result.raw?.job_id || result.raw?.task_id || result.raw?.run_id || null
      };
      if (result.classified.ok) {
        attempts.push(attempt);
        return {
          status: "success",
          backend,
          model: body.model || NOVA_MODEL,
          timeoutMs,
          fallbackTimeoutMs: NOVA_FALLBACK_TIMEOUT_MS,
          content: result.classified.content,
          backendAttempts: attempts,
          raw: result.raw
        };
      }
      attempts.push({ ...attempt, ...result.classified });
    } catch (error) {
      attempts.push({ ...novaAttemptError(backend, error), timeoutMs: attemptTimeoutMs });
    }
  }

  return novaFailureResult(body, attempts, timeoutMs);
}

const BACKGROUND_RUNNERS = new Map();
const RUNNER_JOBS_PATH = path.join(DATA_DIR, "runner_jobs.json");
const NOVA_AGENT_RUNS_PATH = path.join(DATA_DIR, "nova_agent_runs.json");
const NOVA_AGENT_HISTORY_LIMIT = Math.max(20, Math.min(300, Number(process.env.CO_READING_NOVA_AGENT_HISTORY_LIMIT || 80)));
const NOVA_AGENT_ACTIVE_RUNS = new Map();
const VCP_PLUGIN_DIR = path.join(PROJECT_ROOT, "Plugin");
const VCP_AGENT_PLUGIN_TOOLS = new Map();

const AGENT_SCHEMA = {
  anyObject: { type: "object", additionalProperties: true },
  bookQuery: {
    type: "object",
    required: ["bookId", "query"],
    properties: {
      bookId: { type: "string" },
      query: { type: "string" },
      limit: { type: "number" }
    },
    additionalProperties: true
  }
};

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

function normalizeAgentToolName(name) {
  return String(name || "").trim().toLowerCase().replace(/[.\-\s]+/g, "_");
}

function compactStructuredValue(value, maxChars = 30000) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  try {
    const json = JSON.stringify(value);
    if (json.length <= maxChars) return JSON.parse(json);
    return {
      truncated: true,
      originalChars: json.length,
      preview: compactText(json, maxChars)
    };
  } catch {
    return compactText(String(value), maxChars);
  }
}

function safeToolDetails(result = {}) {
  const data = result.data ?? result.result ?? null;
  const details = {
    command: result.command || "",
    data: compactStructuredValue(data, 18000),
    stderr: result.stderr || null
  };
  if (Array.isArray(data)) details.count = data.length;
  if (data && typeof data === "object" && Array.isArray(data.books)) details.count = data.books.length;
  if (data && typeof data === "object" && Array.isArray(data.previews)) details.previewCount = data.previews.length;
  return details;
}

function piToolText(result = {}) {
  if (typeof result.raw === "string" && result.raw.trim()) return compactText(result.raw, 12000);
  if (typeof result.content === "string" && result.content.trim()) return compactText(result.content, 12000);
  return compactText(JSON.stringify(result.data ?? result.result ?? result, null, 2), 12000);
}

function buildPiToolResult(definition, result) {
  return {
    tool: definition.name,
    label: definition.label,
    category: definition.category,
    source: definition.source,
    readOnly: definition.readOnly === true,
    requiresApproval: definition.requiresApproval === true,
    content: [{ type: "text", text: piToolText(result) }],
    details: safeToolDetails(result)
  };
}

function agentToolDefinition(definition) {
  return {
    name: definition.name,
    label: definition.label,
    description: definition.description,
    category: definition.category,
    source: definition.source,
    command: definition.command || definition.vcpCommand || definition.sidecarAction || "",
    aliases: definition.aliases || [],
    readOnly: definition.readOnly === true,
    mutates: definition.mutates === true,
    requiresApproval: definition.requiresApproval === true,
    parameters: definition.parameters || AGENT_SCHEMA.anyObject
  };
}

const AGENT_TOOL_DEFINITIONS = [
  {
    name: "reading_list_books",
    label: "共读书库",
    category: "reading",
    source: "coreading",
    command: "list_books",
    aliases: ["list_books", "books"],
    readOnly: true,
    description: "列出已经导入 CoReadingMCP 的书籍。",
    parameters: AGENT_SCHEMA.anyObject
  },
  {
    name: "reading_list_chunks",
    label: "章节/段落列表",
    category: "reading",
    source: "coreading",
    command: "list_chunks",
    aliases: ["list_chunks", "chunks"],
    readOnly: true,
    description: "列出一本书的 chunk/章节索引。",
    parameters: {
      type: "object",
      required: ["bookId"],
      properties: { bookId: { type: "string" } },
      additionalProperties: true
    }
  },
  {
    name: "reading_read_chunk",
    label: "读取段落",
    category: "reading",
    source: "coreading",
    command: "read_chunk",
    aliases: ["read_chunk", "read"],
    readOnly: true,
    description: "读取一本书中的单个 chunk 原文。",
    parameters: {
      type: "object",
      required: ["bookId", "chunkId"],
      properties: {
        bookId: { type: "string" },
        chunkId: { type: "string" }
      },
      additionalProperties: true
    }
  },
  {
    name: "reading_search",
    label: "书内搜索",
    category: "search",
    source: "coreading",
    command: "search",
    aliases: ["search", "reading.search", "reading_search_chunks"],
    readOnly: true,
    description: "在当前导入书籍内搜索关键词，返回命中 chunk 和片段。",
    parameters: AGENT_SCHEMA.bookQuery
  },
  {
    name: "interest_backtrack",
    label: "兴趣点回溯",
    category: "search",
    source: "coreading",
    command: "interest_backtrack",
    aliases: ["backtrack_interest", "trace_interest"],
    readOnly: true,
    description: "围绕关键词或锚点 chunk 做 bounded evidence 回溯。",
    parameters: {
      type: "object",
      required: ["bookId"],
      properties: {
        bookId: { type: "string" },
        query: { type: "string" },
        anchorChunkId: { type: "string" },
        before: { type: "number" },
        after: { type: "number" },
        maxRanges: { type: "number" },
        mergeGap: { type: "number" },
        includeEvidence: { type: "boolean" },
        createPlan: { type: "boolean" }
      },
      additionalProperties: true
    }
  },
  {
    name: "local_library_list",
    label: "本地书库列表",
    category: "file",
    source: "sidecar",
    sidecarAction: "local_library_list",
    aliases: ["library_list", "file_list_books", "local_books"],
    readOnly: true,
    description: "列出 sidecar 授权书库目录内可导入的 EPUB/TXT/Markdown。",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" }
      },
      additionalProperties: false
    }
  },
  {
    name: "local_book_import",
    label: "导入本地书",
    category: "file",
    source: "sidecar",
    sidecarAction: "local_book_import",
    aliases: ["import_local_book", "file_import_book"],
    mutates: true,
    description: "从授权书库目录导入一本书到 CoReadingMCP 数据目录。",
    parameters: {
      type: "object",
      required: ["relativePath"],
      properties: {
        relativePath: { type: "string" },
        bookId: { type: "string" },
        title: { type: "string" },
        author: { type: "string" },
        overwrite: { type: "boolean" }
      },
      additionalProperties: true
    }
  },
  {
    name: "obsidian_note_read",
    label: "读取 Obsidian 笔记",
    category: "file",
    source: "coreading",
    command: "obsidian_note_read",
    aliases: ["read_obsidian_note", "file_read_obsidian"],
    readOnly: true,
    description: "在配置的 vault 中读取与沉淀预览相关的 Obsidian 笔记。",
    parameters: AGENT_SCHEMA.anyObject
  },
  {
    name: "obsidian_note_diff",
    label: "比较 Obsidian 笔记",
    category: "file",
    source: "coreading",
    command: "obsidian_note_diff",
    aliases: ["diff_obsidian_note", "file_diff_obsidian"],
    readOnly: true,
    description: "比较现有 Obsidian 笔记与沉淀预览，不写入文件。",
    parameters: AGENT_SCHEMA.anyObject
  },
  {
    name: "vcp_any_search",
    label: "VCP AnySearch",
    category: "search",
    source: "vcp-plugin",
    plugin: "AnySearch",
    aliases: ["anysearch", "web_search", "search_web"],
    readOnly: true,
    description: "通过 VCP AnySearch 插件做网页/垂直搜索或正文提取。",
    parameters: AGENT_SCHEMA.anyObject
  },
  {
    name: "vcp_jina_reader",
    label: "VCP JinaReader",
    category: "search",
    source: "vcp-plugin",
    plugin: "JinaReader",
    aliases: ["jina_reader", "web_read", "read_webpage"],
    readOnly: true,
    description: "通过 VCP JinaReader 插件读取网页 URL 并转成 Markdown。",
    parameters: AGENT_SCHEMA.anyObject
  },
  {
    name: "vcp_file_allowed_dirs",
    label: "VCP 文件授权目录",
    category: "file",
    source: "vcp-plugin",
    plugin: "FileOperator",
    vcpCommand: "ListAllowedDirectories",
    aliases: ["file_allowed_dirs", "list_allowed_directories"],
    readOnly: true,
    description: "通过 VCP FileOperator 查看授权根目录。",
    parameters: AGENT_SCHEMA.anyObject
  },
  {
    name: "vcp_file_read",
    label: "VCP 文件读取",
    category: "file",
    source: "vcp-plugin",
    plugin: "FileOperator",
    vcpCommand: "ReadFile",
    aliases: ["file_read", "read_file"],
    readOnly: true,
    description: "通过 VCP FileOperator 读取单个文件；只暴露只读能力。",
    parameters: {
      type: "object",
      required: ["filePath"],
      properties: {
        filePath: { type: "string" },
        encoding: { type: "string" }
      },
      additionalProperties: false
    }
  },
  {
    name: "vcp_file_search",
    label: "VCP 文件搜索",
    category: "file",
    source: "vcp-plugin",
    plugin: "FileOperator",
    vcpCommand: "SearchFiles",
    aliases: ["file_search", "search_files"],
    readOnly: true,
    description: "通过 VCP FileOperator 搜索文件名；不执行写入/移动/删除。",
    parameters: AGENT_SCHEMA.anyObject
  },
  {
    name: "sink_preview_create",
    label: "创建沉淀预览",
    category: "diary",
    source: "coreading",
    command: "sink_preview_create",
    aliases: ["diary_preview_create", "daily_note_preview", "memory_preview"],
    mutates: true,
    requiresApproval: true,
    description: "从 review 创建 Obsidian/OBS/DailyNote/VCPMemory 沉淀预览；没有 reviewId 时会先用 bookId 和明确 chunk 范围自动创建 review。",
    parameters: {
      type: "object",
      required: ["bookId"],
      properties: {
        reviewId: { type: "string" },
        bookId: { type: "string" },
        chunkId: { type: "string" },
        startChunkId: { type: "string" },
        endChunkId: { type: "string" },
        chunkIds: { type: "array", items: { type: "string" } },
        summary: { type: "string" },
        content: { type: "string" },
        target: { type: "string" },
        targets: { type: "array", items: { type: "string" } },
        requireApproval: { type: "boolean" }
      },
      additionalProperties: true
    }
  },
  {
    name: "backtrack_sink_preview_create",
    label: "回溯证据沉淀预览",
    category: "diary",
    source: "coreading",
    command: "sink_preview_create_from_backtrack",
    aliases: ["sink_preview_create_from_backtrack", "diary_backtrack_preview"],
    mutates: true,
    requiresApproval: true,
    description: "把兴趣回溯 evidence 包装为待批准沉淀预览。",
    parameters: AGENT_SCHEMA.anyObject
  },
  {
    name: "sink_preview_approve",
    label: "批准沉淀预览",
    category: "diary",
    source: "coreading",
    command: "sink_preview_update",
    aliases: ["approve_sink_preview", "diary_preview_approve"],
    mutates: true,
    requiresApproval: true,
    description: "把指定沉淀预览标记为 approved；执行写入仍需 sink_execute。",
    mapArgs: (args) => ({ ...args, status: "approved", updatedBy: args.updatedBy || "Nova Agent" }),
    parameters: {
      type: "object",
      required: ["previewId"],
      properties: {
        previewId: { type: "string" },
        note: { type: "string" }
      },
      additionalProperties: true
    }
  },
  {
    name: "sink_execute",
    label: "执行已批准沉淀",
    category: "diary",
    source: "coreading",
    command: "sink_execute",
    aliases: ["diary_execute", "daily_note_write_approved", "memory_execute"],
    mutates: true,
    requiresApproval: true,
    description: "执行已经 approved 的沉淀预览，写入 Obsidian、OBS、DailyNote 或 VCPMemory。",
    parameters: AGENT_SCHEMA.anyObject
  }
];

for (const definition of AGENT_TOOL_DEFINITIONS) {
  VCP_AGENT_PLUGIN_TOOLS.set(normalizeAgentToolName(definition.name), definition);
  for (const alias of definition.aliases || []) {
    VCP_AGENT_PLUGIN_TOOLS.set(normalizeAgentToolName(alias), definition);
  }
}

function listPiAgentTools(filters = {}) {
  const seen = new Set();
  return AGENT_TOOL_DEFINITIONS
    .filter((tool) => !filters.category || tool.category === filters.category)
    .filter((tool) => {
      if (seen.has(tool.name)) return false;
      seen.add(tool.name);
      return true;
    })
    .map(agentToolDefinition);
}

const NOVA_AGENT_SKILL_DEFINITIONS = [
  {
    id: "autonomous-reading",
    label: "Nova 自主预读",
    category: "reading",
    summary: "Nova 自动读取当前段附近候选，先留下短旁注；用户可以继续看正文，不需要先提问。",
    howToUse: "打开一本书后直接阅读；自动预读开启时 Nova 会在当前段先读，手动可点“Nova 预读”。",
    action: "pre-read",
    toolNames: ["reading_list_chunks", "reading_read_chunk"]
  },
  {
    id: "range-review",
    label: "章节/段落评注",
    category: "reading",
    summary: "把当前段、选区或一小段范围整理成可回看的 review，作为沉淀前的判断层。",
    howToUse: "选中原文或定位当前段，点“写评注”；补一句判断后可生成沉淀预览。",
    action: "review",
    toolNames: ["review_create", "reading_read_chunk"]
  },
  {
    id: "interest-backtrack",
    label: "兴趣点回溯",
    category: "search",
    summary: "围绕一个词、问题或当前段，回溯有限范围内的相关 evidence，不塞整本书。",
    howToUse: "选中词句或在搜索框输入线索，点“追线索”；结果可以继续做成沉淀预览。",
    action: "backtrack",
    toolNames: ["interest_backtrack", "reading_search", "vcp_any_search", "vcp_jina_reader"]
  },
  {
    id: "reading-notes",
    label: "边注与私有笔记",
    category: "reading",
    summary: "用户可以写自己的笔记，Nova 可以留下短边注；两者都锚定到当前段或选区。",
    howToUse: "选中文本后点“记笔记”或“写边注”；私有笔记可再提交给 Nova 回应。",
    action: "notes",
    toolNames: ["vcp_file_read", "vcp_file_search"]
  },
  {
    id: "safe-sink",
    label: "Obsidian/OBS/日记沉淀",
    category: "diary",
    summary: "把评注、回溯或本次阅读会话做成待批准 preview，再执行写入 Obsidian、OBS 文本源或日记/记忆。",
    howToUse: "点“沉淀本段”或“沉淀回溯”；先看预览，批准后才允许写入目标位置。OBS 需要配置输出目录。",
    action: "sink",
    toolNames: ["sink_preview_create", "backtrack_sink_preview_create", "sink_preview_approve", "sink_execute"]
  }
];

function listNovaAgentSkills() {
  const tools = new Map(listPiAgentTools().map((tool) => [tool.name, tool]));
  return NOVA_AGENT_SKILL_DEFINITIONS.map((skill) => ({
    ...skill,
    tools: (skill.toolNames || []).map((name) => tools.get(name)).filter(Boolean)
  }));
}

function findPiAgentTool(name) {
  const tool = VCP_AGENT_PLUGIN_TOOLS.get(normalizeAgentToolName(name));
  if (!tool) {
    const error = new Error(`Unsupported Nova/Pi agent tool: ${name || "<empty>"}`);
    error.statusCode = 400;
    error.details = { availableTools: listPiAgentTools().map((item) => item.name) };
    throw error;
  }
  return tool;
}

function parseEnvFile(filePath) {
  const env = {};
  const content = readTextFileIfExists(filePath);
  if (!content) return env;
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

function applySidecarEnvDefaults() {
  const fileEnv = {
    ...parseEnvFile(path.join(PROJECT_ROOT, "config.env")),
    ...parseEnvFile(path.join(PLUGIN_DIR, "config.env"))
  };
  for (const [key, value] of Object.entries(fileEnv)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function vcpPluginEnv(pluginName) {
  const pluginDir = path.join(VCP_PLUGIN_DIR, pluginName);
  return {
    ...parseEnvFile(path.join(PROJECT_ROOT, "config.env")),
    ...parseEnvFile(path.join(pluginDir, "config.env")),
    ...process.env
  };
}

function parseVcpPluginStdout(pluginName, stdout) {
  const text = String(stdout || "").trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const lines = text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        return JSON.parse(lines[index]);
      } catch {
        // Continue scanning because some VCP plugins may emit debug text before JSON.
      }
    }
  }
  throw new Error(`${pluginName} returned non-JSON stdout: ${text.slice(0, 1000)}`);
}

function runVcpPlugin(pluginName, payload, { timeoutMs = 60000 } = {}) {
  const scripts = {
    AnySearch: path.join(VCP_PLUGIN_DIR, "AnySearch", "AnySearch.js"),
    JinaReader: path.join(VCP_PLUGIN_DIR, "JinaReader", "JinaReader.js"),
    FileOperator: path.join(VCP_PLUGIN_DIR, "FileOperator", "FileOperator.js")
  };
  const scriptPath = scripts[pluginName];
  if (!scriptPath || !fs.existsSync(scriptPath)) {
    const error = new Error(`VCP plugin is unavailable: ${pluginName}`);
    error.statusCode = 404;
    throw error;
  }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: path.dirname(scriptPath),
      env: vcpPluginEnv(pluginName),
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => {
      const error = new Error(`${pluginName} timed out after ${Math.round(timeoutMs / 1000)}s`);
      error.statusCode = 504;
      child.kill();
      finish(reject, error);
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => finish(reject, error));
    child.on("close", (code) => {
      let outer = null;
      try {
        outer = parseVcpPluginStdout(pluginName, stdout);
      } catch (error) {
        finish(reject, error);
        return;
      }
      if (code !== 0 || outer.status === "error") {
        const error = new Error(outer.error || outer.message || `${pluginName} failed with exit code ${code}`);
        error.statusCode = 502;
        error.details = { outer, stderr };
        finish(reject, error);
        return;
      }
      finish(resolve, {
        status: "success",
        command: pluginName,
        data: outer.result ?? outer.data ?? outer,
        raw: outer,
        stderr: stderr.trim() || null
      });
    });
    child.stdin.end(`${JSON.stringify(payload || {})}\n`);
  });
}

async function runSidecarAgentTool(definition, args) {
  if (definition.sidecarAction === "local_library_list") {
    const result = await listLocalLibraryBooks();
    const query = String(args.query || "").trim().toLowerCase();
    const limit = normalizeListLimit(args.limit, 80, 1, 200);
    const books = result.books
      .filter((book) => !query || `${book.name} ${book.relativePath} ${book.format}`.toLowerCase().includes(query))
      .slice(0, limit);
    return { ...result, command: definition.name, data: { ...result, books, count: books.length } };
  }
  if (definition.sidecarAction === "local_book_import") {
    return importLocalLibraryBook(args);
  }
  const error = new Error(`Unsupported sidecar agent tool: ${definition.sidecarAction}`);
  error.statusCode = 400;
  throw error;
}

function normalizeAgentTargetList(args = {}) {
  const source = Array.isArray(args.targets) ? args.targets : (args.targets || args.target || "");
  return (Array.isArray(source) ? source : String(source).split(/[,\s]+/u))
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function hasExplicitAgentReviewScope(args = {}) {
  const chunkIds = Array.isArray(args.chunkIds)
    ? args.chunkIds
    : String(args.chunkIds || "").split(/[,\s]+/u).filter(Boolean);
  return Boolean(
    args.chunkId
    || args.startChunkId
    || args.endChunkId
    || chunkIds.length
  );
}

function normalizeAgentSinkArgs(args = {}) {
  const payload = { ...args };
  const targets = normalizeAgentTargetList(payload);
  if (targets.length) payload.targets = targets;
  if (payload.chunkId && !payload.startChunkId && !payload.endChunkId && !payload.chunkIds) {
    payload.startChunkId = payload.chunkId;
    payload.endChunkId = payload.chunkId;
  }
  return payload;
}

async function prepareAgentSinkPreviewPayload(payload) {
  const next = normalizeAgentSinkArgs(payload);
  if (next.reviewId) return next;
  if (!next.bookId || !hasExplicitAgentReviewScope(next)) {
    const error = new Error("sink_preview_create 需要 reviewId，或 bookId 加明确 chunk 范围。");
    error.statusCode = 400;
    throw error;
  }
  const summary = compactText(next.summary || next.content || next.note || next.text || "", 5000);
  if (!summary) {
    const error = new Error("自动创建沉淀预览需要 summary/content/note/text 之一。");
    error.statusCode = 400;
    throw error;
  }
  const reviewResult = await runWrapper({
    command: "review_create",
    bookId: next.bookId,
    title: next.title || `Nova 工具沉淀 ${next.chunkId || next.startChunkId || "range"}`,
    summary,
    stance: next.stance || "",
    startChunkId: next.startChunkId,
    endChunkId: next.endChunkId,
    chunkIds: next.chunkIds,
    observations: next.observations,
    questions: next.questions,
    quotes: next.quotes,
    nextActions: next.nextActions,
    tags: next.tags || ["co-reading", "nova-agent"],
    createdBy: next.createdBy || "Nova Agent"
  });
  const reviewId = reviewResult.data?.review?.reviewId || reviewResult.data?.fullReview?.reviewId;
  if (!reviewId) throw new Error("自动创建 review 后没有返回 reviewId。");
  return { ...next, reviewId, __agentCreatedReview: reviewResult.data?.review || null };
}

async function executePiAgentTool(toolName, args = {}, run = null) {
  const definition = findPiAgentTool(toolName);
  let payload = definition.mapArgs ? definition.mapArgs({ ...args }) : { ...args };
  if (definition.name === "sink_preview_create") payload = await prepareAgentSinkPreviewPayload(payload);
  if (definition.vcpCommand) payload.command = definition.vcpCommand;
  const startedAt = new Date().toISOString();
  if (run) {
    run.events.push({
      type: "tool_start",
      tool: definition.name,
      category: definition.category,
      source: definition.source,
      at: startedAt
    });
  }
  try {
    let result = null;
    if (definition.source === "coreading") {
      result = await runWrapper({ ...payload, command: definition.command });
    } else if (definition.source === "sidecar") {
      result = await runSidecarAgentTool(definition, payload);
    } else if (definition.source === "vcp-plugin") {
      result = await runVcpPlugin(definition.plugin, payload, { timeoutMs: definition.plugin === "AnySearch" ? 45000 : 60000 });
    } else {
      throw new Error(`Unsupported agent tool source: ${definition.source}`);
    }
    const toolResult = buildPiToolResult(definition, result);
    if (run) {
      run.toolResults.push(publicToolResult(definition.name, "success", {
        category: definition.category,
        source: definition.source,
        command: definition.command || definition.vcpCommand || definition.sidecarAction || "",
        readOnly: definition.readOnly === true,
        requiresApproval: definition.requiresApproval === true,
        details: compactStructuredValue(toolResult.details, 6000)
      }));
      run.events.push({ type: "tool_end", tool: definition.name, status: "success", at: new Date().toISOString() });
    }
    return { definition: agentToolDefinition(definition), result, toolResult };
  } catch (error) {
    if (run) {
      run.toolResults.push(publicToolResult(definition.name, "error", {
        category: definition.category,
        source: definition.source,
        message: error.message || String(error)
      }));
      run.events.push({ type: "tool_end", tool: definition.name, status: "error", at: new Date().toISOString() });
    }
    throw error;
  }
}

function normalizeAgentAction(action) {
  const raw = String(action || "pre_read").trim().toLowerCase().replace(/[-\s]+/g, "_");
  const aliases = {
    autonomous_reading: "pre_read",
    nova_pre_read: "pre_read",
    preread: "pre_read",
    pre_read_current: "pre_read",
    backtrack_interest: "interest_backtrack",
    trace_interest: "interest_backtrack",
    tool: "tool_call",
    execute_tool: "tool_call",
    vcp_tool: "tool_call",
    vcp_tool_call: "tool_call"
  };
  return aliases[raw] || raw;
}

function novaAgentActiveKey(action, payload) {
  const normalized = normalizeAgentAction(action);
  const variableParts = [];
  if (normalized === "interest_backtrack") {
    variableParts.push(payload.query || "", payload.anchorChunkId || "", payload.before || "", payload.after || "", payload.maxRanges || "");
  }
  if (normalized === "tool_call") {
    variableParts.push(payload.tool || payload.toolName || payload.name || payload.command || "");
    variableParts.push(JSON.stringify(payload.arguments || payload.args || payload.input || payload.payload || {}));
  }
  const digest = variableParts.length
    ? crypto.createHash("sha1").update(variableParts.join("|")).digest("hex").slice(0, 12)
    : "";
  return [
    normalized,
    String(payload.bookId || "").trim(),
    String(payload.chunkId || payload.anchorChunkId || "").trim(),
    digest
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
    scope: String(run.scope || result.scope || ""),
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
      backend: String(result.backend || ""),
      model: String(result.model || ""),
      backendAttempts: Array.isArray(result.backendAttempts) ? result.backendAttempts.slice(0, 8) : [],
      contextMode: String(result.contextMode || run.contextMode || "agent"),
      scope: String(result.scope || run.scope || ""),
      prompt: compactText(result.prompt || run.prompt || "", 1200),
      backtrack: compactStructuredValue(result.backtrack, 26000),
      tool: compactStructuredValue(result.tool, 8000),
      toolResult: compactStructuredValue(result.toolResult, 18000),
      sinkPreview: compactStructuredValue(result.sinkPreview, 16000),
      review: compactStructuredValue(result.review, 12000)
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
    .filter((run) => !filters.runId || run.id === String(filters.runId))
    .filter((run) => !filters.bookId || run.bookId === String(filters.bookId))
    .filter((run) => !filters.chunkId || run.chunkId === String(filters.chunkId))
    .filter((run) => !filters.action || run.action === normalizeAgentAction(filters.action))
    .sort((a, b) => String(b.completedAt || b.startedAt).localeCompare(String(a.completedAt || a.startedAt)))
    .slice(0, limit);
}

function pendingNovaAgentRun(action, payload = {}) {
  const normalized = normalizeAgentAction(action);
  const bookId = String(payload.bookId || "").trim();
  const chunkId = String(payload.chunkId || payload.anchorChunkId || "").trim();
  return listNovaAgentRuns({ action: normalized, bookId, chunkId, limit: NOVA_AGENT_HISTORY_LIMIT })
    .find((run) => run.status === "running" || run.status === "queued") || null;
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

const AGENT_FRONT_MATTER_CHUNK_RE = /^(cover|封面|封底|扉页|版权|题献|目录|插图目录|更新记录)$/i;

function agentChunkReadableSize(chunk) {
  return Math.max(Number(chunk?.charCount || 0), Number(chunk?.wordCount || 0));
}

function isAgentReadableChunk(chunk) {
  const title = chunkTitleOf(chunk).replace(/\s+Part\s+\d+\/\d+$/i, "").trim();
  return Boolean(chunkIdOf(chunk)) && !AGENT_FRONT_MATTER_CHUNK_RE.test(title) && agentChunkReadableSize(chunk) >= 600;
}

function chooseAgentAnchorChunkId(chunks, requestedChunkId = "") {
  if (requestedChunkId && chunks.some((chunk) => chunkIdOf(chunk) === requestedChunkId)) return requestedChunkId;
  const unread = chunks.find((chunk) => !chunk.read && isAgentReadableChunk(chunk));
  const readable = unread || chunks.find(isAgentReadableChunk) || chunks.find((chunk) => chunkIdOf(chunk));
  return chunkIdOf(readable);
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
  const anchorId = chooseAgentAnchorChunkId(chunks, anchorChunkId);
  const index = chunks.findIndex((chunk) => chunkIdOf(chunk) === anchorId);
  if (index < 0) return anchorId ? [anchorId] : [];
  const offsets = [0, 1, -1, 2, 3, -2, 4, -3];
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

function chooseMentionedCandidateId(content, candidates, fallbackChunkId) {
  const text = String(content || "");
  let best = { index: Infinity, id: "" };
  for (const candidate of candidates || []) {
    const id = String(candidate?.chunkId || "");
    const match = id ? new RegExp(`(^|[^\\w-])${escapeRegExp(id)}([^\\w-]|$)`, "iu").exec(text) : null;
    if (match && match.index < best.index) best = { index: match.index, id };
  }
  return best.id || fallbackChunkId;
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
  const requestedChunkId = String(payload.chunkId || "").trim();
  if (!bookId) {
    const error = new Error("bookId 是必需参数。");
    error.statusCode = 400;
    throw error;
  }
  const startedAtMs = Date.now();
  const run = normalizeNovaAgentRun({
    action: "pre_read",
    status: "running",
    bookId,
    bookTitle: payload.bookTitle || "",
    chunkId: requestedChunkId,
    chunkTitle: payload.chunkTitle || "",
    contextMode: "autonomous-reading",
    scope: requestedChunkId ? "chunk" : "book",
    prompt: buildNovaPreReadAgentPrompt(payload),
    selection: payload.selection || payload.context?.selection || null,
    startedAt: new Date(startedAtMs).toISOString(),
    result: { contextMode: "autonomous-reading" }
  });
  upsertNovaAgentRun(run);

  try {
    const chunksResult = await agentRunWrapper("list_chunks", { bookId }, run);
    const chunks = Array.isArray(chunksResult.data) ? chunksResult.data : chunksResult.data?.chunks || [];
    const chunkId = chooseAgentAnchorChunkId(chunks, requestedChunkId);
    if (!chunkId) {
      const error = new Error("当前书没有可供 Nova 预读的段落。");
      error.statusCode = 400;
      throw error;
    }
    const currentMeta = chunks.find((chunk) => chunkIdOf(chunk) === chunkId) || {};
    run.chunkId = chunkId;
    run.chunkTitle = chunkTitleOf(currentMeta, payload.chunkTitle || chunkId);
    upsertNovaAgentRun(run);
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
        instructionBoundary: requestedChunkId
          ? "Nova 可以在 autonomousCandidates 中自行选择先读哪里；只能评论传入候选段和当前段，不要假装读完整本书。"
          : "这是书级自主巡读。Nova 可以从 autonomousCandidates 中自行选择一个起点先看；只能评论传入候选段，不要假装读完整本书。"
      }
    });
    throwIfNovaFailed(nova, "Nova 预读失败。");
    const visibleContent = cleanNovaVisibleContent(nova.content || "");
    if (!visibleContent) {
      const error = new Error("Nova 预读没有返回可显示正文。");
      error.statusCode = 502;
      error.details = { backendAttempts: nova.backendAttempts || [], raw: nova.raw || null };
      throw error;
    }
    const chosenChunkId = chooseMentionedCandidateId(visibleContent, candidates, chunkId);
    const chosenMeta = chunks.find((chunk) => chunkIdOf(chunk) === chosenChunkId) || currentMeta;
    run.status = "success";
    run.completedAt = new Date().toISOString();
    run.durationMs = Date.now() - startedAtMs;
    run.bookTitle = payload.bookTitle || run.bookTitle || "";
    run.chunkId = chosenChunkId;
    run.chunkTitle = chunkTitleOf(chosenMeta, payload.chunkTitle || chosenChunkId);
    run.result = {
      content: visibleContent,
      note: visibleContent,
      chosenChunkId,
      candidates,
      backend: nova.backend || "",
      model: nova.model || "",
      backendAttempts: Array.isArray(nova.backendAttempts) ? nova.backendAttempts : [],
      contextMode: "autonomous-reading",
      scope: requestedChunkId ? "chunk" : "book",
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

function backtrackSummary(backtrack = {}) {
  const title = backtrack.evidence?.title || backtrack.query || backtrack.anchorChunkId || "兴趣点回溯";
  const rangeCount = Array.isArray(backtrack.ranges) ? backtrack.ranges.length : 0;
  const chunkCount = Array.isArray(backtrack.chunkIds) ? backtrack.chunkIds.length : 0;
  const anchorCount = Array.isArray(backtrack.anchors) ? backtrack.anchors.length : 0;
  return [
    `Nova Agent 已完成回溯: ${title}`,
    `锚点 ${anchorCount} 个，范围 ${rangeCount} 组，涉及 ${chunkCount} 个 chunk。`,
    backtrack.evidenceMarkdown ? compactText(backtrack.evidenceMarkdown, 5000) : ""
  ].filter(Boolean).join("\n\n");
}

async function runNovaInterestBacktrackAgent(payload) {
  const bookId = String(payload.bookId || "").trim();
  const anchorChunkId = String(payload.anchorChunkId || payload.chunkId || "").trim();
  const query = String(payload.query || payload.prompt || "").trim();
  if (!bookId || (!anchorChunkId && !query)) {
    const error = new Error("interest_backtrack 需要 bookId，并且至少提供 query 或 anchorChunkId。");
    error.statusCode = 400;
    throw error;
  }
  const startedAtMs = Date.now();
  const run = normalizeNovaAgentRun({
    action: "interest_backtrack",
    label: "Nova 兴趣点回溯",
    status: "running",
    bookId,
    bookTitle: payload.bookTitle || "",
    chunkId: anchorChunkId || String(payload.chunkId || ""),
    chunkTitle: payload.chunkTitle || "",
    contextMode: "interest-backtrack",
    prompt: compactText(payload.prompt || query || "围绕当前兴趣点回溯相关段落。", 1400),
    startedAt: new Date(startedAtMs).toISOString(),
    result: { contextMode: "interest-backtrack" }
  });
  upsertNovaAgentRun(run);

  try {
    const args = {
      bookId,
      query: query || undefined,
      anchorChunkId: anchorChunkId || undefined,
      before: payload.before,
      after: payload.after,
      limit: payload.limit,
      maxRanges: payload.maxRanges,
      mergeGap: payload.mergeGap,
      includeEvidence: payload.includeEvidence !== false,
      createPlan: payload.createPlan === true,
      budget: payload.budget,
      annotationDensity: payload.annotationDensity,
      sinkPolicy: payload.sinkPolicy,
      createdBy: payload.createdBy || "Nova Agent"
    };
    const { result } = await executePiAgentTool("interest_backtrack", args, run);
    const backtrack = result.data || result.raw || result;
    run.status = "success";
    run.completedAt = new Date().toISOString();
    run.durationMs = Date.now() - startedAtMs;
    run.result = {
      content: backtrackSummary(backtrack),
      note: backtrackSummary(backtrack),
      chosenChunkId: anchorChunkId || backtrack.anchorChunkId || "",
      backtrack,
      contextMode: "interest-backtrack",
      prompt: run.prompt
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

async function runNovaToolCallAgent(payload) {
  const toolName = String(payload.tool || payload.toolName || payload.name || payload.command || "").trim();
  const args = payload.arguments || payload.args || payload.input || payload.payload || {};
  if (!toolName) {
    const error = new Error("tool_call 需要 tool/toolName。");
    error.statusCode = 400;
    throw error;
  }
  const definition = findPiAgentTool(toolName);
  const startedAtMs = Date.now();
  const run = normalizeNovaAgentRun({
    action: "tool_call",
    label: `Nova 工具调用: ${definition.label || definition.name}`,
    status: "running",
    bookId: payload.bookId || args.bookId || "",
    bookTitle: payload.bookTitle || "",
    chunkId: payload.chunkId || args.chunkId || args.anchorChunkId || "",
    chunkTitle: payload.chunkTitle || "",
    contextMode: `tool:${definition.category}`,
    prompt: compactText(payload.prompt || `调用工具 ${definition.name}`, 1400),
    startedAt: new Date(startedAtMs).toISOString(),
    result: { contextMode: `tool:${definition.category}` }
  });
  upsertNovaAgentRun(run);

  try {
    const { toolResult, result } = await executePiAgentTool(definition.name, args, run);
    run.status = "success";
    run.completedAt = new Date().toISOString();
    run.durationMs = Date.now() - startedAtMs;
    run.result = {
      content: toolResult.content?.[0]?.text || "",
      note: `${definition.label || definition.name} 已执行。`,
      chosenChunkId: run.chunkId || "",
      tool: agentToolDefinition(definition),
      toolResult,
      backtrack: definition.name === "interest_backtrack" ? (result.data || result.raw || result) : undefined,
      sinkPreview: definition.category === "diary" ? (result.data || result.raw || result) : undefined,
      contextMode: `tool:${definition.category}`,
      prompt: run.prompt
    };
    run.events.push({ type: "agent_end", status: "success", at: run.completedAt });
    const saved = upsertNovaAgentRun(run);
    return { status: "success", run: saved, result: saved.result, toolResult };
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
  if (action === "interest_backtrack" || action === "tool_call") {
    const key = novaAgentActiveKey(action, payload);
    if (!payload.force && NOVA_AGENT_ACTIVE_RUNS.has(key)) {
      return NOVA_AGENT_ACTIVE_RUNS.get(key);
    }
    const promise = action === "interest_backtrack"
      ? runNovaInterestBacktrackAgent({ ...payload, action })
      : runNovaToolCallAgent({ ...payload, action });
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
      novaBackends: NOVA_BACKENDS,
      novaVcpUrl: NOVA_VCP_URL,
      novaBridgeUrl: NOVA_BRIDGE_URL,
      novaAgentUrl: NOVA_AGENT_URL,
      novaAgentName: NOVA_AGENT_NAME,
      novaAgentSession: NOVA_AGENT_SESSION,
      novaAgentSessionScope: NOVA_AGENT_SESSION_SCOPE,
      novaAgentInjectTools: NOVA_AGENT_INJECT_TOOLS,
      novaTimeoutMs: NOVA_TIMEOUT_MS,
      novaFallbackTimeoutMs: NOVA_FALLBACK_TIMEOUT_MS,
      novaAuthSource: novaApiKeySource(),
      companionConfigured: companionConfigured(),
      companionModel: companionConfigured() ? COMPANION_MODEL : "",
      companionTimeoutMs: COMPANION_TIMEOUT_MS,
      companionPersonasPath: COMPANION_PERSONAS_PATH,
      novaGuidePath: NOVA_GUIDE_PATH,
      novaSkillPromptDir: NOVA_SKILL_PROMPTS_DIR,
      novaSkillGuideCount: readNovaSkillGuides().count,
      sinkDefaults: configuredSinkDefaults(),
      agentToolCount: listPiAgentTools().length,
      agentSkillCount: listNovaAgentSkills().length,
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

  if (req.method === "GET" && url.pathname === "/api/companions") {
    return sendJson(res, 200, getCompanionComments(url.searchParams.get("bookId"), url.searchParams.get("chunkId")));
  }

  if (req.method === "POST" && url.pathname === "/api/companions/generate") {
    return sendJson(res, 200, await generateCompanionComments(await readJsonBody(req)));
  }

  if (req.method === "GET" && url.pathname === "/api/agent/tools") {
    return sendJson(res, 200, {
      status: "success",
      tools: listPiAgentTools({ category: url.searchParams.get("category") || "" })
    });
  }

  if (req.method === "GET" && url.pathname === "/api/agent/skills") {
    return sendJson(res, 200, {
      status: "success",
      skills: listNovaAgentSkills()
    });
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

  if (req.method === "POST" && url.pathname === "/api/agent/tool") {
    return sendJson(res, 200, await runNovaAgent({ ...(await readJsonBody(req)), action: "tool_call" }));
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
  if (url.pathname === "/classic/") {
    res.writeHead(301, { location: "/classic" });
    res.end();
    return;
  }
  const requested = url.pathname === "/"
    ? "reader.html"
    : url.pathname === "/classic"
      ? "index.html"
      : url.pathname.slice(1);
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
