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

function postJson(url, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const endpoint = new URL(url);
    const body = JSON.stringify(payload);
    const client = endpoint.protocol === "https:" ? https : http;
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
            reject(error);
            return;
          }
          resolve(json);
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function compactText(value, maxChars = 7000) {
  const text = String(value || "").trim();
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n\n[已截断 ${text.length - maxChars} 字]` : text;
}

async function askNova(body) {
  const apiKey = process.env.CO_READING_NOVA_API_KEY || process.env.VCP_API_KEY || "";
  const context = body.context || {};
  const messages = [
    {
      role: "system",
      content: [
        "你是读书版 Nova，负责陪用户细读文本。",
        "只基于当前段落、选区、笔记和明确传入的上下文回应；不要假装读完整本书。",
        "优先帮助用户自己读：解释这段在说什么，指出值得停留的句子，给一个下一步阅读动作。",
        "用户没问工程实现时，不展开 VCP/插件细节。",
        "如果上下文不足，直接说需要哪一段或哪条笔记。"
      ].join("\n")
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
      stream: false
    },
    apiKey ? { authorization: `Bearer ${apiKey}` } : {}
  );
  return {
    status: "success",
    model: body.model || NOVA_MODEL,
    content: String(result.choices?.[0]?.message?.content || result.output_text || result.content || "").trim(),
    raw: result
  };
}

const BACKGROUND_RUNNERS = new Map();
const RUNNER_JOBS_PATH = path.join(DATA_DIR, "runner_jobs.json");

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
      sinkDefaults: configuredSinkDefaults(),
      runnerJobsPath: RUNNER_JOBS_PATH,
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

  if (req.method === "POST" && url.pathname === "/api/nova/ask") {
    return sendJson(res, 200, await askNova(await readJsonBody(req)));
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
