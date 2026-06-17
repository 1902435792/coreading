#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const wereadLink = require("./weread-link.js");

process.stdin.setEncoding("utf8");
if (process.stdout.setDefaultEncoding) process.stdout.setDefaultEncoding("utf8");

const PLUGIN_DIR = __dirname;
const PROJECT_ROOT = process.env.PROJECT_BASE_PATH || path.resolve(PLUGIN_DIR, "..", "..");
const DEFAULT_VENDOR_DIR = path.join(PLUGIN_DIR, "vendor", "co-reading-mcp");
const DEFAULT_DATA_DIR = path.join(PROJECT_ROOT, "data", "co-reading-mcp");
const SINK_TARGETS = ["obsidian", "dailyNote", "vcpMemory", "obs"];

const COMMAND_ALIASES = {
  tools: "list_tools",
  list_tools: "list_tools",
  list_books: "reading_list_books",
  books: "reading_list_books",
  library: "reading_list_books",
  list_chunks: "reading_list_chunks",
  chunks: "reading_list_chunks",
  read: "reading_read_chunk",
  read_chunk: "reading_read_chunk",
  continue: "reading_continue",
  search: "reading_search_chunks",
  search_chunks: "reading_search_chunks",
  import: "reading_import_book",
  import_book: "reading_import_book",
  import_file: "import_file",
  import_begin: "reading_import_begin",
  import_part: "reading_import_part",
  import_finish: "reading_import_finish",
  import_cancel: "reading_import_cancel",
  delete_book: "reading_delete_book",
  annotate: "reading_annotate_passage",
  annotate_passage: "reading_annotate_passage",
  user_note_create: "user_note_create",
  create_user_note: "user_note_create",
  user_note_list: "user_note_list",
  list_user_notes: "user_note_list",
  user_note_delete: "user_note_delete",
  delete_user_note: "user_note_delete",
  list_annotations: "reading_list_annotations",
  annotations: "reading_list_annotations",
  submit_notes: "reading_submit_user_notes",
  submit_user_notes: "reading_submit_user_notes",
  list_submissions: "reading_list_submissions",
  read_submission: "reading_read_submission",
  reply: "reading_reply_to_annotation",
  reply_to_annotation: "reading_reply_to_annotation",
  mark_read: "reading_mark_read",
  card_inbox: "reading_card_inbox",
  card_collection: "reading_card_collection",
  open_card: "reading_open_card",
  save_card: "reading_save_card",
  dismiss_card: "reading_dismiss_card",
  list_cards: "reading_list_cards",
  collect_card: "reading_collect_card",
  progress: "reading_get_progress",
  get_progress: "reading_get_progress",
  plan_create: "plan_create",
  create_plan: "plan_create",
  interest_backtrack: "interest_backtrack",
  backtrack_interest: "interest_backtrack",
  trace_interest: "interest_backtrack",
  plan_list: "plan_list",
  list_plans: "plan_list",
  plans: "plan_list",
  plan_get: "plan_get",
  get_plan: "plan_get",
  plan_update: "plan_update",
  update_plan: "plan_update",
  plan_next_step: "plan_next_step",
  next_step: "plan_next_step",
  plan_execute_step: "plan_execute_step",
  execute_plan_step: "plan_execute_step",
  execute_step: "plan_execute_step",
  plan_run: "plan_run",
  run_plan: "plan_run",
  plan_record_step: "plan_record_step",
  record_step: "plan_record_step",
  review_create: "review_create",
  create_review: "review_create",
  review_list: "review_list",
  list_reviews: "review_list",
  reviews: "review_list",
  review_get: "review_get",
  get_review: "review_get",
  sink_preview_create: "sink_preview_create",
  create_sink_preview: "sink_preview_create",
  sink_create_preview: "sink_preview_create",
  sink_preview_create_from_cards: "sink_preview_create_from_cards",
  card_digest_sink_preview_create: "sink_preview_create_from_cards",
  sink_preview_create_from_backtrack: "sink_preview_create_from_backtrack",
  backtrack_sink_preview_create: "sink_preview_create_from_backtrack",
  // 微信读书联动
  link_weread_book: "reading_link_weread_book",
  reading_link_weread_book: "reading_link_weread_book",
  find_weread_context: "reading_find_weread_context",
  reading_find_weread_context: "reading_find_weread_context",
  // co-reading-kit compatibility wrappers
  reading_get_manifest: "reading_get_manifest",
  reading_get_chunk: "reading_get_chunk",
  reading_search: "reading_search",
  reading_search_exact: "reading_search_exact",
  reading_resume_book: "reading_resume_book",
  reading_update_progress: "reading_update_progress",
  reading_update_note: "reading_update_note",
  reading_read_note: "reading_read_note",
  reading_build_index: "reading_build_index",
  get_manifest: "reading_get_manifest",
  get_chunk: "reading_get_chunk",
  search_exact: "reading_search_exact",
  resume_book: "reading_resume_book",
  update_progress: "reading_update_progress",
  update_note: "reading_update_note",
  read_note: "reading_read_note",
  build_index: "reading_build_index",
  sink_preview_list: "sink_preview_list",
  list_sink_previews: "sink_preview_list",
  sink_previews: "sink_preview_list",
  sink_preview_get: "sink_preview_get",
  get_sink_preview: "sink_preview_get",
  sink_preview_update: "sink_preview_update",
  update_sink_preview: "sink_preview_update",
  sink_execute: "sink_execute",
  execute_sink: "sink_execute",
  sink_preview_execute: "sink_execute",
  obsidian_note_read: "obsidian_note_read",
  read_obsidian_note: "obsidian_note_read",
  obsidian_note_diff: "obsidian_note_diff",
  diff_obsidian_note: "obsidian_note_diff",
  obsidian_note_merge: "obsidian_note_merge",
  merge_obsidian_note: "obsidian_note_merge",
  obsidian_note_suggest_integration: "obsidian_note_suggest_integration",
  suggest_obsidian_note_integration: "obsidian_note_suggest_integration",
  obsidian_note_apply_integration_choice: "obsidian_note_apply_integration_choice",
  apply_obsidian_note_integration_choice: "obsidian_note_apply_integration_choice",
  obsidian_note_preview_replace_range: "obsidian_note_preview_replace_range",
  preview_obsidian_note_replace_range: "obsidian_note_preview_replace_range",
  obsidian_note_confirm_replace_range: "obsidian_note_confirm_replace_range",
  confirm_obsidian_note_replace_range: "obsidian_note_confirm_replace_range",
  obsidian_note_integrate: "obsidian_note_integrate",
  integrate_obsidian_note: "obsidian_note_integrate",
  obsidian_note_status: "obsidian_note_status",
  status_obsidian_note: "obsidian_note_status",
  obsidian_vault_status: "obsidian_vault_status",
  status_obsidian_vault: "obsidian_vault_status",
  obsidian_vault_snapshot: "obsidian_vault_snapshot",
  snapshot_obsidian_vault: "obsidian_vault_snapshot",
  obsidian_vault_snapshot_list: "obsidian_vault_snapshot_list",
  list_obsidian_vault_snapshots: "obsidian_vault_snapshot_list",
  obsidian_vault_snapshot_diff: "obsidian_vault_snapshot_diff",
  diff_obsidian_vault_snapshots: "obsidian_vault_snapshot_diff",
  obsidian_vault_index_build: "obsidian_vault_index_build",
  build_obsidian_vault_index: "obsidian_vault_index_build",
  obsidian_vault_index_list: "obsidian_vault_index_list",
  list_obsidian_vault_indexes: "obsidian_vault_index_list",
  obsidian_vault_index_get: "obsidian_vault_index_get",
  get_obsidian_vault_index: "obsidian_vault_index_get",
  obsidian_vault_index_refresh_check: "obsidian_vault_index_refresh_check",
  check_obsidian_vault_index_refresh: "obsidian_vault_index_refresh_check",
  obsidian_vault_index_refresh: "obsidian_vault_index_refresh",
  refresh_obsidian_vault_index: "obsidian_vault_index_refresh",
  obsidian_vault_sync_plan_create: "obsidian_vault_sync_plan_create",
  create_obsidian_vault_sync_plan: "obsidian_vault_sync_plan_create",
  obsidian_vault_sync_action_apply: "obsidian_vault_sync_action_apply",
  apply_obsidian_vault_sync_action: "obsidian_vault_sync_action_apply",
  obsidian_note_resolve: "obsidian_note_resolve",
  resolve_obsidian_note: "obsidian_note_resolve",
  illustration_create: "illustration_create",
  create_illustration: "illustration_create",
  illustration_list: "illustration_list",
  list_illustrations: "illustration_list",
  illustrations: "illustration_list",
  illustration_get: "illustration_get",
  get_illustration: "illustration_get",
  illustration_update: "illustration_update",
  update_illustration: "illustration_update",
  illustration_suggest: "illustration_suggest",
  suggest_illustration: "illustration_suggest"
};

const LOCAL_PLAN_TOOLS = [
  {
    name: "plan_create",
    description: "Create a bounded Nova co-reading plan for a book, range, or interest trail.",
    inputSchema: {
      type: "object",
      required: ["bookId"],
      properties: {
        bookId: { type: "string" },
        title: { type: "string" },
        mode: { type: "string", enum: ["full_book", "range", "interest_trail", "free"] },
        scope: { type: "object" },
        startChunkId: { type: "string" },
        endChunkId: { type: "string" },
        chunkIds: { type: "array", items: { type: "string" } },
        query: { type: "string" },
        budget: { type: "object" },
        annotationDensity: { type: "string", enum: ["none", "light", "medium", "dense"] },
        sinkPolicy: { type: "object" },
        createdBy: { type: "string" }
      },
      additionalProperties: true
    },
    annotations: { title: "Create Reading Plan" }
  },
  {
    name: "interest_backtrack",
    description: "Expand a query or anchor chunk into bounded source ranges, optionally creating a Nova follow-up reading plan.",
    inputSchema: {
      type: "object",
      required: ["bookId"],
      properties: {
        bookId: { type: "string" },
        query: { type: "string" },
        anchorChunkId: { type: "string" },
        before: { type: "number" },
        after: { type: "number" },
        limit: { type: "number" },
        maxRanges: { type: "number" },
        mergeGap: { type: "number" },
        includeEvidence: { type: "boolean" },
        createPlan: { type: "boolean" },
        title: { type: "string" },
        budget: { type: "object" },
        annotationDensity: { type: "string", enum: ["none", "light", "medium", "dense"] },
        sinkPolicy: { type: "object" },
        createdBy: { type: "string" }
      },
      additionalProperties: true
    },
    annotations: { title: "Backtrack Interest Trail" }
  },
  {
    name: "plan_list",
    description: "List stored reading plans, optionally filtered by bookId or status.",
    inputSchema: {
      type: "object",
      properties: {
        bookId: { type: "string" },
        status: { type: "string" }
      },
      additionalProperties: false
    },
    annotations: { title: "List Reading Plans", readOnlyHint: true }
  },
  {
    name: "plan_get",
    description: "Read one stored reading plan.",
    inputSchema: {
      type: "object",
      required: ["planId"],
      properties: { planId: { type: "string" } },
      additionalProperties: false
    },
    annotations: { title: "Get Reading Plan", readOnlyHint: true }
  },
  {
    name: "plan_update",
    description: "Patch plan metadata such as title, status, budget, scope, annotationDensity, or sinkPolicy.",
    inputSchema: {
      type: "object",
      required: ["planId"],
      properties: {
        planId: { type: "string" },
        patch: { type: "object" },
        title: { type: "string" },
        status: { type: "string" },
        budget: { type: "object" },
        scope: { type: "object" },
        annotationDensity: { type: "string" },
        sinkPolicy: { type: "object" }
      },
      additionalProperties: true
    },
    annotations: { title: "Update Reading Plan" }
  },
  {
    name: "plan_next_step",
    description: "Return the next unfinished step and suggested CoReadingMCP commands for Nova.",
    inputSchema: {
      type: "object",
      required: ["planId"],
      properties: {
        planId: { type: "string" },
        claim: { type: "boolean" },
        completeIfDone: { type: "boolean" }
      },
      additionalProperties: false
    },
    annotations: { title: "Next Reading Step" }
  },
  {
    name: "plan_record_step",
    description: "Record the outcome of a plan step and advance the plan ledger.",
    inputSchema: {
      type: "object",
      required: ["planId"],
      properties: {
        planId: { type: "string" },
        stepId: { type: "string" },
        index: { type: "number" },
        status: { type: "string" },
        note: { type: "string" },
        result: { type: "object" },
        artifacts: { type: "array" }
      },
      additionalProperties: true
    },
    annotations: { title: "Record Reading Step" }
  },
  {
    name: "plan_execute_step",
    description: "Execute one bounded plan step: read/mark/review/sink-preview or search and record the ledger.",
    inputSchema: {
      type: "object",
      required: ["planId"],
      properties: {
        planId: { type: "string" },
        stepId: { type: "string" },
        index: { type: "number" },
        force: { type: "boolean" },
        markRead: { type: "boolean" },
        createReview: { type: "boolean" },
        createSinkPreview: { type: "boolean" },
        targets: { type: "array", items: { type: "string", enum: SINK_TARGETS } },
        requireApproval: { type: "boolean" },
        searchLimit: { type: "number" },
        chosenChunkIds: { type: "array", items: { type: "string" } },
        createdBy: { type: "string" }
      },
      additionalProperties: true
    },
    annotations: { title: "Execute Reading Step" }
  },
  {
    name: "plan_run",
    description: "Run several bounded plan steps with persisted ledger progress; stops when paused, completed, errored, or maxSteps is reached.",
    inputSchema: {
      type: "object",
      required: ["planId"],
      properties: {
        planId: { type: "string" },
        maxSteps: { type: "number" },
        stopOnError: { type: "boolean" },
        lockTtlMs: { type: "number" },
        forceLock: { type: "boolean" },
        markRead: { type: "boolean" },
        createReview: { type: "boolean" },
        createSinkPreview: { type: "boolean" },
        targets: { type: "array", items: { type: "string", enum: SINK_TARGETS } },
        requireApproval: { type: "boolean" },
        searchLimit: { type: "number" },
        createdBy: { type: "string" }
      },
      additionalProperties: true
    },
    annotations: { title: "Run Reading Plan" }
  }
];

const LOCAL_REVIEW_TOOLS = [
  {
    name: "review_create",
    description: "Create a sourced chapter/range review artifact without storing raw full text.",
    inputSchema: {
      type: "object",
      required: ["bookId", "summary"],
      properties: {
        bookId: { type: "string" },
        planId: { type: "string" },
        stepId: { type: "string" },
        title: { type: "string" },
        summary: { type: "string" },
        stance: { type: "string" },
        scope: { type: "object" },
        startChunkId: { type: "string" },
        endChunkId: { type: "string" },
        chunkIds: { type: "array", items: { type: "string" } },
        observations: { type: "array" },
        questions: { type: "array" },
        quotes: { type: "array" },
        nextActions: { type: "array" },
        tags: { type: "array", items: { type: "string" } },
        createdBy: { type: "string" }
      },
      additionalProperties: true
    },
    annotations: { title: "Create Range Review" }
  },
  {
    name: "review_list",
    description: "List stored chapter/range reviews, optionally filtered by bookId, planId, or status.",
    inputSchema: {
      type: "object",
      properties: {
        bookId: { type: "string" },
        planId: { type: "string" },
        status: { type: "string" }
      },
      additionalProperties: false
    },
    annotations: { title: "List Range Reviews", readOnlyHint: true }
  },
  {
    name: "review_get",
    description: "Read one stored chapter/range review.",
    inputSchema: {
      type: "object",
      required: ["reviewId"],
      properties: { reviewId: { type: "string" } },
      additionalProperties: false
    },
    annotations: { title: "Get Range Review", readOnlyHint: true }
  }
];

const LOCAL_SINK_TOOLS = [
  {
    name: "sink_preview_create",
    description: "Create sink previews for Obsidian, OBS, DailyNote, and/or VCPMemory from a curated review.",
    inputSchema: {
      type: "object",
      required: ["reviewId"],
      properties: {
        reviewId: { type: "string" },
        targets: { type: "array", items: { type: "string", enum: SINK_TARGETS } },
        requireApproval: { type: "boolean" },
        illustrationIds: { type: "array", items: { type: "string" } },
        illustrationStatuses: { type: "array", items: { type: "string" } },
        vaultPath: { type: "string" },
        notePath: { type: "string" },
        obsOutputDir: { type: "string" },
        obsMarkdownPath: { type: "string" },
        obsTextPath: { type: "string" },
        createdBy: { type: "string" }
      },
      additionalProperties: true
    },
    annotations: { title: "Create Sink Preview" }
  },
  {
    name: "sink_preview_create_from_backtrack",
    description: "Create approval-gated Obsidian/OBS sink previews from an interest_backtrack evidence packet.",
    inputSchema: {
      type: "object",
      required: ["bookId"],
      properties: {
        bookId: { type: "string" },
        query: { type: "string" },
        anchorChunkId: { type: "string" },
        before: { type: "number" },
        after: { type: "number" },
        limit: { type: "number" },
        maxRanges: { type: "number" },
        mergeGap: { type: "number" },
        targets: { type: "array", items: { type: "string", enum: SINK_TARGETS } },
        requireApproval: { type: "boolean" },
        vaultPath: { type: "string" },
        notePath: { type: "string" },
        obsOutputDir: { type: "string" },
        obsMarkdownPath: { type: "string" },
        obsTextPath: { type: "string" },
        createdBy: { type: "string" }
      },
      additionalProperties: true
    },
    annotations: { title: "Create Backtrack Sink Preview" }
  },
  {
    name: "sink_preview_create_from_cards",
    description: "Create approval-gated Obsidian/OBS digest previews from collected reading cards.",
    inputSchema: {
      type: "object",
      required: ["bookId"],
      properties: {
        bookId: { type: "string" },
        chunkId: { type: "string" },
        source: { type: "string" },
        scope: { type: "string" },
        cardIds: { type: "array", items: { type: "string" } },
        limit: { type: "number" },
        offset: { type: "number" },
        title: { type: "string" },
        targets: { type: "array", items: { type: "string", enum: SINK_TARGETS } },
        requireApproval: { type: "boolean" },
        vaultPath: { type: "string" },
        notePath: { type: "string" },
        obsOutputDir: { type: "string" },
        obsMarkdownPath: { type: "string" },
        obsTextPath: { type: "string" },
        createdBy: { type: "string" }
      },
      additionalProperties: true
    },
    annotations: { title: "Create Card Digest Sink Preview" }
  },
  {
    name: "sink_preview_list",
    description: "List sink previews, optionally filtered by reviewId, target, or status.",
    inputSchema: {
      type: "object",
      properties: {
        reviewId: { type: "string" },
        target: { type: "string" },
        status: { type: "string" }
      },
      additionalProperties: false
    },
    annotations: { title: "List Sink Previews", readOnlyHint: true }
  },
  {
    name: "sink_preview_get",
    description: "Read one sink preview.",
    inputSchema: {
      type: "object",
      required: ["previewId"],
      properties: { previewId: { type: "string" } },
      additionalProperties: false
    },
    annotations: { title: "Get Sink Preview", readOnlyHint: true }
  },
  {
    name: "sink_preview_update",
    description: "Update approval/export status for a sink preview without writing to external systems.",
    inputSchema: {
      type: "object",
      required: ["previewId", "status"],
      properties: {
        previewId: { type: "string" },
        status: { type: "string", enum: ["pending", "approved", "rejected", "exported"] },
        content: {},
        note: { type: "string" },
        criticalRemovals: { type: "array" },
        updatedBy: { type: "string" }
      },
      additionalProperties: true
    },
    annotations: { title: "Update Sink Preview" }
  },
  {
    name: "sink_execute",
    description: "Execute one approved sink preview through the configured Obsidian/OBS/DailyNote/VCPMemory adapter.",
    inputSchema: {
      type: "object",
      required: ["previewId"],
      properties: {
        previewId: { type: "string" },
        force: { type: "boolean" },
        overwrite: { type: "boolean" },
        overwriteAssets: { type: "boolean" },
        vaultPath: { type: "string" },
        assetFolder: { type: "string" },
        dailyNoteRoot: { type: "string" },
        vcpMemoryRoot: { type: "string" },
        obsOutputDir: { type: "string" },
        obsMarkdownPath: { type: "string" },
        obsTextPath: { type: "string" },
        obsTextMaxChars: { type: "number" },
        targetFolder: { type: "string" },
        reviewer: { type: "string" },
        updatedBy: { type: "string" }
      },
      additionalProperties: true
    },
    annotations: { title: "Execute Sink Preview" }
  },
  {
    name: "obsidian_note_read",
    description: "Read an Obsidian note inside the configured vault by previewId or notePath.",
    inputSchema: {
      type: "object",
      properties: {
        previewId: { type: "string" },
        vaultPath: { type: "string" },
        notePath: { type: "string" },
        includeContent: { type: "boolean" }
      },
      additionalProperties: false
    },
    annotations: { title: "Read Obsidian Note", readOnlyHint: true }
  },
  {
    name: "obsidian_note_diff",
    description: "Compare the current Obsidian note with a sink preview or supplied content without writing.",
    inputSchema: {
      type: "object",
      properties: {
        previewId: { type: "string" },
        vaultPath: { type: "string" },
        notePath: { type: "string" },
        content: { type: "string" }
      },
      additionalProperties: false
    },
    annotations: { title: "Diff Obsidian Note", readOnlyHint: true }
  },
  {
    name: "obsidian_note_merge",
    description: "Safely merge a sink preview into an Obsidian note by appending a proposed update section unless force overwrite is requested elsewhere.",
    inputSchema: {
      type: "object",
      properties: {
        previewId: { type: "string" },
        vaultPath: { type: "string" },
        notePath: { type: "string" },
        content: { type: "string" },
        strategy: { type: "string", enum: ["append_proposed_update"] },
        updatedBy: { type: "string" }
      },
      additionalProperties: false
    },
    annotations: { title: "Merge Obsidian Note" }
  },
  {
    name: "obsidian_note_integrate",
    description: "Append a curated integrated update section to an Obsidian note and mark the related proposed update resolved without overwriting reader content.",
    inputSchema: {
      type: "object",
      properties: {
        previewId: { type: "string" },
        blockPreviewId: { type: "string" },
        vaultPath: { type: "string" },
        notePath: { type: "string" },
        content: { type: "string" },
        integratedContent: { type: "string" },
        integratedBy: { type: "string" },
        resolutionNote: { type: "string" }
      },
      additionalProperties: false
    },
    annotations: { title: "Integrate Obsidian Proposed Update" }
  },
  {
    name: "obsidian_note_suggest_integration",
    description: "Read an Obsidian note and propose a conservative integration plan for a CoReading proposed update without writing.",
    inputSchema: {
      type: "object",
      properties: {
        previewId: { type: "string" },
        blockPreviewId: { type: "string" },
        vaultPath: { type: "string" },
        notePath: { type: "string" },
        content: { type: "string" },
        includeDraft: { type: "boolean" }
      },
      additionalProperties: false
    },
    annotations: { title: "Suggest Obsidian Integration", readOnlyHint: true }
  },
  {
    name: "obsidian_note_apply_integration_choice",
    description: "Apply a safe integration choice from obsidian_note_suggest_integration. Only append_integrated_update writes content automatically; replace_with_draft is rejected for manual review.",
    inputSchema: {
      type: "object",
      required: ["choiceId"],
      properties: {
        choiceId: { type: "string", enum: ["keep_current", "append_integrated_update", "replace_with_draft", "manual_review"] },
        previewId: { type: "string" },
        blockPreviewId: { type: "string" },
        vaultPath: { type: "string" },
        notePath: { type: "string" },
        content: { type: "string" },
        integratedContent: { type: "string" },
        integratedBy: { type: "string" },
        resolvedBy: { type: "string" },
        resolutionNote: { type: "string" }
      },
      additionalProperties: false
    },
    annotations: { title: "Apply Obsidian Integration Choice" }
  },
  {
    name: "obsidian_note_preview_replace_range",
    description: "Preview candidate paragraph ranges for replacing Obsidian note content with an integration draft without writing.",
    inputSchema: {
      type: "object",
      properties: {
        previewId: { type: "string" },
        blockPreviewId: { type: "string" },
        vaultPath: { type: "string" },
        notePath: { type: "string" },
        content: { type: "string" },
        draft: { type: "string" },
        maxCandidates: { type: "integer" }
      },
      additionalProperties: false
    },
    annotations: { title: "Preview Obsidian Replace Range", readOnlyHint: true }
  },
  {
    name: "obsidian_note_confirm_replace_range",
    description: "Replace a manually confirmed Obsidian note line range with an integration draft. Requires confirmReplace=true and expectedDraftHash.",
    inputSchema: {
      type: "object",
      required: ["confirmReplace", "expectedDraftHash"],
      properties: {
        confirmReplace: { type: "boolean" },
        startLine: { type: "integer" },
        endLine: { type: "integer" },
        selectedRanges: {
          type: "array",
          items: {
            type: "object",
            properties: {
              startLine: { type: "integer" },
              endLine: { type: "integer" }
            },
            required: ["startLine", "endLine"],
            additionalProperties: false
          }
        },
        expectedDraftHash: { type: "string" },
        previewId: { type: "string" },
        blockPreviewId: { type: "string" },
        vaultPath: { type: "string" },
        notePath: { type: "string" },
        content: { type: "string" },
        draft: { type: "string" },
        replacedBy: { type: "string" },
        resolutionNote: { type: "string" }
      },
      additionalProperties: false
    },
    annotations: { title: "Confirm Obsidian Replace Range" }
  },
  {
    name: "obsidian_note_status",
    description: "Summarize CoReading proposed update blocks in an Obsidian note without writing.",
    inputSchema: {
      type: "object",
      properties: {
        previewId: { type: "string" },
        vaultPath: { type: "string" },
        notePath: { type: "string" },
        includeContentPreview: { type: "boolean" }
      },
      additionalProperties: false
    },
    annotations: { title: "Obsidian Proposed Update Status", readOnlyHint: true }
  },
  {
    name: "obsidian_vault_status",
    description: "Summarize CoReading proposed update blocks across Markdown notes in an Obsidian vault without writing.",
    inputSchema: {
      type: "object",
      properties: {
        vaultPath: { type: "string" },
        folder: { type: "string" },
        status: { type: "string", enum: ["all", "proposed", "resolved"] },
        limit: { type: "integer" },
        offset: { type: "integer" },
        maxFiles: { type: "integer" },
        maxBytesPerFile: { type: "integer" },
        includeContentPreview: { type: "boolean" }
      },
      additionalProperties: false
    },
    annotations: { title: "Obsidian Vault Proposed Update Status", readOnlyHint: true }
  },
  {
    name: "obsidian_vault_snapshot",
    description: "Save a local snapshot of Obsidian vault proposed/resolved update status for later sync review. Writes only CoReadingMCP data, not the vault.",
    inputSchema: {
      type: "object",
      required: ["vaultPath"],
      properties: {
        vaultPath: { type: "string" },
        folder: { type: "string" },
        status: { type: "string", enum: ["all", "proposed", "resolved"] },
        limit: { type: "integer" },
        offset: { type: "integer" },
        maxFiles: { type: "integer" },
        maxBytesPerFile: { type: "integer" },
        includeContentPreview: { type: "boolean" },
        maxSnapshots: { type: "integer" },
        label: { type: "string" },
        createdBy: { type: "string" }
      },
      additionalProperties: false
    },
    annotations: { title: "Snapshot Obsidian Vault Status" }
  },
  {
    name: "obsidian_vault_snapshot_list",
    description: "List local Obsidian vault status snapshots saved by CoReadingMCP.",
    inputSchema: {
      type: "object",
      properties: {
        vaultPath: { type: "string" },
        folder: { type: "string" },
        limit: { type: "integer" },
        offset: { type: "integer" },
        includeNotes: { type: "boolean" }
      },
      additionalProperties: false
    },
    annotations: { title: "List Obsidian Vault Snapshots", readOnlyHint: true }
  },
  {
    name: "obsidian_vault_snapshot_diff",
    description: "Compare two saved Obsidian vault status snapshots without reading or writing the vault.",
    inputSchema: {
      type: "object",
      properties: {
        beforeSnapshotId: { type: "string" },
        afterSnapshotId: { type: "string" },
        changeStatus: { type: "string", enum: ["all", "proposed", "resolved"] },
        includeBlocks: { type: "boolean" }
      },
      additionalProperties: false
    },
    annotations: { title: "Diff Obsidian Vault Snapshots", readOnlyHint: true }
  },
  {
    name: "obsidian_vault_index_build",
    description: "Build a local pageable index of CoReading proposed/resolved blocks in an Obsidian vault. Writes only CoReadingMCP data, not the vault.",
    inputSchema: {
      type: "object",
      required: ["vaultPath"],
      properties: {
        vaultPath: { type: "string" },
        folder: { type: "string" },
        limit: { type: "integer" },
        maxFiles: { type: "integer" },
        maxBytesPerFile: { type: "integer" },
        includeContentPreview: { type: "boolean" },
        maxIndexes: { type: "integer" },
        label: { type: "string" },
        createdBy: { type: "string" }
      },
      additionalProperties: false
    },
    annotations: { title: "Build Obsidian Vault Index" }
  },
  {
    name: "obsidian_vault_index_list",
    description: "List local Obsidian vault block indexes saved by CoReadingMCP.",
    inputSchema: {
      type: "object",
      properties: {
        vaultPath: { type: "string" },
        folder: { type: "string" },
        limit: { type: "integer" },
        offset: { type: "integer" }
      },
      additionalProperties: false
    },
    annotations: { title: "List Obsidian Vault Indexes", readOnlyHint: true }
  },
  {
    name: "obsidian_vault_index_get",
    description: "Read a saved Obsidian vault block index with paging and filters.",
    inputSchema: {
      type: "object",
      properties: {
        indexId: { type: "string" },
        status: { type: "string", enum: ["all", "proposed", "resolved"] },
        previewId: { type: "string" },
        blockPreviewId: { type: "string" },
        notePath: { type: "string" },
        limit: { type: "integer" },
        offset: { type: "integer" }
      },
      additionalProperties: false
    },
    annotations: { title: "Get Obsidian Vault Index", readOnlyHint: true }
  },
  {
    name: "obsidian_vault_index_refresh_check",
    description: "Compare the latest saved Obsidian vault index with the current vault scan and report whether the local index is stale. Reads the vault but does not write it.",
    inputSchema: {
      type: "object",
      properties: {
        indexId: { type: "string" },
        vaultPath: { type: "string" },
        folder: { type: "string" },
        limit: { type: "integer" },
        maxFiles: { type: "integer" },
        maxBytesPerFile: { type: "integer" },
        includeBlocks: { type: "boolean" }
      },
      additionalProperties: false
    },
    annotations: { title: "Check Obsidian Vault Index Freshness", readOnlyHint: true }
  },
  {
    name: "obsidian_vault_index_refresh",
    description: "User-confirmed rebuild of a stale Obsidian vault block index. Reads the vault and writes only CoReadingMCP index data, not the vault.",
    inputSchema: {
      type: "object",
      properties: {
        indexId: { type: "string" },
        vaultPath: { type: "string" },
        folder: { type: "string" },
        limit: { type: "integer" },
        maxFiles: { type: "integer" },
        maxBytesPerFile: { type: "integer" },
        includeContentPreview: { type: "boolean" },
        label: { type: "string" },
        createdBy: { type: "string" },
        maxIndexes: { type: "integer" },
        force: { type: "boolean" },
        confirmRefresh: { type: "boolean" }
      },
      additionalProperties: false
    },
    annotations: { title: "Refresh Obsidian Vault Index" }
  },
  {
    name: "obsidian_vault_sync_plan_create",
    description: "Create a read-only review plan from differences between a saved Obsidian vault index and the current vault scan. Does not write the vault or rebuild the index.",
    inputSchema: {
      type: "object",
      properties: {
        indexId: { type: "string" },
        vaultPath: { type: "string" },
        folder: { type: "string" },
        limit: { type: "integer" },
        maxFiles: { type: "integer" },
        maxBytesPerFile: { type: "integer" },
        includeBlocks: { type: "boolean" },
        reviewer: { type: "string" }
      },
      additionalProperties: false
    },
    annotations: { title: "Create Obsidian Vault Sync Plan", readOnlyHint: true }
  },
  {
    name: "obsidian_vault_sync_action_apply",
    description: "Apply one explicit Obsidian vault sync review action. Only supports safe confirmed actions: resolve a proposed block or rebuild the local index.",
    inputSchema: {
      type: "object",
      required: ["action"],
      properties: {
        action: { type: "object" },
        actionId: { type: "string" },
        vaultPath: { type: "string" },
        folder: { type: "string" },
        indexId: { type: "string" },
        confirmApply: { type: "boolean" },
        confirmRefresh: { type: "boolean" },
        resolutionNote: { type: "string" },
        appliedBy: { type: "string" },
        label: { type: "string" },
        force: { type: "boolean" }
      },
      additionalProperties: false
    },
    annotations: { title: "Apply Obsidian Vault Sync Action" }
  },
  {
    name: "obsidian_note_resolve",
    description: "Mark an existing CoReading proposed update block as resolved without deleting reader or preview content.",
    inputSchema: {
      type: "object",
      properties: {
        previewId: { type: "string" },
        blockPreviewId: { type: "string" },
        vaultPath: { type: "string" },
        notePath: { type: "string" },
        resolvedBy: { type: "string" },
        resolutionNote: { type: "string" }
      },
      additionalProperties: false
    },
    annotations: { title: "Resolve Obsidian Proposed Update" }
  }
];

const LOCAL_ILLUSTRATION_TOOLS = [
  {
    name: "illustration_create",
    description: "Create an illustration request/asset placeholder for a book, range, chapter end, chunk, or custom placement. Does not call image generation yet.",
    inputSchema: {
      type: "object",
      required: ["bookId"],
      properties: {
        bookId: { type: "string" },
        title: { type: "string" },
        prompt: { type: "string" },
        negativePrompt: { type: "string" },
        intent: { type: "string" },
        sourceType: { type: "string", enum: ["ai", "library", "manual"] },
        status: { type: "string", enum: ["draft", "requested", "generating", "generated", "inserted", "rejected"] },
        provider: { type: "string" },
        model: { type: "string" },
        stylePreset: { type: "string" },
        aspectRatio: { type: "string" },
        assetUri: { type: "string" },
        thumbnailUri: { type: "string" },
        placement: { type: "object" },
        chunkId: { type: "string" },
        startChunkId: { type: "string" },
        endChunkId: { type: "string" },
        position: { type: "string", enum: ["chapter_end", "after_chunk", "before_chunk", "inline", "cover", "custom"] },
        layer: { type: "string", enum: ["chapter", "margin", "inline", "cover", "gallery"] },
        tags: { type: "array", items: { type: "string" } },
        createdBy: { type: "string" }
      },
      additionalProperties: true
    },
    annotations: { title: "Create Illustration Request" }
  },
  {
    name: "illustration_list",
    description: "List illustration requests/assets, optionally filtered by bookId, status, sourceType, or layer.",
    inputSchema: {
      type: "object",
      properties: {
        bookId: { type: "string" },
        status: { type: "string" },
        sourceType: { type: "string" },
        layer: { type: "string" }
      },
      additionalProperties: false
    },
    annotations: { title: "List Illustrations", readOnlyHint: true }
  },
  {
    name: "illustration_get",
    description: "Read one illustration request/asset.",
    inputSchema: {
      type: "object",
      required: ["illustrationId"],
      properties: { illustrationId: { type: "string" } },
      additionalProperties: false
    },
    annotations: { title: "Get Illustration", readOnlyHint: true }
  },
  {
    name: "illustration_update",
    description: "Patch illustration request status, prompt, placement, or generated/library asset URI.",
    inputSchema: {
      type: "object",
      required: ["illustrationId"],
      properties: {
        illustrationId: { type: "string" },
        patch: { type: "object" },
        status: { type: "string" },
        prompt: { type: "string" },
        negativePrompt: { type: "string" },
        assetUri: { type: "string" },
        thumbnailUri: { type: "string" },
        placement: { type: "object" },
        note: { type: "string" },
        updatedBy: { type: "string" }
      },
      additionalProperties: true
    },
    annotations: { title: "Update Illustration" }
  },
  {
    name: "illustration_suggest",
    description: "Suggest safe illustration prompts for a bounded book/chunk/range without looking ahead. Does not call an image API.",
    inputSchema: {
      type: "object",
      required: ["bookId"],
      properties: {
        bookId: { type: "string" },
        chunkId: { type: "string" },
        startChunkId: { type: "string" },
        endChunkId: { type: "string" },
        chunkIds: { type: "array", items: { type: "string" } },
        position: { type: "string" },
        layer: { type: "string" },
        stylePreset: { type: "string" },
        aspectRatio: { type: "string" },
        mood: { type: "string" },
        includeNarrative: { type: "boolean" }
      },
      additionalProperties: true
    },
    annotations: { title: "Suggest Illustration Prompt", readOnlyHint: true }
  }
];

const LOCAL_IMPORT_TOOLS = [
  {
    name: "import_file",
    description: "Import one browser/sidecar file payload in a single wrapper process. Use for sidecar uploads that cannot preserve chunked upload sessions.",
    inputSchema: {
      type: "object",
      required: ["filename", "dataBase64"],
      properties: {
        filename: { type: "string" },
        dataBase64: { type: "string" },
        format: { type: "string", enum: ["epub", "txt", "text", "md", "markdown"] },
        bookId: { type: "string" },
        title: { type: "string" },
        author: { type: "string" },
        maxChars: { type: "number" },
        headingRegex: { type: "string" },
        minSectionChars: { type: "number" },
        overwrite: { type: "boolean" }
      },
      additionalProperties: false
    },
    annotations: { title: "Import File" }
  }
];

const LOCAL_WEREAD_TOOLS = [
  {
    name: "reading_link_weread_book",
    description: "Link a WeRead book to a local reading book for context lookup.",
    inputSchema: {
      type: "object",
      properties: {
        wereadTitle: { type: "string", description: "WeRead book title" },
        wereadBookId: { type: "string", description: "Optional WeRead book ID" },
        wereadAuthor: { type: "string", description: "Optional WeRead book author" },
        localBookId: { type: "string", description: "Local book ID to link (required if confirm=true)" },
        confirm: { type: "boolean", description: "Manually confirm the link" }
      },
      additionalProperties: false
    },
    annotations: { title: "Link WeRead Book" }
  },
  {
    name: "reading_find_weread_context",
    description: "Find local chunk context from WeRead highlight text.",
    inputSchema: {
      type: "object",
      required: ["wereadTitle", "markText"],
      properties: {
        wereadTitle: { type: "string", description: "WeRead book title" },
        markText: { type: "string", description: "WeRead highlight text to search" },
        includeChunk: { type: "boolean", description: "Include full chunk text in result" }
      },
      additionalProperties: false
    },
    annotations: { title: "Find WeRead Context", readOnlyHint: true }
  }
];

const LOCAL_COMPAT_TOOLS = [
  {
    name: "reading_get_manifest",
    description: "co-reading-kit compatible manifest view. Reads manifest metadata and optional chunk map only, not chunk bodies.",
    inputSchema: {
      type: "object",
      required: ["bookId"],
      properties: {
        bookId: { type: "string" },
        includeChunks: { type: "boolean" },
        includeChunkPreview: { type: "boolean" },
        maxChunks: { type: "number" }
      },
      additionalProperties: false
    },
    annotations: { title: "Get Manifest", readOnlyHint: true }
  },
  {
    name: "reading_get_chunk",
    description: "co-reading-kit compatible chunk reader. Returns the original chunk body plus prev/next navigation fields.",
    inputSchema: {
      type: "object",
      required: ["bookId", "chunkId"],
      properties: { bookId: { type: "string" }, chunkId: { type: "string" } },
      additionalProperties: false
    },
    annotations: { title: "Get Chunk", readOnlyHint: true }
  },
  {
    name: "reading_search",
    description: "co-reading-kit compatible keyword search over chunks.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: { bookId: { type: "string" }, query: { type: "string" }, limit: { type: "number" } },
      additionalProperties: false
    },
    annotations: { title: "Search", readOnlyHint: true }
  },
  {
    name: "reading_search_exact",
    description: "co-reading-kit compatible exact quote/highlight search. Scans chunks and also tolerates whitespace/newline differences.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: { bookId: { type: "string" }, query: { type: "string" }, limit: { type: "number" } },
      additionalProperties: false
    },
    annotations: { title: "Search Exact", readOnlyHint: true }
  },
  {
    name: "reading_resume_book",
    description: "co-reading-kit compatible resume wrapper over current reading progress.",
    inputSchema: {
      type: "object",
      properties: { bookId: { type: "string" }, readChunk: { type: "boolean" } },
      additionalProperties: false
    },
    annotations: { title: "Resume Book", readOnlyHint: true }
  },
  {
    name: "reading_update_progress",
    description: "co-reading-kit compatible progress writer. Stores progress metadata and marks the last chunk as read.",
    inputSchema: {
      type: "object",
      required: ["bookId"],
      properties: {
        bookId: { type: "string" },
        title: { type: "string" },
        lastChunkId: { type: "string" },
        chunkId: { type: "string" },
        nextChunkId: { type: "string" },
        lastPath: { type: "string" },
        nextPath: { type: "string" },
        lastSectionTitle: { type: "string" },
        currentThemes: { type: "array", items: { type: "string" } },
        status: { type: "string" }
      },
      additionalProperties: true
    },
    annotations: { title: "Update Progress" }
  },
  {
    name: "reading_update_note",
    description: "co-reading-kit compatible long-term note appender under data/notes.",
    inputSchema: {
      type: "object",
      required: ["bookId", "appendContent"],
      properties: {
        bookId: { type: "string" },
        title: { type: "string" },
        appendSection: { type: "string" },
        appendHeading: { type: "string" },
        appendContent: { type: "string" }
      },
      additionalProperties: false
    },
    annotations: { title: "Update Note" }
  },
  {
    name: "reading_read_note",
    description: "co-reading-kit compatible long-term note reader under data/notes.",
    inputSchema: {
      type: "object",
      required: ["bookId"],
      properties: { bookId: { type: "string" }, section: { type: "string" } },
      additionalProperties: false
    },
    annotations: { title: "Read Note", readOnlyHint: true }
  },
  {
    name: "reading_build_index",
    description: "co-reading-kit compatible no-op index builder. Upstream search scans chunks automatically; this validates chunk readability.",
    inputSchema: {
      type: "object",
      required: ["bookId"],
      properties: { bookId: { type: "string" }, force: { type: "boolean" } },
      additionalProperties: false
    },
    annotations: { title: "Build Index" }
  }
];

const LOCAL_USER_NOTE_TOOLS = [
  {
    name: "user_note_create",
    description: "Create a human private/open note anchored to a quote in the current chunk. It is hidden from default annotation listing until submitted.",
    inputSchema: {
      type: "object",
      required: ["bookId", "chunkId", "quote", "note"],
      properties: {
        bookId: { type: "string" },
        chunkId: { type: "string" },
        quote: { type: "string" },
        quoteOffset: { type: "number" },
        note: { type: "string" },
        kind: { type: "string" },
        mood: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        status: { type: "string", enum: ["open", "private", "draft"] }
      },
      additionalProperties: false
    },
    annotations: { title: "Create User Note" }
  },
  {
    name: "user_note_list",
    description: "List human notes including private/open/draft/submitted notes for a trusted local sidecar.",
    inputSchema: {
      type: "object",
      properties: {
        bookId: { type: "string" },
        chunkId: { type: "string" },
        kind: { type: "string" },
        status: { type: "string" },
        limit: { type: "number" }
      },
      additionalProperties: false
    },
    annotations: { title: "List User Notes", readOnlyHint: true }
  },
  {
    name: "user_note_delete",
    description: "Delete one annotation/user note by id, regardless of author. Replies under it are removed as well.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" }
      },
      additionalProperties: false
    },
    annotations: { title: "Delete User Note", destructiveHint: true }
  }
];

const LOCAL_TOOLS = [
  ...LOCAL_IMPORT_TOOLS,
  ...LOCAL_PLAN_TOOLS,
  ...LOCAL_REVIEW_TOOLS,
  ...LOCAL_SINK_TOOLS,
  ...LOCAL_ILLUSTRATION_TOOLS,
  ...LOCAL_WEREAD_TOOLS,
  ...LOCAL_COMPAT_TOOLS,
  ...LOCAL_USER_NOTE_TOOLS
];
const LOCAL_COMMANDS = new Set(LOCAL_TOOLS.map((tool) => tool.name));
const EXECUTABLE_PLAN_STEP_TYPES = new Set(["read_range", "review_range", "search_interest"]);

function emit(payload) {
  process.stdout.write(JSON.stringify(payload));
}

function fail(message, details) {
  const payload = { status: "error", error: `CoReadingMCP Error: ${message}` };
  if (details !== undefined) payload.details = details;
  emit(payload);
  process.exit(0);
}

function readStdin() {
  return new Promise((resolve) => {
    let input = "";
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("end", () => resolve(input.replace(/^\uFEFF/, "")));
  });
}

function parsePayload(raw) {
  if (!raw || !raw.trim()) fail("未从 stdin 接收到 JSON 输入。");
  try {
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      fail("输入必须是 JSON 对象。");
    }
    return payload;
  } catch (error) {
    fail(`无法解析 JSON 输入: ${error.message}`);
  }
}

function normalizeCommand(payload) {
  const raw = String(payload.command || payload.tool || payload.action || "list_books").trim();
  if (!raw) return "reading_list_books";
  const normalized = raw.replace(/-/g, "_");
  // 先查找别名表（包括 reading_ 开头的命令）
  const aliased = COMMAND_ALIASES[normalized.toLowerCase()];
  if (aliased) return aliased;
  // 如果没有别名，以 reading_ 开头的命令直接返回
  if (normalized.startsWith("reading_")) return normalized;
  return normalized;
}

function compactTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/u, "");
}

function shortRandomId() {
  return crypto.randomBytes(4).toString("hex");
}

const BOOLEAN_KEYS = new Set([
  "confirm",
  "overwrite",
  "includeContext",
  "forceChunkContext",
  "claim",
  "completeIfDone",
  "includeReview",
  "requireApproval",
  "markRead",
  "createReview",
  "createSinkPreview",
  "createPlan",
  "force",
  "confirmApply",
  "confirmRefresh",
  "includeChunks",
  "includeChunkPreview",
  "readChunk"
]);
const NUMBER_KEYS = new Set([
  "limit",
  "offset",
  "maxChars",
  "minSectionChars",
  "expectedBytes",
  "index",
  "quoteOffset",
  "searchLimit",
  "before",
  "after",
  "maxRanges",
  "mergeGap",
  "maxSnapshots",
  "maxChunks"
]);
const JSON_KEYS = new Set([
  "tags",
  "scope",
  "budget",
  "sinkPolicy",
  "steps",
  "result",
  "patch",
  "artifacts",
  "metadata",
  "chunkIds",
  "targets",
  "observations",
  "questions",
  "quotes",
  "nextActions",
  "chosenChunkIds"
]);

function coerceValue(key, value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (BOOLEAN_KEYS.has(key)) {
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
  }
  if (NUMBER_KEYS.has(key) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  if (JSON_KEYS.has(key)) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

function buildArguments(payload) {
  const args = {};
  const actionUsedAsCommand = !payload.command && !payload.tool;
  for (const [key, value] of Object.entries(payload)) {
    if (["command", "tool"].includes(key)) continue;
    if (key === "action" && actionUsedAsCommand) continue;
    args[key] = coerceValue(key, value);
  }
  return args;
}

function ensureRuntimeEnv() {
  const vendorDir = path.resolve(process.env.CO_READING_VENDOR_DIR || DEFAULT_VENDOR_DIR);
  const dataDir = path.resolve(process.env.CO_READING_DATA_DIR || process.env.READING_MCP_DATA_DIR || DEFAULT_DATA_DIR);
  if (!fs.existsSync(path.join(vendorDir, "src", "server.js"))) {
    fail(`未找到 co-reading-mcp vendor 源码: ${vendorDir}`);
  }
  fs.mkdirSync(dataDir, { recursive: true });
  process.env.READING_MCP_DATA_DIR = dataDir;
  process.env.READING_IMPORT_MAX_BYTES = process.env.READING_IMPORT_MAX_BYTES || "100000000";
  return { vendorDir, dataDir };
}

function resolveInside(rootDir, ...parts) {
  const root = path.resolve(rootDir);
  const target = path.resolve(root, ...parts);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    fail(`路径越界: ${target}`);
  }
  return target;
}

function readJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    fail(`无法读取 JSON 文件: ${filePath}`, error.message);
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function plansPath(dataDir) {
  return path.join(dataDir, "reading_plans.json");
}

function planRunLockPath(dataDir, planId) {
  const safePlanId = String(planId || "unknown").replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(dataDir, "locks", `${safePlanId}.run.lock`);
}

function reviewsPath(dataDir) {
  return path.join(dataDir, "reading_reviews.json");
}

function sinkPreviewsPath(dataDir) {
  return path.join(dataDir, "sink_previews.json");
}

function illustrationsPath(dataDir) {
  return path.join(dataDir, "illustrations.json");
}

function vaultSnapshotsPath(dataDir) {
  return path.join(dataDir, "obsidian_vault_snapshots.json");
}

function vaultIndexesPath(dataDir) {
  return path.join(dataDir, "obsidian_vault_indexes.json");
}

function loadPlanStore(dataDir) {
  const store = readJsonFile(plansPath(dataDir), { version: 1, plans: [] });
  store.version ||= 1;
  store.plans = Array.isArray(store.plans) ? store.plans : [];
  return store;
}

function savePlanStore(dataDir, store) {
  store.updatedAt = new Date().toISOString();
  writeJsonFile(plansPath(dataDir), store);
}

function appendPlanHistory(dataDir, planId, event) {
  const store = loadPlanStore(dataDir);
  const plan = findPlan(store, planId);
  plan.history ||= [];
  plan.history.push({ at: new Date().toISOString(), ...event });
  plan.updatedAt = new Date().toISOString();
  savePlanStore(dataDir, store);
  return plan;
}

function acquirePlanRunLock(dataDir, planId, args) {
  const lockPath = planRunLockPath(dataDir, planId);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const lockTtlMs = Math.max(5_000, Number(args.lockTtlMs || 30 * 60 * 1000));
  const now = Date.now();
  if (fs.existsSync(lockPath)) {
    const existing = readJsonFile(lockPath, null);
    const ageMs = existing?.createdAtMs ? now - Number(existing.createdAtMs) : Number.POSITIVE_INFINITY;
    if (args.forceLock !== true && ageMs < lockTtlMs) {
      return { acquired: false, lockPath, existing, ageMs, stale: false };
    }
    try {
      fs.unlinkSync(lockPath);
    } catch (error) {
      fail(`无法清理过期 runner lock: ${lockPath}`, error.message);
    }
  }
  const lock = {
    planId,
    pid: process.pid,
    createdAt: new Date(now).toISOString(),
    createdAtMs: now,
    by: args.createdBy || "plan_run"
  };
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return { acquired: true, lockPath, lock };
}

function releasePlanRunLock(lock) {
  if (!lock?.acquired || !lock.lockPath) return;
  try {
    if (fs.existsSync(lock.lockPath)) fs.unlinkSync(lock.lockPath);
  } catch {
    // Best-effort cleanup; a stale lock can be overridden by lockTtlMs/forceLock.
  }
}

function loadReviewStore(dataDir) {
  const store = readJsonFile(reviewsPath(dataDir), { version: 1, reviews: [] });
  store.version ||= 1;
  store.reviews = Array.isArray(store.reviews) ? store.reviews : [];
  return store;
}

function saveReviewStore(dataDir, store) {
  store.updatedAt = new Date().toISOString();
  writeJsonFile(reviewsPath(dataDir), store);
}

function loadSinkPreviewStore(dataDir) {
  const store = readJsonFile(sinkPreviewsPath(dataDir), { version: 1, previews: [] });
  store.version ||= 1;
  store.previews = Array.isArray(store.previews) ? store.previews : [];
  return store;
}

function saveSinkPreviewStore(dataDir, store) {
  store.updatedAt = new Date().toISOString();
  writeJsonFile(sinkPreviewsPath(dataDir), store);
}

function loadIllustrationStore(dataDir) {
  const store = readJsonFile(illustrationsPath(dataDir), { version: 1, illustrations: [] });
  store.version ||= 1;
  store.illustrations = Array.isArray(store.illustrations) ? store.illustrations : [];
  return store;
}

function saveIllustrationStore(dataDir, store) {
  store.updatedAt = new Date().toISOString();
  writeJsonFile(illustrationsPath(dataDir), store);
}

function loadVaultSnapshotStore(dataDir) {
  const store = readJsonFile(vaultSnapshotsPath(dataDir), { version: 1, snapshots: [] });
  store.version ||= 1;
  store.snapshots = Array.isArray(store.snapshots) ? store.snapshots : [];
  return store;
}

function saveVaultSnapshotStore(dataDir, store) {
  store.updatedAt = new Date().toISOString();
  writeJsonFile(vaultSnapshotsPath(dataDir), store);
}

function loadVaultIndexStore(dataDir) {
  const store = readJsonFile(vaultIndexesPath(dataDir), { version: 1, indexes: [] });
  store.version ||= 1;
  store.indexes = Array.isArray(store.indexes) ? store.indexes : [];
  return store;
}

function saveVaultIndexStore(dataDir, store) {
  store.updatedAt = new Date().toISOString();
  writeJsonFile(vaultIndexesPath(dataDir), store);
}

function loadManifest(dataDir, bookId) {
  if (!bookId || typeof bookId !== "string") fail("bookId 是必需参数。");
  const manifestPath = resolveInside(dataDir, "books", bookId, "manifest.json");
  if (!fs.existsSync(manifestPath)) fail(`未找到书籍 manifest: ${bookId}`);
  const manifest = readJsonFile(manifestPath, null);
  if (!manifest || !Array.isArray(manifest.chunks)) fail(`书籍 manifest 缺少 chunks: ${bookId}`);
  return {
    ...manifest,
    chunks: manifest.chunks.slice().sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
  };
}

function compactChunk(chunk) {
  return {
    id: chunk.id,
    title: chunk.title || chunk.id,
    sectionTitle: chunk.sectionTitle || null,
    order: Number(chunk.order || 0),
    charCount: Number(chunk.charCount || 0),
    wordCount: Number(chunk.wordCount || 0)
  };
}

function readChunkText(dataDir, manifest, chunk) {
  const chunkPath = resolveInside(dataDir, "books", manifest.bookId, chunk.path || "");
  if (!fs.existsSync(chunkPath)) fail(`未找到 chunk 文件: ${chunk.path || chunk.id}`);
  return fs.readFileSync(chunkPath, "utf8");
}

function normalizeWhitespaceText(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/gu, "").toLocaleLowerCase();
}

function mapNormalizedOffset(text, normalizedOffset) {
  let normalizedIndex = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (/\s/u.test(text[index])) continue;
    if (normalizedIndex === normalizedOffset) return index;
    normalizedIndex += 1;
  }
  return -1;
}

function snippetAround(text, offset, length, before = 80, after = 120) {
  const start = Math.max(0, offset - before);
  const end = Math.min(text.length, offset + length + after);
  return text.slice(start, end).replace(/\s+/gu, " ").trim();
}

function findTextMatch(text, query, { exact = false } = {}) {
  const haystack = exact ? text : text.toLocaleLowerCase();
  const needle = exact ? String(query || "") : String(query || "").toLocaleLowerCase();
  let offset = haystack.indexOf(needle);
  if (offset >= 0) return { offset, length: String(query || "").length, matchType: exact ? "exact" : "keyword" };

  const normalizedQuery = normalizeWhitespaceText(query);
  if (!normalizedQuery) return null;
  const normalizedText = normalizeWhitespaceText(text);
  const normalizedOffset = normalizedText.indexOf(normalizedQuery);
  if (normalizedOffset < 0) return null;
  offset = mapNormalizedOffset(text, normalizedOffset);
  return {
    offset,
    length: Math.max(1, String(query || "").length),
    matchType: exact ? "normalized_exact" : "normalized_keyword"
  };
}

function notesPath(dataDir, bookId) {
  const safeName = String(bookId || "book").replace(/[\\/:*?"<>|\0]+/g, "_").slice(0, 120) || "book";
  return resolveInside(dataDir, "notes", `${safeName}.md`);
}

function progressPath(dataDir) {
  return resolveInside(dataDir, "progress.json");
}

function resolveBookIds(dataDir, requestedBookId) {
  if (requestedBookId) return [requestedBookId];
  const booksDir = resolveInside(dataDir, "books");
  if (!fs.existsSync(booksDir)) return [];
  return fs.readdirSync(booksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function resolveChunkWithIndex(manifest, chunkId) {
  const index = manifest.chunks.findIndex((item) => item.id === chunkId);
  if (index < 0) fail(`未知 chunkId: ${chunkId}`);
  const chunk = manifest.chunks[index];
  return {
    chunk,
    index,
    prevId: chunk.prevId || manifest.chunks[index - 1]?.id || null,
    nextId: chunk.nextId || manifest.chunks[index + 1]?.id || null
  };
}

function compatSearchMatch({ manifest, chunk, text, query, exact, includeFullText }) {
  const match = findTextMatch(text, query, { exact });
  if (!match) return null;
  const context = snippetAround(text, match.offset, match.length);
  return {
    bookId: manifest.bookId,
    bookTitle: manifest.title || manifest.bookId,
    chunkId: chunk.id,
    chunkTitle: chunk.title || chunk.id,
    title: chunk.title || chunk.id,
    quote: String(query || ""),
    quoteOffset: match.offset,
    offset: match.offset,
    length: match.length,
    matchType: match.matchType,
    context,
    snippet: context,
    fullText: includeFullText ? text : undefined,
    navigation: { prevId: chunk.prevId || null, nextId: chunk.nextId || null }
  };
}

function extractMarkdownSection(content, section) {
  if (!section) return String(content || "");
  const escaped = escapeRegExp(section);
  const heading = new RegExp(`^(#{1,6})\\s+${escaped}\\s*$`, "m").exec(String(content || ""));
  if (!heading) return "";
  const level = heading[1].length;
  const rest = String(content || "").slice(heading.index + heading[0].length);
  const next = new RegExp(`^#{1,${level}}\\s+`, "m").exec(rest);
  return rest.slice(0, next ? next.index : undefined).trim();
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeObjectArray(value, textKey = "text") {
  return normalizeArray(value)
    .map((item) => {
      if (typeof item === "string") return { [textKey]: item.slice(0, 2000) };
      if (!item || typeof item !== "object") return null;
      return item;
    })
    .filter(Boolean);
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function markdownSection(markdown, heading, nextHeadings = []) {
  const escaped = escapeRegExp(heading);
  const start = new RegExp(`^##\\s+${escaped}\\s*$`, "m").exec(String(markdown || ""));
  if (!start) return "";
  const afterHeading = start.index + start[0].length;
  const rest = String(markdown || "").slice(afterHeading);
  const nextPattern = nextHeadings.length
    ? new RegExp(`^##\\s+(?:${nextHeadings.map(escapeRegExp).join("|")})\\s*$`, "m")
    : /^##\s+/m;
  const next = nextPattern.exec(rest);
  return rest.slice(0, next ? next.index : undefined).trim();
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

function computeCriticalSinkRemovals(original, current) {
  const fields = [
    { field: "来源原文", heading: "来源原文", next: ["我的笔记与边注", "Nova 回应", "阅读卡片", "其他观察", "引文与锚点", "问题", "下一步"] },
    { field: "引文锚点", heading: "引文与锚点", next: ["问题", "下一步"] },
  ];
  return fields.map((field) => {
    const before = markdownSection(original, field.heading, field.next);
    const after = markdownSection(current, field.heading, field.next);
    const { added, removed } = lineMultisetDiff(before.split(/\r?\n/), after.split(/\r?\n/));
    return {
      ...field,
      removedLineCount: removed.filter((line) => line.trim()).length,
      addedLineCount: added.filter((line) => line.trim()).length,
    };
  }).filter((field) => field.removedLineCount > 0);
}

function assertCriticalRemovalsMatch(original, current, reportedRemovals) {
  const expected = computeCriticalSinkRemovals(original, current);
  if (!expected.length) return [];
  const reported = new Map(normalizeObjectArray(reportedRemovals).map((item) => [String(item.field || item.label || ""), item]));
  const mismatches = expected.filter((item) => {
    const seen = reported.get(item.field);
    return !seen
      || Number(seen.removedLineCount || 0) !== item.removedLineCount
      || (seen.heading && String(seen.heading) !== item.heading);
  });
  if (mismatches.length) {
    fail("criticalRemovals 与实际关键字段删除不一致。", { expected, reported: normalizeObjectArray(reportedRemovals) });
  }
  return expected;
}

function slugPart(value) {
  return String(value || "plan")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "plan";
}

function createPlanId(bookId) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8);
  return `plan-${slugPart(bookId)}-${stamp}-${random}`;
}

function createArtifactId(prefix, source) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${slugPart(source)}-${stamp}-${random}`;
}

function normalizeBudget(input) {
  const budget = input && typeof input === "object" ? input : {};
  const maxChunksPerStep = Number(budget.maxChunksPerStep || budget.stepChunkCount || 3);
  const maxSteps = Number(budget.maxSteps || 0);
  return {
    maxChunksPerStep: Number.isFinite(maxChunksPerStep) && maxChunksPerStep > 0 ? Math.min(Math.floor(maxChunksPerStep), 20) : 3,
    maxSteps: Number.isFinite(maxSteps) && maxSteps > 0 ? Math.floor(maxSteps) : null,
    maxAnnotationsPerChunk: Number.isFinite(Number(budget.maxAnnotationsPerChunk))
      ? Math.max(0, Math.floor(Number(budget.maxAnnotationsPerChunk)))
      : 2,
    maxCharsPerStep: Number.isFinite(Number(budget.maxCharsPerStep)) ? Math.max(0, Math.floor(Number(budget.maxCharsPerStep))) : null,
    stopAfterEachStep: budget.stopAfterEachStep !== false
  };
}

function normalizeSinkPolicy(input) {
  const sinkPolicy = input && typeof input === "object" ? input : {};
  return {
    requireApproval: sinkPolicy.requireApproval !== false,
    obsidian: sinkPolicy.obsidian === true,
    obs: sinkPolicy.obs === true,
    dailyNote: sinkPolicy.dailyNote === true,
    vcpMemory: sinkPolicy.vcpMemory === true,
    rawText: sinkPolicy.rawText === true ? "forbidden-by-default" : "never",
    note: sinkPolicy.note || "Only curated reviews, cards, and anchored notes should be sunk."
  };
}

function buildScope(args) {
  const source = args.scope && typeof args.scope === "object" ? { ...args.scope } : {};
  if (args.startChunkId) source.startChunkId = args.startChunkId;
  if (args.endChunkId) source.endChunkId = args.endChunkId;
  if (args.query) source.query = args.query;
  const chunkIds = normalizeArray(args.chunkIds || source.chunkIds);
  if (chunkIds.length) source.chunkIds = chunkIds;
  source.type ||= chunkIds.length ? "chunks" : source.query ? "interest" : args.mode === "full_book" ? "full_book" : "range";
  return source;
}

function selectChunks(manifest, scope) {
  const chunks = manifest.chunks;
  const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const explicitIds = normalizeArray(scope.chunkIds);
  if (explicitIds.length) {
    const missing = explicitIds.filter((chunkId) => !chunkById.has(chunkId));
    if (missing.length) fail(`scope.chunkIds 包含未知 chunkId: ${missing.join(", ")}`);
    return explicitIds.map((chunkId) => chunkById.get(chunkId));
  }

  if (scope.sectionTitle) {
    const selected = chunks.filter((chunk) => chunk.sectionTitle === scope.sectionTitle);
    if (!selected.length) fail(`未找到 sectionTitle 对应分块: ${scope.sectionTitle}`);
    return selected;
  }

  if (scope.startChunkId || scope.endChunkId) {
    const startIndex = scope.startChunkId ? chunks.findIndex((chunk) => chunk.id === scope.startChunkId) : 0;
    const endIndex = scope.endChunkId ? chunks.findIndex((chunk) => chunk.id === scope.endChunkId) : chunks.length - 1;
    if (startIndex < 0) fail(`未知 startChunkId: ${scope.startChunkId}`);
    if (endIndex < 0) fail(`未知 endChunkId: ${scope.endChunkId}`);
    if (endIndex < startIndex) fail("endChunkId 不能位于 startChunkId 之前。");
    return chunks.slice(startIndex, endIndex + 1);
  }

  if (scope.type === "interest") return [];
  return chunks;
}

function chunkGroups(chunks, size, maxSteps) {
  const groups = [];
  for (let index = 0; index < chunks.length; index += size) {
    groups.push(chunks.slice(index, index + size));
    if (maxSteps && groups.length >= maxSteps) break;
  }
  return groups;
}

function makeStepId(index) {
  return `step-${String(index + 1).padStart(3, "0")}`;
}

function chunkIndexById(manifest, chunkId) {
  const index = manifest.chunks.findIndex((chunk) => chunk.id === chunkId);
  if (index < 0) fail(`未知 chunkId: ${chunkId}`);
  return index;
}

function expandChunkRange(manifest, anchorChunkId, before, after) {
  const anchorIndex = chunkIndexById(manifest, anchorChunkId);
  const startIndex = Math.max(0, anchorIndex - before);
  const endIndex = Math.min(manifest.chunks.length - 1, anchorIndex + after);
  const chunks = manifest.chunks.slice(startIndex, endIndex + 1);
  return {
    anchorChunkId,
    startChunkId: chunks[0].id,
    endChunkId: chunks[chunks.length - 1].id,
    startOrder: Number(chunks[0].order || startIndex),
    endOrder: Number(chunks[chunks.length - 1].order || endIndex),
    chunkIds: chunks.map((chunk) => chunk.id),
    chunks: chunks.map(compactChunk)
  };
}

function mergeBacktrackRanges(ranges, mergeGap) {
  const sorted = ranges.slice().sort((a, b) => a.startOrder - b.startOrder || a.endOrder - b.endOrder);
  const merged = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || range.startOrder > previous.endOrder + mergeGap + 1) {
      merged.push({ ...range, anchors: [...range.anchors] });
      continue;
    }
    const ids = new Set([...previous.chunkIds, ...range.chunkIds]);
    if (range.endOrder > previous.endOrder) {
      previous.endOrder = range.endOrder;
      previous.endChunkId = range.endChunkId;
    }
    previous.chunkIds = manifestOrderIds(ids, previous.chunks, range.chunks);
    previous.chunks = [...previous.chunks, ...range.chunks.filter((chunk) => !previous.chunks.some((item) => item.id === chunk.id))].sort(
      (a, b) => a.order - b.order
    );
    previous.anchors.push(...range.anchors);
  }
  return merged;
}

function backtrackAnchorLabel(anchor) {
  const parts = [anchor.chunkId];
  if (anchor.title) parts.push(anchor.title);
  if (anchor.offset !== null && anchor.offset !== undefined) parts.push(`offset ${anchor.offset}`);
  return parts.filter(Boolean).join(" · ");
}

function buildBacktrackEvidence(manifest, args, anchors, ranges, chunkIds, window) {
  const title = args.query
    ? `兴趣点回溯: ${args.query}`
    : `兴趣点回溯: ${args.anchorChunkId || manifest.bookId}`;
  const rangeSummaries = ranges.map((range, index) => ({
    index: index + 1,
    startChunkId: range.startChunkId,
    endChunkId: range.endChunkId,
    chunkIds: range.chunkIds,
    anchorChunkIds: range.anchors.map((anchor) => anchor.chunkId),
    label: `${range.startChunkId} -> ${range.endChunkId}`,
    chunkTitles: range.chunks.map((chunk) => `${chunk.id}: ${chunk.title || chunk.sectionTitle || "untitled"}`)
  }));
  const anchorSnippets = anchors.map((anchor) => ({
    chunkId: anchor.chunkId,
    title: anchor.title,
    source: anchor.source,
    offset: anchor.offset,
    snippet: anchor.snippet
  }));
  const markdownLines = [
    `# ${title}`,
    "",
    `- 书籍: ${manifest.title || manifest.bookId}`,
    `- 查询: ${args.query || "无"}`,
    `- 锚点: ${args.anchorChunkId || "无"}`,
    `- 范围窗口: before ${window.before}, after ${window.after}, mergeGap ${window.mergeGap}`,
    `- 命中锚点: ${anchors.length}`,
    `- 回溯范围: ${ranges.length}`,
    `- 覆盖 chunk: ${chunkIds.join(", ") || "无"}`,
    "",
    "## 命中锚点",
    "",
    ...(
      anchorSnippets.length
        ? anchorSnippets.flatMap((anchor) => [
            `- ${backtrackAnchorLabel(anchor)}`,
            anchor.snippet ? `  - 摘录: ${anchor.snippet}` : ""
          ].filter(Boolean))
        : ["- 暂无"]
    ),
    "",
    "## 回溯范围",
    "",
    ...(
      rangeSummaries.length
        ? rangeSummaries.flatMap((range) => [
            `### ${range.index}. ${range.label}`,
            "",
            `- 锚点 chunk: ${range.anchorChunkIds.join(", ")}`,
            `- 覆盖 chunk: ${range.chunkIds.join(", ")}`,
            "",
            ...range.chunkTitles.map((line) => `- ${line}`)
          ])
        : ["- 暂无"]
    ),
    "",
    "## Nova 复读提示",
    "",
    "- 只基于上述 bounded ranges 继续阅读，不向未读后文跳跃。",
    "- 对每个锚点说明它为什么值得回溯，必要时创建更窄的后续计划。",
    "- 若要沉淀到 Obsidian，先把本 evidence 作为 proposed update，等待人工确认。"
  ];
  return {
    title,
    rangeSummaries,
    anchorSnippets,
    markdown: markdownLines.join("\n").replace(/\n{3,}/g, "\n\n")
  };
}

function manifestOrderIds(idSet, ...chunkLists) {
  return chunkLists
    .flat()
    .filter((chunk) => idSet.has(chunk.id))
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
    .map((chunk) => chunk.id)
    .filter((id, index, ids) => ids.indexOf(id) === index);
}

function makeReadStep(group, index, plan) {
  const first = group[0];
  const last = group[group.length - 1];
  return {
    stepId: makeStepId(index),
    order: index,
    type: "read_range",
    status: "pending",
    bookId: plan.bookId,
    title: group.length === 1 ? `阅读 ${first.title || first.id}` : `阅读 ${first.id} 到 ${last.id}`,
    intent: "Read this bounded range with restraint, write anchored notes only where they earn their place, then mark chunks read.",
    chunkIds: group.map((chunk) => chunk.id),
    range: {
      startChunkId: first.id,
      endChunkId: last.id,
      startOrder: Number(first.order || 0),
      endOrder: Number(last.order || 0)
    },
    chunks: group.map(compactChunk),
    annotationDensity: plan.annotationDensity,
    budget: {
      maxAnnotationsPerChunk: plan.budget.maxAnnotationsPerChunk,
      maxCharsPerStep: plan.budget.maxCharsPerStep
    },
    sinkPolicy: plan.sinkPolicy
  };
}

function makeSearchStep(scope, index, plan) {
  return {
    stepId: makeStepId(index),
    order: index,
    type: "search_interest",
    status: "pending",
    bookId: plan.bookId,
    title: `追踪兴趣线索: ${scope.query}`,
    intent: "Search the book for this motif/topic, then choose the most promising source ranges for follow-up reading.",
    query: scope.query,
    limit: Number(scope.limit || 10),
    sinkPolicy: plan.sinkPolicy
  };
}

function makeReviewStep(chunks, index, plan) {
  const first = chunks[0];
  const last = chunks[chunks.length - 1];
  return {
    stepId: makeStepId(index),
    order: index,
    type: "review_range",
    status: "pending",
    bookId: plan.bookId,
    title: chunks.length ? `写范围评价 ${first.id} 到 ${last.id}` : "写兴趣线索阶段评价",
    intent: "Write a sourced range review with key observations, questions, and sink-ready artifacts.",
    chunkIds: chunks.map((chunk) => chunk.id),
    range: chunks.length
      ? {
          startChunkId: first.id,
          endChunkId: last.id,
          startOrder: Number(first.order || 0),
          endOrder: Number(last.order || 0)
        }
      : null,
    sinkPolicy: plan.sinkPolicy
  };
}

function buildPlanSteps(manifest, scope, plan) {
  if (Array.isArray(plan.steps) && plan.steps.length) {
    return plan.steps.map((step, index) => ({
      ...step,
      stepId: step.stepId || makeStepId(index),
      order: Number.isFinite(Number(step.order)) ? Number(step.order) : index,
      status: step.status || "pending",
      bookId: step.bookId || plan.bookId
    }));
  }

  const selectedChunks = selectChunks(manifest, scope);
  const steps = [];
  if (plan.mode === "interest_trail" || scope.type === "interest") {
    if (!scope.query) fail("interest_trail 计划必须提供 query。");
    steps.push(makeSearchStep(scope, steps.length, plan));
  }

  for (const group of chunkGroups(selectedChunks, plan.budget.maxChunksPerStep, plan.budget.maxSteps)) {
    steps.push(makeReadStep(group, steps.length, plan));
  }

  if (selectedChunks.length && plan.includeReview !== false) {
    steps.push(makeReviewStep(selectedChunks, steps.length, plan));
  }

  if (!steps.length) fail("无法从当前 scope 生成任何计划步骤。");
  return steps;
}

function summarizePlan(plan) {
  const statusCounts = plan.steps.reduce((acc, step) => {
    acc[step.status] = (acc[step.status] || 0) + 1;
    return acc;
  }, {});
  return {
    planId: plan.planId,
    title: plan.title,
    bookId: plan.bookId,
    bookTitle: plan.bookTitle,
    mode: plan.mode,
    status: plan.status,
    currentStepIndex: plan.currentStepIndex,
    stepCount: plan.steps.length,
    statusCounts,
    annotationDensity: plan.annotationDensity,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt
  };
}

function findPlan(store, planId) {
  const plan = store.plans.find((item) => item.planId === planId);
  if (!plan) fail(`未找到阅读计划: ${planId}`);
  return plan;
}

function nextPendingStep(plan) {
  const startIndex = Number.isInteger(plan.currentStepIndex) ? Math.max(0, plan.currentStepIndex) : 0;
  return (
    plan.steps.find((step, index) => index >= startIndex && !["done", "skipped", "cancelled"].includes(step.status)) ||
    plan.steps.find((step) => !["done", "skipped", "cancelled"].includes(step.status)) ||
    null
  );
}

function validateExecutableStepForRunner(step) {
  if (!step) return;
  if (!EXECUTABLE_PLAN_STEP_TYPES.has(step.type)) {
    throw new Error(`plan_run 暂不支持步骤类型: ${step.type}`);
  }
  if ((step.type === "read_range" || step.type === "review_range") && !normalizeArray(step.chunkIds).length) {
    throw new Error(`计划步骤 ${step.stepId} 缺少 chunkIds。`);
  }
  if (step.type === "search_interest" && !step.query) {
    throw new Error(`计划步骤 ${step.stepId} 缺少 query。`);
  }
}

function suggestedCommandsForStep(step) {
  if (step.type === "read_range") {
    const reads = step.chunkIds.map((chunkId) => ({ command: "read_chunk", bookId: step.bookId, chunkId }));
    const marks = step.chunkIds.map((chunkId) => ({ command: "mark_read", bookId: step.bookId, chunkId }));
    return [
      ...reads,
      {
        command: "annotate",
        bookId: step.bookId,
        chunkId: step.chunkIds[0],
        quote: "<原文短句>",
        note: "<Nova 边注>",
        kind: "margin",
        tags: ["co-reading"]
      },
      ...marks,
      { command: "plan_record_step", planId: "<planId>", stepId: step.stepId, status: "done", result: { summary: "<本步读后记录>" } }
    ];
  }

  if (step.type === "search_interest") {
    return [
      { command: "search", bookId: step.bookId, query: step.query, limit: step.limit || 10 },
      { command: "plan_record_step", planId: "<planId>", stepId: step.stepId, status: "done", result: { chosenChunkIds: [] } }
    ];
  }

  if (step.type === "review_range") {
    return [
      { command: "list_annotations", bookId: step.bookId },
      { command: "progress", bookId: step.bookId },
      {
        command: "review_create",
        bookId: step.bookId,
        planId: "<planId>",
        stepId: step.stepId,
        chunkIds: step.chunkIds,
        summary: "<章节/范围评价>",
        observations: [],
        questions: [],
        tags: ["co-reading"]
      },
      { command: "sink_preview_create", reviewId: "<reviewId>", targets: ["obsidian", "dailyNote"], requireApproval: true },
      { command: "plan_record_step", planId: "<planId>", stepId: step.stepId, status: "done", result: { reviewId: "<reviewId>" } }
    ];
  }

  return [{ command: "plan_record_step", planId: "<planId>", stepId: step.stepId, status: "done" }];
}

function formatLocalResult(command, result, dataDir) {
  return [
    "## CoReadingMCP 执行结果",
    "",
    `- 命令: \`${command}\``,
    `- 数据目录: \`${dataDir}\``,
    "",
    "```json",
    truncate(JSON.stringify(result, null, 2)),
    "```"
  ].join("\n");
}

function handlePlanCreate(args, dataDir) {
  const manifest = loadManifest(dataDir, args.bookId);
  const now = new Date().toISOString();
  const scope = buildScope(args);
  const plan = {
    planId: args.planId || createPlanId(manifest.bookId),
    bookId: manifest.bookId,
    bookTitle: manifest.title || manifest.bookId,
    bookAuthor: manifest.author || null,
    title: args.title || `${manifest.title || manifest.bookId} 共读计划`,
    mode: args.mode || (scope.type === "interest" ? "interest_trail" : scope.type === "full_book" ? "full_book" : "range"),
    status: "active",
    scope,
    budget: normalizeBudget(args.budget),
    annotationDensity: args.annotationDensity || "medium",
    sinkPolicy: normalizeSinkPolicy(args.sinkPolicy),
    includeReview: args.includeReview,
    createdBy: args.createdBy || "nova",
    createdAt: now,
    updatedAt: now,
    currentStepIndex: 0,
    steps: Array.isArray(args.steps) ? args.steps : null,
    history: [
      {
        at: now,
        event: "created",
        by: args.createdBy || "nova"
      }
    ]
  };
  plan.steps = buildPlanSteps(manifest, scope, plan);
  plan.summary = {
    chunkCount: manifest.chunks.length,
    scopedChunkCount: Array.from(new Set(plan.steps.flatMap((step) => step.chunkIds || []))).length,
    stepCount: plan.steps.length
  };

  const store = loadPlanStore(dataDir);
  if (store.plans.some((item) => item.planId === plan.planId)) fail(`阅读计划已存在: ${plan.planId}`);
  store.plans.push(plan);
  savePlanStore(dataDir, store);
  return { plan: summarizePlan(plan), nextStep: nextPendingStep(plan), planPath: plansPath(dataDir) };
}

async function handleInterestBacktrack(args, dataDir, serverModule) {
  const manifest = loadManifest(dataDir, args.bookId);
  const before = Math.max(0, Math.min(20, Number.isFinite(Number(args.before)) ? Math.floor(Number(args.before)) : 2));
  const after = Math.max(0, Math.min(20, Number.isFinite(Number(args.after)) ? Math.floor(Number(args.after)) : 2));
  const limit = Math.max(1, Math.min(100, Number.isFinite(Number(args.limit)) ? Math.floor(Number(args.limit)) : 8));
  const maxRanges = Math.max(1, Math.min(20, Number.isFinite(Number(args.maxRanges)) ? Math.floor(Number(args.maxRanges)) : 5));
  const mergeGap = Math.max(0, Math.min(10, Number.isFinite(Number(args.mergeGap)) ? Math.floor(Number(args.mergeGap)) : 1));
  const anchors = [];

  if (args.anchorChunkId) {
    anchors.push({ chunkId: args.anchorChunkId, source: "anchor", offset: null, snippet: null, title: null });
  }
  if (args.query) {
    const rawMatches = await callVendorToolJson(serverModule, "reading_search_chunks", {
      bookId: manifest.bookId,
      query: args.query,
      limit
    });
    for (const match of Array.isArray(rawMatches) ? rawMatches : []) {
      anchors.push({
        chunkId: match.chunkId,
        source: "search",
        offset: match.offset ?? null,
        snippet: match.snippet || null,
        title: match.title || null
      });
    }
  }
  if (!anchors.length) fail("interest_backtrack 需要 query 或 anchorChunkId。");

  const seenAnchors = new Set();
  const uniqueAnchors = anchors.filter((anchor) => {
    if (!anchor.chunkId || seenAnchors.has(anchor.chunkId)) return false;
    seenAnchors.add(anchor.chunkId);
    return true;
  });
  const ranges = uniqueAnchors.map((anchor) => ({
    ...expandChunkRange(manifest, anchor.chunkId, before, after),
    anchors: [anchor]
  }));
  const mergedRanges = mergeBacktrackRanges(ranges, mergeGap).slice(0, maxRanges);
  const chunkIds = uniqueValues(mergedRanges.flatMap((range) => range.chunkIds));
  const evidence = args.includeEvidence === false
    ? null
    : buildBacktrackEvidence(manifest, args, uniqueAnchors, mergedRanges, chunkIds, { before, after, mergeGap });
  let createdPlan = null;
  if (args.createPlan === true) {
    const planResult = handlePlanCreate(
      {
        bookId: manifest.bookId,
        title: args.title || `${manifest.title || manifest.bookId} 兴趣点回溯: ${args.query || args.anchorChunkId}`,
        mode: "range",
        scope: {
          type: "chunks",
          chunkIds,
          query: args.query || null,
          backtrack: {
            before,
            after,
            anchorChunkId: args.anchorChunkId || null,
            anchorCount: uniqueAnchors.length,
            rangeCount: mergedRanges.length
          }
        },
        chunkIds,
        budget: args.budget,
        annotationDensity: args.annotationDensity || "medium",
        sinkPolicy: args.sinkPolicy,
        createdBy: args.createdBy || "interest_backtrack"
      },
      dataDir
    );
    createdPlan = planResult.plan;
  }
  return {
    bookId: manifest.bookId,
    query: args.query || null,
    anchorChunkId: args.anchorChunkId || null,
    window: { before, after, mergeGap },
    anchors: uniqueAnchors,
    ranges: mergedRanges,
    chunkIds,
    evidence,
    evidenceMarkdown: evidence?.markdown || null,
    createdPlan,
    planPath: createdPlan ? plansPath(dataDir) : null
  };
}

function handlePlanList(args, dataDir) {
  const store = loadPlanStore(dataDir);
  const plans = store.plans
    .filter((plan) => !args.bookId || plan.bookId === args.bookId)
    .filter((plan) => !args.status || plan.status === args.status)
    .map(summarizePlan);
  return { plans, count: plans.length, planPath: plansPath(dataDir) };
}

function handlePlanGet(args, dataDir) {
  const store = loadPlanStore(dataDir);
  const plan = findPlan(store, args.planId);
  return { plan, nextStep: nextPendingStep(plan), suggestedCommands: nextPendingStep(plan) ? suggestedCommandsForStep(nextPendingStep(plan)) : [] };
}

function handlePlanUpdate(args, dataDir) {
  const store = loadPlanStore(dataDir);
  const plan = findPlan(store, args.planId);
  const patch = args.patch && typeof args.patch === "object" ? args.patch : {};
  const allowed = ["title", "status", "scope", "budget", "annotationDensity", "sinkPolicy", "currentStepIndex"];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(args, key)) patch[key] = args[key];
  }
  if (patch.budget) patch.budget = normalizeBudget(patch.budget);
  if (patch.sinkPolicy) patch.sinkPolicy = normalizeSinkPolicy(patch.sinkPolicy);
  Object.assign(plan, patch);
  plan.updatedAt = new Date().toISOString();
  plan.history ||= [];
  plan.history.push({ at: plan.updatedAt, event: "updated", patch });
  savePlanStore(dataDir, store);
  return { plan: summarizePlan(plan), nextStep: nextPendingStep(plan) };
}

function handlePlanNextStep(args, dataDir) {
  const store = loadPlanStore(dataDir);
  const plan = findPlan(store, args.planId);
  const step = nextPendingStep(plan);
  const now = new Date().toISOString();
  if (!step) {
    if (args.completeIfDone !== false && plan.status !== "completed") {
      plan.status = "completed";
      plan.updatedAt = now;
      plan.history ||= [];
      plan.history.push({ at: now, event: "completed" });
      savePlanStore(dataDir, store);
    }
    return { plan: summarizePlan(plan), completed: true, nextStep: null, suggestedCommands: [] };
  }

  if (args.claim === true && step.status === "pending") {
    step.status = "in_progress";
    step.startedAt ||= now;
    plan.updatedAt = now;
    plan.history ||= [];
    plan.history.push({ at: now, event: "step_claimed", stepId: step.stepId });
    savePlanStore(dataDir, store);
  }

  return {
    plan: summarizePlan(plan),
    completed: false,
    nextStep: step,
    suggestedCommands: suggestedCommandsForStep(step).map((command) =>
      command.command === "plan_record_step" ? { ...command, planId: plan.planId } : command
    )
  };
}

function handlePlanRecordStep(args, dataDir) {
  const store = loadPlanStore(dataDir);
  const plan = findPlan(store, args.planId);
  let stepIndex = -1;
  if (args.stepId) stepIndex = plan.steps.findIndex((step) => step.stepId === args.stepId);
  if (stepIndex < 0 && Number.isInteger(args.index)) stepIndex = args.index;
  if (stepIndex < 0 || stepIndex >= plan.steps.length) fail("必须提供有效的 stepId 或 index。");

  const step = plan.steps[stepIndex];
  const now = new Date().toISOString();
  step.status = args.status || "done";
  step.completedAt = ["done", "skipped", "cancelled"].includes(step.status) ? now : step.completedAt || null;
  if (args.note) step.note = args.note;
  if (args.result !== undefined) step.result = args.result;
  if (args.artifacts !== undefined) step.artifacts = args.artifacts;
  plan.currentStepIndex = Math.min(stepIndex + 1, plan.steps.length);
  const unfinished = plan.steps.some((item) => !["done", "skipped", "cancelled"].includes(item.status));
  if (!unfinished) plan.status = "completed";
  plan.updatedAt = now;
  plan.history ||= [];
  plan.history.push({ at: now, event: "step_recorded", stepId: step.stepId, status: step.status });
  savePlanStore(dataDir, store);
  return { plan: summarizePlan(plan), recordedStep: step, nextStep: nextPendingStep(plan) };
}

function parseToolResultJson(toolResult, command) {
  const extracted = extractContent(toolResult);
  if (!extracted.text) return null;
  try {
    return JSON.parse(extracted.text);
  } catch (error) {
    fail(`上游工具 ${command} 返回了非 JSON 文本。`, {
      error: error.message,
      text: extracted.text.slice(0, 2000)
    });
  }
}

async function callVendorToolJson(serverModule, command, args) {
  if (!serverModule || typeof serverModule.callTool !== "function") {
    fail("plan_execute_step 需要可用的 co-reading-mcp upstream callTool。");
  }
  return parseToolResultJson(await serverModule.callTool(command, args), command);
}

async function getVendorStore(vendorDir) {
  return import(pathToFileURL(path.join(vendorDir, "src", "store.js")).href);
}

function summarizeUserNote(note) {
  return {
    id: note.id,
    bookId: note.bookId,
    chunkId: note.chunkId,
    quote: note.quote,
    note: note.note,
    author: note.author,
    kind: note.kind,
    mood: note.mood || null,
    tags: note.tags || [],
    status: note.status || "open",
    parentId: note.parentId || null,
    quoteOffset: note.quoteOffset ?? null,
    createdAt: note.createdAt,
    submittedAt: note.submittedAt || null
  };
}

async function handleUserNoteCreate(args, dataDir, vendorDir) {
  if (!args.bookId) fail("bookId 是必需参数。");
  if (!args.chunkId) fail("chunkId 是必需参数。");
  if (!args.quote) fail("quote 是必需参数。");
  if (!args.note) fail("note 是必需参数。");
  const status = args.status || "open";
  if (!["open", "private", "draft"].includes(status)) fail(`不支持的用户笔记状态: ${status}`);
  const store = await getVendorStore(vendorDir);
  const note = await store.annotatePassage({
    bookId: args.bookId,
    chunkId: args.chunkId,
    quote: args.quote,
    quoteOffset: args.quoteOffset,
    note: args.note,
    author: "user",
    kind: args.kind || "note",
    mood: args.mood || null,
    tags: normalizeArray(args.tags).length ? normalizeArray(args.tags) : ["co-reading", "user-note"],
    status
  });
  return { note: summarizeUserNote(note), annotationsPath: path.join(dataDir, "annotations.jsonl") };
}

async function handleUserNoteDelete(args, dataDir, vendorDir) {
  if (!args.id) fail("id 是必需参数。");
  const store = await getVendorStore(vendorDir);
  if (typeof store.deleteAnnotation !== "function") fail("vendor store 不支持 deleteAnnotation。");
  const result = await store.deleteAnnotation({ id: args.id });
  return { ...result, annotationsPath: path.join(dataDir, "annotations.jsonl") };
}

async function handleUserNoteList(args, dataDir, serverModule) {
  const notes = await callVendorToolJson(serverModule, "reading_list_annotations", {
    bookId: args.bookId,
    chunkId: args.chunkId,
    kind: args.kind,
    status: args.status,
    author: "user",
    includePrivate: true
  });
  const limit = Number(args.limit || 100);
  const normalized = Array.isArray(notes) ? notes.map(summarizeUserNote) : [];
  return {
    notes: normalized.slice(0, Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 100),
    count: normalized.length,
    annotationsPath: path.join(dataDir, "annotations.jsonl")
  };
}

function handleWereadLinkBook(args, dataDir) {
  if (!args.wereadTitle && !args.wereadBookId) {
    throw new Error("wereadTitle or wereadBookId is required");
  }
  return wereadLink.linkWereadBook(dataDir, args);
}

function handleWereadFindContext(args, dataDir) {
  if (!args.wereadTitle) throw new Error("wereadTitle is required");
  if (!args.markText) throw new Error("markText is required");
  return wereadLink.findWereadContext(dataDir, args);
}

async function handleImportFile(args, serverModule) {
  if (!args.filename) fail("filename 是必需参数。");
  if (!args.dataBase64) fail("dataBase64 是必需参数。");
  return callVendorToolJson(serverModule, "reading_import_book", {
    filename: args.filename,
    dataBase64: args.dataBase64,
    format: args.format,
    bookId: args.bookId,
    title: args.title,
    author: args.author,
    maxChars: args.maxChars,
    headingRegex: args.headingRegex,
    minSectionChars: args.minSectionChars,
    overwrite: args.overwrite
  });
}

function handleCompatGetManifest(args, dataDir) {
  const manifest = loadManifest(dataDir, args.bookId);
  const maxChunks = Number.isFinite(Number(args.maxChunks)) && Number(args.maxChunks) > 0
    ? Math.min(Number(args.maxChunks), manifest.chunks.length)
    : manifest.chunks.length;
  const chunks = manifest.chunks.slice(0, maxChunks).map((chunk) => {
    const compact = compactChunk(chunk);
    if (!args.includeChunkPreview) return compact;
    const text = readChunkText(dataDir, manifest, chunk);
    return { ...compact, preview: normalizeExcerpt(text, 320) };
  });
  return {
    bookId: manifest.bookId,
    title: manifest.title || manifest.bookId,
    author: manifest.author || null,
    chunkCount: manifest.chunks.length,
    chunksReturned: args.includeChunks === false ? 0 : chunks.length,
    chunks: args.includeChunks === false ? undefined : chunks,
    manifest: args.includeChunks === false ? { ...manifest, chunks: undefined } : undefined
  };
}

function handleCompatGetChunk(args, dataDir) {
  const manifest = loadManifest(dataDir, args.bookId);
  const { chunk, prevId, nextId } = resolveChunkWithIndex(manifest, args.chunkId);
  const text = readChunkText(dataDir, manifest, chunk);
  return {
    bookId: manifest.bookId,
    bookTitle: manifest.title || manifest.bookId,
    title: manifest.title || manifest.bookId,
    author: manifest.author || null,
    chunkId: chunk.id,
    chunk: { ...chunk, prevId, nextId },
    prevId,
    nextId,
    text,
    fullText: text,
    charCount: text.length
  };
}

function handleCompatSearch(args, dataDir, { exact = false } = {}) {
  if (!args.query) fail("query 是必需参数。");
  const limit = Number.isFinite(Number(args.limit)) && Number(args.limit) > 0 ? Math.min(Number(args.limit), 100) : 10;
  const matches = [];
  for (const bookId of resolveBookIds(dataDir, args.bookId)) {
    const manifest = loadManifest(dataDir, bookId);
    for (const chunk of manifest.chunks) {
      const text = readChunkText(dataDir, manifest, chunk);
      const match = compatSearchMatch({
        manifest,
        chunk,
        text,
        query: args.query,
        exact,
        includeFullText: args.includeFullText || args.includeChunk
      });
      if (!match) continue;
      matches.push(match);
      if (matches.length >= limit) {
        return { query: args.query, exact, count: matches.length, matches };
      }
    }
  }
  return { query: args.query, exact, count: matches.length, matches };
}

async function handleCompatResumeBook(args, serverModule) {
  const resumed = await callVendorToolJson(serverModule, "reading_continue", { bookId: args.bookId });
  const chunk = resumed?.chunk || null;
  const text = args.readChunk === false ? undefined : resumed?.text;
  return {
    ...resumed,
    chunkId: chunk?.id || null,
    chunkTitle: chunk?.title || null,
    prevId: resumed?.prevId ?? chunk?.prevId ?? null,
    nextId: resumed?.nextId ?? chunk?.nextId ?? null,
    text,
    fullText: text
  };
}

async function handleCompatUpdateProgress(args, dataDir, serverModule) {
  if (!args.bookId) fail("bookId 是必需参数。");
  const manifest = loadManifest(dataDir, args.bookId);
  const chunkId = args.lastChunkId || args.chunkId;
  let markResult = null;
  if (chunkId) {
    markResult = await callVendorToolJson(serverModule, "reading_mark_read", { bookId: args.bookId, chunkId });
  }
  const progress = readJsonFile(progressPath(dataDir), {});
  const previous = progress[args.bookId] || {};
  const next = {
    ...previous,
    ...(markResult || {}),
    bookId: args.bookId,
    title: args.title || manifest.title || args.bookId,
    lastChunkId: chunkId || previous.lastChunkId || null,
    nextChunkId: args.nextChunkId || previous.nextChunkId || null,
    lastPath: args.lastPath || previous.lastPath || null,
    nextPath: args.nextPath || previous.nextPath || null,
    lastSectionTitle: args.lastSectionTitle || previous.lastSectionTitle || null,
    currentThemes: normalizeArray(args.currentThemes).length ? normalizeArray(args.currentThemes) : previous.currentThemes || [],
    status: args.status || previous.status || "reading",
    updatedAt: new Date().toISOString()
  };
  progress[args.bookId] = next;
  writeJsonFile(progressPath(dataDir), progress);
  return { progress: next, markResult, progressPath: progressPath(dataDir) };
}

function handleCompatUpdateNote(args, dataDir) {
  if (!args.bookId) fail("bookId 是必需参数。");
  if (!args.appendContent) fail("appendContent 是必需参数。");
  const filePath = notesPath(dataDir, args.bookId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const now = new Date().toISOString();
  const heading = args.appendHeading || args.appendSection || "Notes";
  const prefix = fs.existsSync(filePath) && fs.readFileSync(filePath, "utf8").trim() ? "\n\n" : "";
  const entry = `${prefix}## ${heading}\n\n- ${now}${args.title ? ` · ${args.title}` : ""}\n\n${String(args.appendContent).trim()}\n`;
  fs.appendFileSync(filePath, entry, "utf8");
  return { bookId: args.bookId, notePath: filePath, section: heading, appendedAt: now };
}

function handleCompatReadNote(args, dataDir) {
  if (!args.bookId) fail("bookId 是必需参数。");
  const filePath = notesPath(dataDir, args.bookId);
  const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  return {
    bookId: args.bookId,
    notePath: filePath,
    section: args.section || null,
    exists: fs.existsSync(filePath),
    content: extractMarkdownSection(content, args.section)
  };
}

function handleCompatBuildIndex(args, dataDir) {
  const manifest = loadManifest(dataDir, args.bookId);
  let readableChunks = 0;
  let totalChars = 0;
  for (const chunk of manifest.chunks) {
    const text = readChunkText(dataDir, manifest, chunk);
    readableChunks += 1;
    totalChars += text.length;
  }
  return {
    bookId: manifest.bookId,
    status: "noop_validated",
    message: "本项目搜索直接扫描 chunk；reading_build_index 兼容 wrapper 仅验证 chunk 可读性。",
    chunkCount: manifest.chunks.length,
    readableChunks,
    totalChars
  };
}

function normalizeExcerpt(text, maxChars = 220) {
  const clean = String(text || "")
    .replace(/^\s*#+\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";
  return clean.length > maxChars ? `${clean.slice(0, maxChars).trim()}...` : clean;
}

function compactReadResult(result) {
  const chunk = result?.chunk || {};
  return {
    bookId: result?.bookId || null,
    bookTitle: result?.title || null,
    chunkId: chunk.id,
    title: chunk.title || chunk.id,
    sectionTitle: chunk.sectionTitle || null,
    order: Number(chunk.order || 0),
    charCount: Number(chunk.charCount || String(result?.text || "").length || 0),
    wordCount: Number(chunk.wordCount || 0),
    excerpt: normalizeExcerpt(result?.text)
  };
}

function compactSearchMatch(match) {
  return {
    bookId: match.bookId,
    chunkId: match.chunkId,
    title: match.title || match.chunkId,
    offset: Number.isFinite(Number(match.offset)) ? Number(match.offset) : null,
    snippet: normalizeExcerpt(match.snippet, 320)
  };
}

function uniqueValues(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function sourceChunkIdsForStep(step) {
  const chunkIds = normalizeArray(step.chunkIds);
  if (!chunkIds.length) fail(`计划步骤 ${step.stepId} 没有可执行 chunkIds。`);
  return chunkIds;
}

function resolveStepForExecution(plan, args) {
  let stepIndex = -1;
  if (args.stepId) stepIndex = plan.steps.findIndex((step) => step.stepId === args.stepId);
  if (stepIndex < 0 && Number.isInteger(args.index)) stepIndex = args.index;
  if (stepIndex < 0) {
    const next = nextPendingStep(plan);
    if (next) stepIndex = plan.steps.findIndex((step) => step.stepId === next.stepId);
  }
  if (stepIndex < 0 || stepIndex >= plan.steps.length) return { step: null, stepIndex: -1 };
  return { step: plan.steps[stepIndex], stepIndex };
}

function reviewDraftFromRead(plan, step, readChunks, phase) {
  const chunkIds = readChunks.map((chunk) => chunk.chunkId);
  const first = chunkIds[0];
  const last = chunkIds[chunkIds.length - 1];
  const totalChars = readChunks.reduce((sum, chunk) => sum + Number(chunk.charCount || 0), 0);
  const sections = uniqueValues(readChunks.map((chunk) => chunk.sectionTitle || chunk.title)).slice(0, 6);
  const titleList = readChunks.map((chunk) => `${chunk.chunkId}: ${chunk.title}`).slice(0, 8).join("; ");
  return {
    title: `${plan.bookTitle || plan.bookId} ${step.title || step.stepId} 自动共读草稿`,
    summary:
      `自动执行草稿：${phase === "read" ? "已读取并登记进度" : "已复核"} ${first} -> ${last}，` +
      `共 ${readChunks.length} 个 chunk，约 ${totalChars} 字符。此草稿只基于本步范围、标题和短摘录，等待 Nova 或用户补充细读判断。`,
    stance: "保守草稿：这里先证明范围已处理和来源可回链，不把自动摘录当作最终解释。",
    observations: [
      { text: `覆盖范围：${first} -> ${last}，chunk 数 ${readChunks.length}。` },
      { text: sections.length ? `涉及章节/标题：${sections.join(" / ")}。` : `涉及 chunk：${titleList}。` },
      { text: `标题索引：${titleList || "暂无标题元数据"}。` }
    ],
    questions: [
      { text: "哪些短摘录值得扩展成真正的段内边注？" },
      { text: "这一范围和当前共读计划的主线、人物、意象或论证目标有什么关系？" }
    ],
    quotes: readChunks
      .filter((chunk) => chunk.excerpt)
      .slice(0, 3)
      .map((chunk) => ({
        chunkId: chunk.chunkId,
        quote: chunk.excerpt,
        note: "自动短摘录，用于回链和后续人工/Nova 精读，不代表最终评注。"
      })),
    nextActions: [
      { text: "由 Nova 基于这些锚点补写更有判断力的章节/段内评价。" },
      { text: "如果用户对某个 chunk 感兴趣，再创建更窄范围的 follow-up 计划。" }
    ],
    tags: ["co-reading", "auto-step", "draft"]
  };
}

function sinkPreviewArgsForExecution(args, step, reviewId) {
  const targets = normalizeArray(args.targets);
  return {
    reviewId,
    targets,
    requireApproval:
      args.requireApproval !== undefined
        ? args.requireApproval
        : step.sinkPolicy?.requireApproval !== false,
    createdBy: args.createdBy || "plan_execute_step"
  };
}

function createExecutionReview(plan, step, readChunks, args, dataDir, phase) {
  const draft = reviewDraftFromRead(plan, step, readChunks, phase);
  const reviewResult = handleReviewCreate(
    {
      bookId: step.bookId || plan.bookId,
      planId: plan.planId,
      stepId: step.stepId,
      chunkIds: readChunks.map((chunk) => chunk.chunkId),
      title: draft.title,
      summary: draft.summary,
      stance: draft.stance,
      observations: draft.observations,
      questions: draft.questions,
      quotes: draft.quotes,
      nextActions: draft.nextActions,
      tags: draft.tags,
      status: "draft",
      createdBy: args.createdBy || "plan_execute_step"
    },
    dataDir
  );
  const reviewId = reviewResult.fullReview.reviewId;
  const previewResult =
    args.createSinkPreview === false
      ? null
      : handleSinkPreviewCreate(sinkPreviewArgsForExecution(args, step, reviewId), dataDir);
  return { reviewResult, previewResult };
}

async function readChunksForStep(step, args, serverModule) {
  const chunkIds = sourceChunkIdsForStep(step);
  const readChunks = [];
  const markResults = [];
  for (const chunkId of chunkIds) {
    const readResult = await callVendorToolJson(serverModule, "reading_read_chunk", {
      bookId: step.bookId,
      chunkId
    });
    readChunks.push(compactReadResult(readResult));
    if (args.markRead !== false) {
      const markResult = await callVendorToolJson(serverModule, "reading_mark_read", {
        bookId: step.bookId,
        chunkId
      });
      markResults.push({
        chunkId,
        chunksRead: markResult.chunksRead,
        chunkCount: markResult.chunkCount,
        complete: markResult.complete
      });
    }
  }
  return { readChunks, markResults };
}

async function executeReadOrReviewStep(plan, step, args, dataDir, serverModule, phase) {
  const readArgs = phase === "review" ? { ...args, markRead: false } : args;
  const { readChunks, markResults } = await readChunksForStep(step, readArgs, serverModule);
  const reviewArtifacts =
    args.createReview === false
      ? { reviewResult: null, previewResult: null }
      : createExecutionReview(plan, step, readChunks, args, dataDir, phase);
  const reviewId = reviewArtifacts.reviewResult?.fullReview?.reviewId || null;
  const sinkPreviewIds = reviewArtifacts.previewResult?.previews?.map((preview) => preview.previewId) || [];
  const artifacts = [
    reviewId ? { type: "review", reviewId } : null,
    ...sinkPreviewIds.map((previewId) => ({ type: "sink_preview", previewId }))
  ].filter(Boolean);
  const recorded = handlePlanRecordStep(
    {
      planId: plan.planId,
      stepId: step.stepId,
      status: "done",
      note: phase === "read" ? "plan_execute_step completed read_range." : "plan_execute_step completed review_range.",
      result: {
        executor: "plan_execute_step",
        stepType: step.type,
        phase,
        readChunks,
        markResults,
        reviewId,
        sinkPreviewIds,
        rawTextIncluded: false
      },
      artifacts
    },
    dataDir
  );
  return {
    executed: true,
    stepType: step.type,
    readChunks,
    markResults,
    review: reviewArtifacts.reviewResult?.review || null,
    sinkPreviews: reviewArtifacts.previewResult?.previews || [],
    recorded
  };
}

async function executeSearchStep(plan, step, args, dataDir, serverModule) {
  const query = step.query || args.query;
  if (!query) fail(`计划步骤 ${step.stepId} 缺少 query。`);
  const limit = Number(args.searchLimit || step.limit || 10);
  const rawMatches = await callVendorToolJson(serverModule, "reading_search_chunks", {
    bookId: step.bookId || plan.bookId,
    query,
    limit
  });
  const matches = Array.isArray(rawMatches) ? rawMatches.map(compactSearchMatch) : [];
  const chosenChunkIds = normalizeArray(args.chosenChunkIds).length
    ? normalizeArray(args.chosenChunkIds)
    : uniqueValues(matches.map((match) => match.chunkId)).slice(0, 5);
  const recorded = handlePlanRecordStep(
    {
      planId: plan.planId,
      stepId: step.stepId,
      status: "done",
      note: "plan_execute_step searched interest trail without expanding plan steps.",
      result: {
        executor: "plan_execute_step",
        stepType: step.type,
        query,
        matches,
        chosenChunkIds,
        autoExpandedPlan: false
      },
      artifacts: [{ type: "search_results", count: matches.length, chosenChunkIds }]
    },
    dataDir
  );
  return {
    executed: true,
    stepType: step.type,
    query,
    matches,
    chosenChunkIds,
    autoExpandedPlan: false,
    recorded
  };
}

async function handlePlanExecuteStep(args, dataDir, serverModule) {
  const store = loadPlanStore(dataDir);
  const plan = findPlan(store, args.planId);
  if (plan.status === "paused" && args.force !== true) {
    return { plan: summarizePlan(plan), paused: true, completed: false, nextStep: nextPendingStep(plan) };
  }
  if (["cancelled", "completed"].includes(plan.status) && args.force !== true) {
    return { plan: summarizePlan(plan), skipped: true, reason: `plan_${plan.status}`, completed: plan.status === "completed", nextStep: nextPendingStep(plan) };
  }
  const { step } = resolveStepForExecution(plan, args);
  const now = new Date().toISOString();
  if (!step) {
    const unfinished = plan.steps.some((item) => !["done", "skipped", "cancelled"].includes(item.status));
    if (!unfinished && plan.status !== "completed") {
      plan.status = "completed";
      plan.updatedAt = now;
      plan.history ||= [];
      plan.history.push({ at: now, event: "completed" });
      savePlanStore(dataDir, store);
    }
    return { plan: summarizePlan(plan), completed: true, nextStep: null };
  }
  if (["done", "skipped", "cancelled"].includes(step.status) && args.force !== true) {
    fail(`计划步骤 ${step.stepId} 已经是 ${step.status}；如需重跑请传 force=true。`);
  }
  if (step.status === "pending") {
    step.status = "in_progress";
    step.startedAt ||= now;
    plan.updatedAt = now;
    plan.history ||= [];
    plan.history.push({ at: now, event: "step_execution_started", stepId: step.stepId });
    savePlanStore(dataDir, store);
  }

  let execution;
  if (step.type === "read_range") {
    execution = await executeReadOrReviewStep(plan, step, args, dataDir, serverModule, "read");
  } else if (step.type === "review_range") {
    execution = await executeReadOrReviewStep(plan, step, args, dataDir, serverModule, "review");
  } else if (step.type === "search_interest") {
    execution = await executeSearchStep(plan, step, args, dataDir, serverModule);
  } else {
    fail(`plan_execute_step 暂不支持步骤类型: ${step.type}`);
  }

  return {
    plan: execution.recorded.plan,
    completed: false,
    executedStep: execution.recorded.recordedStep,
    execution,
    nextStep: execution.recorded.nextStep
  };
}

async function handlePlanRun(args, dataDir, serverModule) {
  const maxSteps = Math.max(1, Math.min(50, Number(args.maxSteps || 3)));
  const stopOnError = args.stopOnError !== false;
  const startedAt = new Date().toISOString();
  const lock = acquirePlanRunLock(dataDir, args.planId, args);
  if (!lock.acquired) {
    return {
      plan: summarizePlan(findPlan(loadPlanStore(dataDir), args.planId)),
      runner: {
        startedAt,
        finishedAt: new Date().toISOString(),
        maxSteps,
        executedCount: 0,
        stoppedReason: "locked",
        lock: {
          path: lock.lockPath,
          ageMs: lock.ageMs,
          holder: lock.existing || null
        },
        error: null
      },
      runs: [],
      completed: false,
      paused: false,
      nextStep: nextPendingStep(findPlan(loadPlanStore(dataDir), args.planId))
    };
  }
  const runs = [];
  let completed = false;
  let paused = false;
  let error = null;

  try {
    appendPlanHistory(dataDir, args.planId, {
      event: "runner_started",
      maxSteps,
      by: args.createdBy || "plan_run",
      lockPath: lock.lockPath
    });
    for (let index = 0; index < maxSteps; index += 1) {
      const plan = findPlan(loadPlanStore(dataDir), args.planId);
      if (plan.status === "paused") {
        paused = true;
        break;
      }
      if (["cancelled", "completed"].includes(plan.status)) {
        completed = plan.status === "completed";
        break;
      }
      try {
        validateExecutableStepForRunner(nextPendingStep(plan));
        const result = await handlePlanExecuteStep({ ...args, planId: args.planId }, dataDir, serverModule);
        runs.push({
          stepId: result.executedStep?.stepId || null,
          stepType: result.execution?.stepType || null,
          status: result.executedStep?.status || null,
          reviewId: result.execution?.review?.reviewId || result.executedStep?.result?.reviewId || null,
          sinkPreviewIds: result.executedStep?.result?.sinkPreviewIds || [],
          completed: result.completed === true,
          paused: result.paused === true
        });
        if (result.paused) {
          paused = true;
          break;
        }
        if (result.completed || !result.nextStep) {
          completed = true;
          break;
        }
      } catch (caught) {
        error = { message: caught.message || String(caught) };
        appendPlanHistory(dataDir, args.planId, {
          event: "runner_error",
          error,
          stopOnError,
          by: args.createdBy || "plan_run"
        });
        if (stopOnError) break;
        runs.push({ stepId: null, status: "error", error });
      }
    }
  } finally {
    releasePlanRunLock(lock);
  }

  const plan = findPlan(loadPlanStore(dataDir), args.planId);
  const nextStep = nextPendingStep(plan);
  const stoppedReason = error ? "error" : paused ? "paused" : completed || !nextStep ? "completed" : "max_steps";
  appendPlanHistory(dataDir, args.planId, {
    event: "runner_finished",
    stoppedReason,
    executedCount: runs.filter((item) => item.status === "done").length,
    by: args.createdBy || "plan_run"
  });
  return {
    plan: summarizePlan(findPlan(loadPlanStore(dataDir), args.planId)),
    runner: {
      startedAt,
      finishedAt: new Date().toISOString(),
      maxSteps,
      executedCount: runs.filter((item) => item.status === "done").length,
      stoppedReason,
      lock: { path: lock.lockPath },
      error
    },
    runs,
    completed: completed || !nextStep,
    paused,
    nextStep
  };
}

function deriveReviewScope(args, dataDir) {
  const scope = buildScope(args);
  if (!args.planId) return scope;

  const plan = findPlan(loadPlanStore(dataDir), args.planId);
  args.__linkedPlan = plan;
  if (!args.bookId && plan.bookId) args.bookId = plan.bookId;
  if (!args.stepId) return scope;

  const step = plan.steps.find((item) => item.stepId === args.stepId);
  if (!step) fail(`计划 ${args.planId} 中未找到 stepId: ${args.stepId}`);
  const explicitChunkIds = normalizeArray(args.chunkIds || scope.chunkIds);
  if (!explicitChunkIds.length && Array.isArray(step.chunkIds) && step.chunkIds.length) {
    scope.type = "chunks";
    scope.chunkIds = step.chunkIds;
  }
  if (!scope.startChunkId && step.range?.startChunkId) scope.startChunkId = step.range.startChunkId;
  if (!scope.endChunkId && step.range?.endChunkId) scope.endChunkId = step.range.endChunkId;
  return scope;
}

function buildSourceAnchors(manifest, scope) {
  const chunks = selectChunks(manifest, scope);
  if (!chunks.length) fail("评价必须绑定至少一个来源 chunk。");
  const first = chunks[0];
  const last = chunks[chunks.length - 1];
  return {
    scope: {
      ...scope,
      type: scope.type || "range",
      startChunkId: first.id,
      endChunkId: last.id
    },
    anchors: {
      bookId: manifest.bookId,
      chunkIds: chunks.map((chunk) => chunk.id),
      startChunkId: first.id,
      endChunkId: last.id,
      startOrder: Number(first.order || 0),
      endOrder: Number(last.order || 0),
      chunks: chunks.map(compactChunk),
      totalCharCount: chunks.reduce((sum, chunk) => sum + Number(chunk.charCount || 0), 0),
      totalWordCount: chunks.reduce((sum, chunk) => sum + Number(chunk.wordCount || 0), 0)
    }
  };
}

function summarizeReview(review) {
  return {
    reviewId: review.reviewId,
    title: review.title,
    bookId: review.bookId,
    bookTitle: review.bookTitle,
    planId: review.planId || null,
    stepId: review.stepId || null,
    status: review.status,
    sourceRange: {
      startChunkId: review.sourceAnchors.startChunkId,
      endChunkId: review.sourceAnchors.endChunkId,
      chunkCount: review.sourceAnchors.chunkIds.length
    },
    sinkPreviewIds: review.sinkPreviewIds || [],
    createdAt: review.createdAt,
    updatedAt: review.updatedAt
  };
}

function findReview(store, reviewId) {
  const review = store.reviews.find((item) => item.reviewId === reviewId);
  if (!review) fail(`未找到阅读评价: ${reviewId}`);
  return review;
}

function yamlScalar(value) {
  return JSON.stringify(String(value ?? ""));
}

function listLines(items, formatter) {
  if (!items.length) return "- 暂无";
  return items.map(formatter).join("\n");
}

function markdownBlockquote(text) {
  const value = String(text || "").trim();
  if (!value) return "> 暂无";
  return value.split(/\r?\n/u).map((line) => `> ${line}`).join("\n");
}

function reviewObservationSection(observations, sections) {
  return observations.filter((item) => [item.section, item.source, item.kind].some((value) => sections.includes(value)));
}

function observationMatches(item, sections) {
  return [item.section, item.source, item.kind].some((value) => sections.includes(value));
}

function observationText(item) {
  return item.text || item.note || item.observation || item.summary || JSON.stringify(item);
}

function renderStructuredObservation(item) {
  const title = item.title || item.kind || item.source || item.chunkId || "条目";
  const chunk = item.chunkId ? ` · \`${item.chunkId}\`` : "";
  const quote = item.quote ? `\n\n${markdownBlockquote(item.quote)}` : "";
  const note = item.note || (item.quote && item.text === item.quote ? "" : item.text);
  const noteLine = note ? `\n\n${note}` : "";
  return `- ${title}${chunk}${quote}${noteLine}`;
}

function reviewRangeLabel(review) {
  const anchors = review.sourceAnchors;
  if (!anchors) return "未绑定来源";
  return `${anchors.startChunkId} -> ${anchors.endChunkId} (${anchors.chunkIds.length} chunks)`;
}

function renderIllustrationMarkdown(illustrations) {
  const items = normalizeArray(illustrations).filter((item) => item.assetUri || item.thumbnailUri);
  if (!items.length) return "";
  return [
    "## 插图",
    "",
    ...items.flatMap((item) => {
      const uri = item.assetUri || item.thumbnailUri;
      const title = item.title || item.illustrationId || "共读插图";
      const placement = item.placement || {};
      return [
        `![${title}](${uri})`,
        "",
        `- 插图ID: ${item.illustrationId}`,
        `- 位置: ${placement.position || "unknown"} / ${placement.layer || "unknown"} / ${placement.chunkId || placement.startChunkId || ""}`,
        `- 风格: ${item.stylePreset || "unspecified"}`,
        ""
      ];
    })
  ].join("\n");
}

function renderReviewMarkdown(review, options = {}) {
  const tags = normalizeArray(review.tags);
  const observations = normalizeObjectArray(review.observations);
  const sourceObservations = reviewObservationSection(observations, ["source_quote", "current-chunk"]);
  const novaObservations = observations.filter((item) => observationMatches(item, ["nova_reply", "nova-reply"]));
  const cardObservations = observations.filter((item) => observationMatches(item, ["reading_card", "reading-card"]));
  const readerObservations = observations.filter((item) =>
    !novaObservations.includes(item)
    && !cardObservations.includes(item)
    && observationMatches(item, ["user_note", "annotation", "user-note"])
  );
  const structuredObservations = new Set([...sourceObservations, ...readerObservations, ...novaObservations, ...cardObservations]);
  const otherObservations = observations.filter((item) => !structuredObservations.has(item));
  const questions = normalizeObjectArray(review.questions);
  const quotes = normalizeObjectArray(review.quotes, "quote");
  const nextActions = normalizeObjectArray(review.nextActions);
  const illustrationMarkdown = renderIllustrationMarkdown(options.illustrations || review.illustrations || []);
  return [
    "---",
    "type: co-reading-review",
    `reviewId: ${yamlScalar(review.reviewId)}`,
    `bookId: ${yamlScalar(review.bookId)}`,
    `bookTitle: ${yamlScalar(review.bookTitle)}`,
    `planId: ${yamlScalar(review.planId || "")}`,
    `sourceRange: ${yamlScalar(reviewRangeLabel(review))}`,
    `createdAt: ${yamlScalar(review.createdAt)}`,
    `tags: [${tags.map(yamlScalar).join(", ")}]`,
    "---",
    "",
    `# ${review.title}`,
    "",
    `- 书籍: ${review.bookTitle}`,
    `- 范围: ${reviewRangeLabel(review)}`,
    `- 状态: ${review.status}`,
    "",
    "## 摘要",
    "",
    review.summary,
    "",
    "## 判断",
    "",
    review.stance || "暂无",
    "",
    "## 来源原文",
    "",
    listLines(sourceObservations, (item) => `- ${item.title || item.chunkId || "当前段"} · \`${item.chunkId || review.sourceAnchors.startChunkId}\`\n\n${markdownBlockquote(item.quote || item.text)}`),
    "",
    "## 我的笔记与边注",
    "",
    listLines(readerObservations, renderStructuredObservation),
    "",
    "## Nova 回应",
    "",
    listLines(novaObservations, renderStructuredObservation),
    "",
    "## 阅读卡片",
    "",
    listLines(cardObservations, renderStructuredObservation),
    "",
    "## 其他观察",
    "",
    listLines(otherObservations, (item) => `- ${observationText(item)}`),
    "",
    "## 引文与锚点",
    "",
    listLines(quotes, (item) => {
      const chunkId = item.chunkId || review.sourceAnchors.startChunkId;
      const quote = item.quote || item.text || "";
      const note = item.note ? ` - ${item.note}` : "";
      return `- \`${chunkId}\`: ${quote}${note}`;
    }),
    "",
    "## 问题",
    "",
    listLines(questions, (item) => `- ${item.text || item.question || JSON.stringify(item)}`),
    "",
    "## 下一步",
    "",
    listLines(nextActions, (item) => `- ${item.text || item.action || JSON.stringify(item)}`),
    "",
    illustrationMarkdown
  ].join("\n");
}

function renderDailyNoteEntry(review) {
  const tags = normalizeArray(review.tags);
  return [
    `### 共读: ${review.title}`,
    "",
    `- 书籍: ${review.bookTitle}`,
    `- 范围: ${reviewRangeLabel(review)}`,
    `- 评价ID: ${review.reviewId}`,
    `- 标签: ${tags.length ? tags.join(", ") : "co-reading"}`,
    "",
    review.summary,
    "",
    review.stance ? `判断: ${review.stance}` : "判断: 暂无"
  ].join("\n");
}

function buildVcpMemoryProposal(review) {
  return {
    memoryType: "co_reading_review",
    title: review.title,
    content: review.summary,
    tags: normalizeArray(review.tags).length ? normalizeArray(review.tags) : ["co-reading"],
    source: {
      system: "CoReadingMCP",
      reviewId: review.reviewId,
      bookId: review.bookId,
      bookTitle: review.bookTitle,
      range: reviewRangeLabel(review),
      chunkIds: review.sourceAnchors.chunkIds
    },
    requiresApproval: true,
    rawTextIncluded: false
  };
}

function defaultTargetsForReview(review) {
  const policy = review.sinkPolicy || {};
  const targets = [];
  if (policy.obsidian) targets.push("obsidian");
  if (policy.obs) targets.push("obs");
  if (policy.dailyNote) targets.push("dailyNote");
  if (policy.vcpMemory) targets.push("vcpMemory");
  return targets.length ? targets : ["obsidian"];
}

function illustrationsForReview(review, dataDir, args = {}) {
  const explicitIds = normalizeArray(args.illustrationIds);
  const anchors = review.sourceAnchors || {};
  const chunkIds = new Set(normalizeArray(anchors.chunkIds));
  const allowedStatuses = new Set(normalizeArray(args.illustrationStatuses).length ? normalizeArray(args.illustrationStatuses) : ["generated", "inserted"]);
  const store = loadIllustrationStore(dataDir);
  return store.illustrations.filter((item) => {
    if (item.bookId !== review.bookId) return false;
    if (explicitIds.length) return explicitIds.includes(item.illustrationId);
    if (!allowedStatuses.has(item.status)) return false;
    const placement = item.placement || {};
    const placementIds = normalizeArray([placement.chunkId, placement.startChunkId, placement.endChunkId]);
    if (!placementIds.length) return placement.layer === "cover" || placement.position === "cover";
    return placementIds.some((chunkId) => chunkIds.has(chunkId));
  });
}

function buildSinkPreview(review, target, args, now, context = {}) {
  const previewId = createArtifactId(`sink-${target}`, review.reviewId);
  const requireApproval = args.requireApproval !== false;
  const illustrations = normalizeArray(context.illustrations);
  const base = {
    previewId,
    reviewId: review.reviewId,
    bookId: review.bookId,
    target,
    status: requireApproval ? "pending" : "approved",
    requireApproval,
    createdBy: args.createdBy || "nova",
    createdAt: now,
    updatedAt: now,
    rawTextIncluded: false,
    illustrationIds: illustrations.map((item) => item.illustrationId)
  };
  if (target === "obsidian") {
    const notePath = args.notePath || `CoReading/${slugPart(review.bookTitle)}/${slugPart(review.title)}.md`;
    return {
      ...base,
      destination: { type: "obsidian", vaultPath: args.vaultPath || null, notePath },
      contentType: "markdown",
      content: renderReviewMarkdown(review, { illustrations })
    };
  }
  if (target === "dailyNote") {
    return {
      ...base,
      destination: { type: "dailyNote", section: "co-reading" },
      contentType: "markdown",
      content: renderDailyNoteEntry(review)
    };
  }
  if (target === "vcpMemory") {
    return {
      ...base,
      destination: { type: "vcpMemory", collection: "co-reading" },
      contentType: "json",
      content: buildVcpMemoryProposal(review)
    };
  }
  if (target === "obs") {
    const titleSlug = slugPart(review.title || review.reviewId);
    return {
      ...base,
      destination: {
        type: "obs",
        outputDir: args.obsOutputDir || null,
        markdownPath: ensureMarkdownPath(args.obsMarkdownPath, `${titleSlug}.md`),
        textPath: ensureTextPath(args.obsTextPath, `${titleSlug}.txt`)
      },
      contentType: "markdown",
      content: renderReviewMarkdown(review, { illustrations })
    };
  }
  fail(`未知沉淀目标: ${target}`);
}

function standaloneSinkTargets(args) {
  const targets = normalizeArray(args.targets);
  const allowed = targets.filter((target) => SINK_TARGETS.includes(target));
  return allowed.length ? allowed : ["obsidian"];
}

function buildMarkdownSinkPreview(args, target, now, source) {
  const requireApproval = args.requireApproval !== false;
  const titleSlug = slugPart(source.title || source.bookId || source.sourceType);
  const base = {
    previewId: createArtifactId(`sink-${target}-${source.idSuffix}`, source.bookId || source.sourceType),
    reviewId: null,
    sourceType: source.sourceType,
    ...source.metadata,
    bookId: source.bookId,
    target,
    status: requireApproval ? "pending" : "approved",
    requireApproval,
    createdBy: args.createdBy || "nova",
    createdAt: now,
    updatedAt: now,
    rawTextIncluded: false,
    illustrationIds: [],
    contentType: "markdown",
    content: source.content,
    history: [
      {
        at: now,
        event: source.historyEvent,
        by: args.createdBy || "nova"
      }
    ]
  };
  if (target === "obsidian") {
    const notePath = args.notePath || `CoReading/${slugPart(source.bookId)}/${titleSlug}.md`;
    return { ...base, destination: { type: "obsidian", vaultPath: args.vaultPath || null, notePath } };
  }
  if (target === "obs") {
    return {
      ...base,
      destination: {
        type: "obs",
        outputDir: args.obsOutputDir || null,
        markdownPath: ensureMarkdownPath(args.obsMarkdownPath, `${titleSlug}.md`),
        textPath: ensureTextPath(args.obsTextPath, `${titleSlug}.txt`)
      }
    };
  }
  if (target === "dailyNote") return { ...base, destination: { type: "dailyNote", section: "co-reading" } };
  if (target === "vcpMemory") return { ...base, destination: { type: "vcpMemory", collection: "co-reading" } };
  fail(`未知沉淀目标: ${target}`);
}

function buildBacktrackSinkPreviews(args, backtrack, now) {
  const title = backtrack.evidence?.title || `兴趣点回溯 ${args.query || args.anchorChunkId || backtrack.bookId}`;
  return standaloneSinkTargets(args).map((target) => buildMarkdownSinkPreview(args, target, now, {
    sourceType: "backtrack_evidence",
    idSuffix: "backtrack",
    bookId: backtrack.bookId,
    title,
    content: backtrack.evidenceMarkdown,
    historyEvent: "created_from_backtrack",
    metadata: {
      backtrack: {
        bookId: backtrack.bookId,
        query: backtrack.query,
        anchorChunkId: backtrack.anchorChunkId,
        window: backtrack.window,
        chunkIds: backtrack.chunkIds,
        rangeCount: backtrack.ranges.length,
        anchorCount: backtrack.anchors.length
      }
    }
  }));
}

function renderCardDigestMarkdown(args, cards) {
  const title = args.title || `${args.bookId} 阅读卡片 digest`;
  const lines = [
    "---",
    "type: co-reading-card-digest",
    `bookId: ${args.bookId}`,
    `cardCount: ${cards.length}`,
    `createdBy: ${args.createdBy || "nova"}`,
    `createdAt: ${new Date().toISOString()}`,
    "---",
    "",
    `# ${title}`,
    "",
    "## 卡片",
    ""
  ];
  if (!cards.length) {
    lines.push("_当前筛选范围暂无阅读卡片。_");
  }
  for (const card of cards) {
    const cardTitle = card.title || card.kicker || card.id || "阅读卡片";
    const anchor = [card.bookTitle, card.chunkTitle || card.chunkId].filter(Boolean).join(" / ");
    lines.push(`### ${cardTitle}`);
    if (anchor) lines.push(`- 来源: ${anchor}`);
    if (card.id) lines.push(`- cardId: \`${card.id}\``);
    if (card.scope || card.source || card.status) {
      lines.push(`- 状态: ${[card.scope, card.source, card.status].filter(Boolean).join(" / ")}`);
    }
    if (card.quote) lines.push("", `> ${String(card.quote).replace(/\r?\n/gu, "\n> ")}`);
    if (card.note) lines.push("", String(card.note));
    if (card.footer) lines.push("", `_ ${card.footer} _`.replace(/_ /g, "_").replace(/ _$/g, "_"));
    lines.push("");
  }
  lines.push("## 后续");
  lines.push("");
  lines.push("- [ ] 选择值得合并进主笔记的卡片。");
  lines.push("- [ ] 将已吸收的 proposed update 标记 resolved。");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

function buildCardDigestSinkPreviews(args, cards, now) {
  const title = args.title || `${args.bookId} 阅读卡片 digest`;
  return standaloneSinkTargets(args).map((target) => buildMarkdownSinkPreview(args, target, now, {
    sourceType: "card_digest",
    idSuffix: "card-digest",
    bookId: args.bookId,
    title,
    content: renderCardDigestMarkdown(args, cards),
    historyEvent: "created_from_cards",
    metadata: {
      cardDigest: {
        bookId: args.bookId,
        chunkId: args.chunkId || null,
        source: args.source || null,
        scope: args.scope || null,
        limit: args.limit || 20,
        offset: args.offset || 0,
        cardIds: cards.map((card) => card.id).filter(Boolean),
        cardCount: cards.length
      }
    }
  }));
}

function summarizePreview(preview) {
  return {
    previewId: preview.previewId,
    reviewId: preview.reviewId,
    sourceType: preview.sourceType || "review",
    bookId: preview.bookId,
    target: preview.target,
    status: preview.status,
    requireApproval: preview.requireApproval,
    destination: preview.destination,
    illustrationIds: preview.illustrationIds || [],
    rawTextIncluded: preview.rawTextIncluded,
    createdAt: preview.createdAt,
    updatedAt: preview.updatedAt
  };
}

function findPreview(store, previewId) {
  const preview = store.previews.find((item) => item.previewId === previewId);
  if (!preview) fail(`未找到沉淀预览: ${previewId}`);
  return preview;
}

function parsePluginJsonOutput(output, pluginName) {
  const text = String(output || "").trim();
  if (!text) fail(`${pluginName} 未返回 stdout。`);
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${pluginName} 返回了非 JSON 输出。`, { output: text.slice(0, 2000), error: error.message });
  }
}

function runNodePluginSync(scriptPath, payload, envPatch = {}, timeoutMs = 15000) {
  if (!fs.existsSync(scriptPath)) fail(`未找到目标插件脚本: ${scriptPath}`);
  const child = spawnSync(process.execPath, [scriptPath], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    timeout: timeoutMs,
    env: { ...process.env, ...envPatch },
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 10
  });
  if (child.error) fail(`执行插件失败: ${path.basename(scriptPath)}`, child.error.message);
  const parsed = parsePluginJsonOutput(child.stdout, path.basename(scriptPath));
  if (child.status !== 0 || parsed.status === "error") {
    fail(`插件执行返回错误: ${path.basename(scriptPath)}`, {
      status: child.status,
      stdout: parsed,
      stderr: String(child.stderr || "").slice(0, 4000)
    });
  }
  return {
    status: "success",
    payload: parsed,
    stderr: String(child.stderr || "").trim() || null
  };
}

function ensureMarkdownPath(notePath, fallback) {
  const raw = String(notePath || fallback || "co-reading-review.md").trim().replace(/\\/g, "/");
  const cleaned = raw.replace(/^\/+/, "").replace(/\0/g, "");
  const withoutTraversal = cleaned
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
  const finalPath = withoutTraversal || fallback || "co-reading-review.md";
  return /\.md$/i.test(finalPath) ? finalPath : `${finalPath}.md`;
}

function ensureTextPath(textPath, fallback) {
  const raw = String(textPath || fallback || "co-reading-obs.txt").trim().replace(/\\/g, "/");
  const cleaned = raw.replace(/^\/+/, "").replace(/\0/g, "");
  const withoutTraversal = cleaned
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
  const finalPath = withoutTraversal || fallback || "co-reading-obs.txt";
  return /\.txt$/i.test(finalPath) ? finalPath : `${finalPath}.txt`;
}

function localPathFromImageUri(uri) {
  const value = String(uri || "").trim();
  if (!value) return null;
  if (/^file:\/\//i.test(value)) {
    try {
      return decodeURIComponent(new URL(value).pathname).replace(/^\/([a-zA-Z]:\/)/, "$1");
    } catch {
      return null;
    }
  }
  if (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("\\\\")) return value;
  return null;
}

function copyObsidianIllustrationAssets(content, vaultRoot, preview, args) {
  const assetRoot = ensureMarkdownPath(args.assetFolder || `CoReading/_assets/${preview.reviewId || preview.previewId}`, "CoReading/_assets");
  const assetDir = resolveInside(vaultRoot, assetRoot.replace(/\.md$/i, ""));
  const copied = [];
  let nextContent = String(content || "");
  const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
  nextContent = nextContent.replace(imagePattern, (match, alt, uri) => {
    const sourcePath = localPathFromImageUri(uri);
    if (!sourcePath) return match;
    const resolvedSource = path.resolve(sourcePath);
    if (!fs.existsSync(resolvedSource) || !fs.statSync(resolvedSource).isFile()) {
      fail(`插图本地文件不存在，无法复制到 Obsidian: ${resolvedSource}`);
    }
    fs.mkdirSync(assetDir, { recursive: true });
    const safeName = `${slugPart(path.basename(resolvedSource, path.extname(resolvedSource)))}${path.extname(resolvedSource) || ".png"}`;
    const targetPath = resolveInside(assetDir, safeName);
    if (fs.existsSync(targetPath) && args.overwriteAssets !== true) {
      // Keep existing asset stable for idempotent exports.
    } else {
      fs.copyFileSync(resolvedSource, targetPath);
    }
    const relative = path.relative(vaultRoot, targetPath).replace(/\\/g, "/");
    copied.push({ sourcePath: resolvedSource, targetPath, relativePath: relative });
    return `![${alt}](${relative})`;
  });
  return { content: nextContent, copied };
}

function writeObsidianPreview(preview, args) {
  const vaultRootInput = args.vaultPath || preview.destination?.vaultPath || process.env.CO_READING_OBSIDIAN_VAULT_DIR;
  if (!vaultRootInput || !String(vaultRootInput).trim()) {
    fail("执行 Obsidian 预览需要 vaultPath 或 CO_READING_OBSIDIAN_VAULT_DIR。");
  }
  const vaultRoot = path.resolve(String(vaultRootInput));
  if (vaultRoot === path.parse(vaultRoot).root) fail(`拒绝把 Obsidian vault 根目录设置为磁盘根: ${vaultRoot}`);
  fs.mkdirSync(vaultRoot, { recursive: true });
  const notePath = ensureMarkdownPath(preview.destination?.notePath, `${preview.previewId}.md`);
  const targetPath = resolveInside(vaultRoot, notePath);
  if (fs.existsSync(targetPath) && args.overwrite !== true) {
    fail(`Obsidian 目标笔记已存在，传 overwrite=true 才会覆盖: ${targetPath}`);
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const assetResult = copyObsidianIllustrationAssets(preview.content, vaultRoot, preview, args);
  fs.writeFileSync(targetPath, assetResult.content, "utf8");
  return {
    adapter: "obsidian_file",
    targetPath,
    notePath,
    bytesWritten: Buffer.byteLength(assetResult.content, "utf8"),
    copiedAssets: assetResult.copied
  };
}

function resolveObsidianVaultRoot(args, preview = null) {
  const vaultRootInput = args.vaultPath || preview?.destination?.vaultPath || process.env.CO_READING_OBSIDIAN_VAULT_DIR;
  if (!vaultRootInput || !String(vaultRootInput).trim()) {
    fail("读取 Obsidian 笔记需要 vaultPath、preview.destination.vaultPath 或 CO_READING_OBSIDIAN_VAULT_DIR。");
  }
  const vaultRoot = path.resolve(String(vaultRootInput));
  if (vaultRoot === path.parse(vaultRoot).root) fail(`拒绝把 Obsidian vault 根目录设置为磁盘根: ${vaultRoot}`);
  return vaultRoot;
}

function resolveObsidianNoteTarget(args, dataDir) {
  let preview = null;
  if (args.previewId) {
    preview = findPreview(loadSinkPreviewStore(dataDir), args.previewId);
    if (preview.target !== "obsidian") fail(`预览目标不是 obsidian: ${preview.target}`);
  }
  const vaultRoot = resolveObsidianVaultRoot(args, preview);
  const notePath = ensureMarkdownPath(args.notePath || preview?.destination?.notePath, `${args.previewId || "co-reading-note"}.md`);
  const targetPath = resolveInside(vaultRoot, notePath);
  return { preview, vaultRoot, notePath, targetPath };
}

function lineSet(text) {
  return new Set(
    String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  );
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(String(text || ""), "utf8").digest("hex");
}

function diffTextSummary(currentContent, desiredContent) {
  const currentLines = lineSet(currentContent);
  const desiredLines = lineSet(desiredContent);
  const added = [...desiredLines].filter((line) => !currentLines.has(line));
  const removed = [...currentLines].filter((line) => !desiredLines.has(line));
  return {
    currentBytes: Buffer.byteLength(String(currentContent || ""), "utf8"),
    desiredBytes: Buffer.byteLength(String(desiredContent || ""), "utf8"),
    identical: String(currentContent || "") === String(desiredContent || ""),
    addedLineCount: added.length,
    removedLineCount: removed.length,
    addedPreview: added.slice(0, 20),
    removedPreview: removed.slice(0, 20)
  };
}

function desiredObsidianContent(args, preview) {
  const content = args.content !== undefined ? args.content : preview?.content;
  if (content === undefined || content === null) fail("需要 previewId 或 content 才能生成目标正文。");
  return String(content);
}

function obsidianProposedUpdateMarker(preview) {
  return `<!-- CoReading proposed update: ${preview?.previewId || "manual"} -->`;
}

function obsidianResolvedUpdateMarker(preview, resolvedBy) {
  return `<!-- CoReading proposed update resolved: ${preview?.previewId || "manual"} by ${resolvedBy || "nova"} -->`;
}

function obsidianResolvedUpdateMarkerPrefix(preview) {
  return `<!-- CoReading proposed update resolved: ${preview?.previewId || "manual"}`;
}

function obsidianIntegratedUpdateMarker(preview) {
  return `<!-- CoReading integrated update: ${preview?.previewId || "manual"} -->`;
}

function findObsidianResolvedUpdateMarker(content, preview) {
  const prefix = obsidianResolvedUpdateMarkerPrefix(preview);
  return String(content || "").split(/\r?\n/u).find((line) => line.startsWith(prefix) && line.endsWith("-->")) || null;
}

function summarizeObsidianProposedUpdates(content, preview) {
  const previewId = preview?.previewId || null;
  const blocks = [];
  const lines = String(content || "").split(/\r?\n/u);
  let current = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const proposed = line.match(/^<!-- CoReading proposed update: (.+?) -->$/u);
    const resolved = line.match(/^<!-- CoReading proposed update resolved: (.+?)(?: by (.*?))? -->$/u);
    if (proposed || resolved) {
      current = {
        previewId: proposed ? proposed[1] : resolved[1],
        status: proposed ? "proposed" : "resolved",
        resolvedBy: resolved ? resolved[2] || null : null,
        resolutionNote: null,
        marker: line,
        startLine: index + 1,
        endLine: null,
        contentPreview: ""
      };
      blocks.push(current);
      continue;
    }
    if (current && current.status === "resolved") {
      const resolution = line.match(/^<!-- CoReading resolution note: (.*?) -->$/u);
      if (resolution) {
        current.resolutionNote = resolution[1] || "";
        continue;
      }
    }
    if (current && line === "<!-- /CoReading proposed update -->") {
      current.endLine = index + 1;
      current = null;
      continue;
    }
    if (current && current.contentPreview.length < 600) {
      current.contentPreview = `${current.contentPreview}${current.contentPreview ? "\n" : ""}${line}`.slice(0, 600);
    }
  }
  const matched = previewId ? blocks.filter((block) => block.previewId === previewId) : blocks;
  const counts = matched.reduce(
    (acc, block) => {
      acc.total += 1;
      acc[block.status] += 1;
      return acc;
    },
    { total: 0, proposed: 0, resolved: 0 }
  );
  return { previewId, counts, blocks: matched };
}

function stripCoReadingManagedBlocks(content) {
  return String(content || "")
    .replace(/<!-- CoReading proposed update(?: resolved)?:[\s\S]*?<!-- \/CoReading proposed update -->/gu, "")
    .replace(/<!-- CoReading integrated update:[\s\S]*?<!-- \/CoReading integrated update -->/gu, "")
    .trim();
}

function findObsidianBlock(summary, args) {
  const wanted = args.blockPreviewId || args.previewId || summary.previewId;
  if (wanted) {
    const block = summary.blocks.find((item) => item.previewId === wanted);
    if (block) return block;
  }
  return summary.blocks.find((item) => item.status === "proposed") || summary.blocks[0] || null;
}

function buildObsidianIntegrationSuggestion(currentContent, desiredContent, block) {
  const currentMain = stripCoReadingManagedBlocks(currentContent);
  const proposedText = block?.contentPreview || desiredContent;
  const currentLines = lineSet(currentMain);
  const proposedLines = [...lineSet(proposedText)].filter((line) => !/^(- 来源:|- 合并者:|---|type:|reviewId:|bookId:|bookTitle:|planId:|sourceRange:|createdAt:|tags:)/u.test(line));
  const missingLines = proposedLines.filter((line) => !currentLines.has(line));
  const overlapLines = proposedLines.filter((line) => currentLines.has(line));
  let recommendation = "append_integrated_update";
  const reasons = [];
  if (!block) {
    recommendation = "manual_review";
    reasons.push("未找到可整合的 CoReading proposed update。");
  } else if (block.status === "resolved") {
    recommendation = "keep_resolved";
    reasons.push("该 proposed update 已标记为已整理。");
  } else if (!currentMain) {
    reasons.push("目标笔记几乎为空，适合追加整理正文作为起点。");
  } else if (missingLines.length === 0 && proposedLines.length > 0) {
    recommendation = "mark_resolved";
    reasons.push("proposed update 的主要行已出现在当前笔记正文中。");
  } else {
    reasons.push(`仍有 ${missingLines.length} 行 proposed 内容未出现在当前正文。`);
    if (overlapLines.length) reasons.push(`已有 ${overlapLines.length} 行与当前正文重合，应避免重复粘贴。`);
  }
  const draftLines = missingLines.length ? missingLines : proposedLines.slice(0, 12);
  const draft = draftLines.join("\n").slice(0, 2000);
  const choices = [
    {
      id: "keep_current",
      label: "保留当前正文",
      action: "不写入；只在确认后标记 proposed update 已整理。",
      risk: missingLines.length ? "可能遗漏 proposed update 中的新观察。" : "风险低，当前正文已覆盖主要内容。",
      recommended: recommendation === "mark_resolved" || recommendation === "keep_resolved"
    },
    {
      id: "append_integrated_update",
      label: "追加整合段落",
      action: "调用 obsidian_note_integrate，把草稿作为 integratedContent 追加到笔记末尾。",
      risk: overlapLines.length ? "可能与既有正文局部重复，需要人工删改草稿。" : "风险较低，不覆盖用户原文。",
      recommended: recommendation === "append_integrated_update"
    },
    {
      id: "replace_with_draft",
      label: "替换相关段落",
      action: "人工用草稿改写主笔记中的相关段落；当前工具不自动替换。",
      risk: "风险较高，可能误删用户原文，需要人工确认范围。",
      recommended: false
    },
    {
      id: "manual_review",
      label: "人工复核",
      action: "先回读笔记与 proposed update，再决定是否整合。",
      risk: "速度慢，但适合冲突较多或缺少明确锚点的情况。",
      recommended: recommendation === "manual_review"
    }
  ];
  return {
    recommendation,
    reasons,
    evidence: {
      currentMainBytes: Buffer.byteLength(currentMain, "utf8"),
      proposedLineCount: proposedLines.length,
      missingLineCount: missingLines.length,
      overlapLineCount: overlapLines.length,
      missingPreview: missingLines.slice(0, 12),
      overlapPreview: overlapLines.slice(0, 8)
    },
    draft,
    choices
  };
}

function splitMarkdownParagraphs(content) {
  const lines = String(content || "").split(/\r?\n/u);
  const paragraphs = [];
  let current = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) {
      if (current) {
        current.endLine = index;
        current.text = current.lines.join("\n").trim();
        paragraphs.push(current);
        current = null;
      }
      continue;
    }
    if (!current) current = { startLine: index + 1, endLine: index + 1, lines: [] };
    current.lines.push(line);
    current.endLine = index + 1;
  }
  if (current) {
    current.text = current.lines.join("\n").trim();
    paragraphs.push(current);
  }
  return paragraphs.filter((paragraph) => paragraph.text);
}

function scoreParagraphForDraft(paragraph, draftLines) {
  const paragraphLines = lineSet(paragraph.text);
  const overlap = draftLines.filter((line) => paragraphLines.has(line));
  const headingOverlap = draftLines.filter((line) => /^#{1,6}\s/u.test(line) && paragraphLines.has(line));
  return overlap.length + headingOverlap.length * 2;
}

function buildObsidianReplaceRangePreview(currentContent, draft, maxCandidates = 3) {
  const currentMain = stripCoReadingManagedBlocks(currentContent);
  const draftText = String(draft || "").trim();
  const draftLines = [...lineSet(draftText)];
  const paragraphs = splitMarkdownParagraphs(currentMain);
  const candidates = paragraphs
    .map((paragraph) => {
      const score = scoreParagraphForDraft(paragraph, draftLines);
      return {
        startLine: paragraph.startLine,
        endLine: paragraph.endLine,
        score,
        reason: score > 0 ? "overlap_with_draft" : "fallback_low_overlap",
        beforePreview: paragraph.text.slice(0, 800),
        afterPreview: draftText.slice(0, 1200)
      };
    })
    .sort((left, right) => (right.score - left.score) || (left.startLine - right.startLine))
    .slice(0, Math.max(1, Math.min(Number(maxCandidates || 3), 10)));
  if (!candidates.length && paragraphs.length) {
    const paragraph = paragraphs[0];
    candidates.push({
      startLine: paragraph.startLine,
      endLine: paragraph.endLine,
      score: 0,
      reason: "fallback_first_paragraph",
      beforePreview: paragraph.text.slice(0, 800),
      afterPreview: draftText.slice(0, 1200)
    });
  }
  return {
    currentMainBytes: Buffer.byteLength(currentMain, "utf8"),
    draftBytes: Buffer.byteLength(draftText, "utf8"),
    draftHash: sha256Text(draftText),
    paragraphCount: paragraphs.length,
    candidates
  };
}

function replaceMarkdownLineRange(content, startLine, endLine, replacement) {
  const normalized = String(content || "").replace(/\r\n/gu, "\n");
  const lines = normalized.split("\n");
  const start = Number(startLine);
  const end = Number(endLine);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > lines.length) {
    fail(`替换范围无效: L${startLine}-${endLine}`);
  }
  const replacementLines = markdownReplacementLines(replacement);
  lines.splice(start - 1, end - start + 1, ...replacementLines);
  return lines.join("\n");
}

function markdownReplacementLines(replacement) {
  return String(replacement || "").trim().split(/\r?\n/u);
}

function buildAppliedMarkdownLineRanges(ranges, replacement) {
  const replacementLineCount = markdownReplacementLines(replacement).length;
  let lineDelta = 0;
  return [...ranges]
    .sort((left, right) => left.startLine - right.startLine || left.endLine - right.endLine)
    .map((range) => {
      const removedLineCount = range.endLine - range.startLine + 1;
      const applied = {
        ...range,
        originalStartLine: range.startLine,
        originalEndLine: range.endLine,
        appliedStartLine: range.startLine + lineDelta,
        appliedEndLine: range.startLine + lineDelta + replacementLineCount - 1,
        replacementLineCount,
        removedLineCount
      };
      lineDelta += replacementLineCount - removedLineCount;
      return applied;
    });
}

function replaceMarkdownLineRanges(content, ranges, replacement) {
  const sortedRanges = [...ranges].sort((left, right) => left.startLine - right.startLine || left.endLine - right.endLine);
  sortedRanges.forEach((range, index) => {
    const previous = sortedRanges[index - 1];
    if (previous && range.startLine <= previous.endLine) {
      fail(`确认范围重叠，无法分别替换: L${previous.startLine}-${previous.endLine}, L${range.startLine}-${range.endLine}`);
    }
  });
  return sortedRanges
    .slice()
    .reverse()
    .reduce((nextContent, range) => replaceMarkdownLineRange(nextContent, range.startLine, range.endLine, replacement), content);
}

function handleObsidianNoteRead(args, dataDir) {
  const { preview, vaultRoot, notePath, targetPath } = resolveObsidianNoteTarget(args, dataDir);
  const exists = fs.existsSync(targetPath);
  const content = exists ? fs.readFileSync(targetPath, "utf8") : "";
  return {
    adapter: "obsidian_file",
    previewId: preview?.previewId || null,
    vaultRoot,
    notePath,
    targetPath,
    exists,
    bytes: exists ? Buffer.byteLength(content, "utf8") : 0,
    content: args.includeContent === false ? undefined : content
  };
}

function handleObsidianNotePreviewReplaceRange(args, dataDir) {
  const { preview, vaultRoot, notePath, targetPath } = resolveObsidianNoteTarget(args, dataDir);
  const exists = fs.existsSync(targetPath);
  const currentContent = exists ? fs.readFileSync(targetPath, "utf8") : "";
  const suggestion = handleObsidianNoteSuggestIntegration({ ...args, includeDraft: true }, dataDir);
  const draft = args.draft !== undefined ? String(args.draft) : suggestion.draft;
  const previewResult = buildObsidianReplaceRangePreview(currentContent, draft, args.maxCandidates);
  return {
    adapter: "obsidian_file",
    previewId: preview?.previewId || args.previewId || null,
    blockPreviewId: suggestion.blockPreviewId || args.blockPreviewId || null,
    vaultRoot,
    notePath,
    targetPath,
    exists,
    readOnly: true,
    replacementAllowed: false,
    reason: "preview_only_manual_confirmation_required",
    recommendation: suggestion.recommendation,
    draft,
    ...previewResult
  };
}

function handleObsidianNoteConfirmReplaceRange(args, dataDir) {
  if (args.confirmReplace !== true) fail("确认替换需要 confirmReplace=true。");
  const { preview, vaultRoot, notePath, targetPath } = resolveObsidianNoteTarget(args, dataDir);
  const currentContent = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf8") : "";
  if (!currentContent) fail("目标 Obsidian 笔记不存在或为空，无法替换范围。");
  const suggestion = handleObsidianNoteSuggestIntegration({ ...args, includeDraft: true }, dataDir);
  const draft = args.draft !== undefined ? String(args.draft).trim() : String(suggestion.draft || "").trim();
  if (!draft) fail("确认替换需要 draft 或可用整合草稿。");
  const draftHash = sha256Text(draft);
  if (String(args.expectedDraftHash || "").trim() !== draftHash) {
    fail("草稿哈希不匹配，请重新预览替换范围后再确认。");
  }
  const previewResult = buildObsidianReplaceRangePreview(currentContent, draft, 10);
  const requestedRanges = Array.isArray(args.selectedRanges) && args.selectedRanges.length
    ? args.selectedRanges
    : [{ startLine: args.startLine, endLine: args.endLine }];
  const selectedRanges = requestedRanges.map((range) => {
    const startLine = Number(range.startLine);
    const endLine = Number(range.endLine);
    const candidate = previewResult.candidates.find((item) => item.startLine === startLine && item.endLine === endLine);
    if (!candidate) fail(`确认范围不在当前候选中: L${range.startLine}-${range.endLine}`);
    return { startLine, endLine, score: candidate.score, reason: candidate.reason };
  }).sort((left, right) => left.startLine - right.startLine || left.endLine - right.endLine);
  if (!selectedRanges.length) fail("确认替换需要 startLine/endLine 或 selectedRanges。");
  const combinedRange = {
    startLine: Math.min(...selectedRanges.map((range) => range.startLine)),
    endLine: Math.max(...selectedRanges.map((range) => range.endLine))
  };
  const replacementMode = selectedRanges.length > 1 ? "separate_ranges" : "single_range";
  const beforeBytes = Buffer.byteLength(currentContent, "utf8");
  const appliedRanges = buildAppliedMarkdownLineRanges(selectedRanges, draft);
  let nextContent = replaceMarkdownLineRanges(currentContent, selectedRanges, draft);
  const blockPreviewId = suggestion.blockPreviewId || args.blockPreviewId || preview?.previewId || null;
  const markerPreview = blockPreviewId ? { previewId: blockPreviewId } : preview;
  const proposedMarker = obsidianProposedUpdateMarker(markerPreview);
  let resolved = false;
  let resolvedMarker = findObsidianResolvedUpdateMarker(nextContent, markerPreview);
  if (nextContent.includes(proposedMarker)) {
    resolvedMarker = obsidianResolvedUpdateMarker(markerPreview, args.replacedBy || args.updatedBy || "nova");
    const rangeLabel = selectedRanges.map((range) => `L${range.startLine}-${range.endLine}`).join(", ");
    const resolutionNote = args.resolutionNote ? String(args.resolutionNote).replace(/\r?\n/gu, " ").trim().slice(0, 500) : `已人工确认替换范围 ${rangeLabel}。`;
    nextContent = nextContent.replace(proposedMarker, `${resolvedMarker}\n<!-- CoReading resolution note: ${resolutionNote} -->`);
    resolved = true;
  } else {
    resolved = Boolean(resolvedMarker);
  }
  fs.writeFileSync(targetPath, nextContent, "utf8");
  return {
    adapter: "obsidian_file",
    previewId: preview?.previewId || args.previewId || null,
    blockPreviewId,
    vaultRoot,
    notePath,
    targetPath,
    replaced: true,
    safeWrite: true,
    confirmReplace: true,
    startLine: combinedRange.startLine,
    endLine: combinedRange.endLine,
    draftHash,
    replacementMode,
    selectedRanges,
    appliedRanges,
    combinedRange,
    resolved,
    resolvedMarker,
    beforeBytes,
    bytesWritten: Buffer.byteLength(nextContent, "utf8")
  };
}

function handleObsidianNoteSuggestIntegration(args, dataDir) {
  const { preview, vaultRoot, notePath, targetPath } = resolveObsidianNoteTarget(args, dataDir);
  const exists = fs.existsSync(targetPath);
  const currentContent = exists ? fs.readFileSync(targetPath, "utf8") : "";
  const desiredContent = args.content !== undefined ? String(args.content) : (preview?.content ? String(preview.content) : "");
  const summary = summarizeObsidianProposedUpdates(currentContent, preview);
  const block = findObsidianBlock(summary, args);
  const suggestion = buildObsidianIntegrationSuggestion(currentContent, desiredContent, block);
  return {
    adapter: "obsidian_file",
    previewId: preview?.previewId || args.previewId || null,
    blockPreviewId: block?.previewId || args.blockPreviewId || null,
    vaultRoot,
    notePath,
    targetPath,
    exists,
    readOnly: true,
    block: block ? { ...block, contentPreview: args.includeDraft === false ? undefined : block.contentPreview } : null,
    recommendation: suggestion.recommendation,
    reasons: suggestion.reasons,
    evidence: suggestion.evidence,
    integrationChoices: suggestion.choices,
    draft: args.includeDraft === false ? undefined : suggestion.draft
  };
}

function handleObsidianNoteApplyIntegrationChoice(args, dataDir) {
  const choiceId = String(args.choiceId || "").trim();
  if (!choiceId) fail("需要 choiceId。");
  const suggestion = handleObsidianNoteSuggestIntegration({ ...args, includeDraft: true }, dataDir);
  const choice = (suggestion.integrationChoices || []).find((item) => item.id === choiceId);
  if (!choice) fail(`未知整合分支: ${choiceId}`);
  if (choiceId === "append_integrated_update") {
    const currentContent = fs.existsSync(suggestion.targetPath) ? fs.readFileSync(suggestion.targetPath, "utf8") : "";
    const markerPreview = suggestion.blockPreviewId ? { previewId: suggestion.blockPreviewId } : { previewId: suggestion.previewId };
    if (currentContent.includes(obsidianResolvedUpdateMarkerPrefix(markerPreview))) {
      return {
        adapter: "obsidian_file",
        previewId: suggestion.previewId,
        blockPreviewId: suggestion.blockPreviewId,
        vaultRoot: suggestion.vaultRoot,
        notePath: suggestion.notePath,
        targetPath: suggestion.targetPath,
        choiceId,
        choice,
        applied: false,
        safeWrite: false,
        reason: "already_resolved",
        message: "关联 proposed update 已整理，不再追加 integrated update。",
        suggestion: {
          recommendation: suggestion.recommendation,
          evidence: suggestion.evidence
        }
      };
    }
    const integratedContent = args.integratedContent || args.content || suggestion.draft;
    if (!integratedContent) fail("append_integrated_update 需要 integratedContent 或可用草稿。");
    const result = handleObsidianNoteIntegrate({
      ...args,
      integratedContent,
      integratedBy: args.integratedBy || "nova",
      resolutionNote: args.resolutionNote || "已按整合建议追加 integrated update。"
    }, dataDir);
    return {
      ...result,
      choiceId,
      choice,
      applied: result.integrated === true,
      safeWrite: true,
      suggestion: {
        recommendation: suggestion.recommendation,
        evidence: suggestion.evidence
      }
    };
  }
  if (choiceId === "keep_current") {
    const result = handleObsidianNoteResolve({
      ...args,
      resolvedBy: args.resolvedBy || args.integratedBy || "nova",
      resolutionNote: args.resolutionNote || "已选择保留当前正文，不再追加 proposed update。"
    }, dataDir);
    return {
      ...result,
      choiceId,
      choice,
      applied: result.resolved === true,
      safeWrite: true,
      suggestion: {
        recommendation: suggestion.recommendation,
        evidence: suggestion.evidence
      }
    };
  }
  return {
    adapter: "obsidian_file",
    previewId: suggestion.previewId,
    blockPreviewId: suggestion.blockPreviewId,
    vaultRoot: suggestion.vaultRoot,
    notePath: suggestion.notePath,
    targetPath: suggestion.targetPath,
    choiceId,
    choice,
    applied: false,
    safeWrite: false,
    reason: choiceId === "replace_with_draft" ? "manual_replace_required" : "manual_review_required",
    message: choice.action,
    suggestion: {
      recommendation: suggestion.recommendation,
      evidence: suggestion.evidence,
      draft: suggestion.draft
    }
  };
}

function handleObsidianNoteStatus(args, dataDir) {
  const { preview, vaultRoot, notePath, targetPath } = resolveObsidianNoteTarget(args, dataDir);
  const exists = fs.existsSync(targetPath);
  const content = exists ? fs.readFileSync(targetPath, "utf8") : "";
  const summary = summarizeObsidianProposedUpdates(content, preview);
  const blocks = args.includeContentPreview === false
    ? summary.blocks.map(({ contentPreview, ...block }) => block)
    : summary.blocks;
  return {
    adapter: "obsidian_file",
    previewId: preview?.previewId || null,
    vaultRoot,
    notePath,
    targetPath,
    exists,
    bytes: exists ? Buffer.byteLength(content, "utf8") : 0,
    counts: summary.counts,
    blocks
  };
}

function listMarkdownFiles(root, limit, offset = 0) {
  const matched = [];
  const stack = [root];
  const targetCount = offset + limit + 1;
  while (stack.length && matched.length < targetCount) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((left, right) => right.name.localeCompare(left.name));
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".")) stack.push(fullPath);
      } else if (entry.isFile() && /\.md$/iu.test(entry.name)) {
        matched.push(fullPath);
        if (matched.length >= targetCount) break;
      }
    }
  }
  const files = matched.slice(offset, offset + limit);
  const hasMore = matched.length > offset + limit;
  return {
    files,
    scannedMarkdownFiles: matched.length,
    fileOffset: offset,
    fileLimit: limit,
    hasMore,
    nextOffset: hasMore ? offset + limit : null
  };
}

function handleObsidianVaultStatus(args) {
  const vaultRoot = resolveObsidianVaultRoot(args);
  const folder = args.folder ? String(args.folder).trim().replace(/\\/g, "/").replace(/^\/+/u, "").replace(/\/+$/u, "") : "";
  const scanRoot = folder ? resolveInside(vaultRoot, folder) : vaultRoot;
  if (!fs.existsSync(scanRoot) || !fs.statSync(scanRoot).isDirectory()) {
    fail(`Obsidian 扫描目录不存在: ${scanRoot}`);
  }
  const fileLimit = Math.max(1, Math.min(Number(args.limit || args.maxFiles || 200), 1000));
  const fileOffset = Math.max(0, Math.floor(Number(args.offset || 0)));
  const maxBytesPerFile = Math.max(1024, Math.min(Number(args.maxBytesPerFile || 1_000_000), 5_000_000));
  const wantedStatus = args.status || "all";
  const page = listMarkdownFiles(scanRoot, fileLimit, fileOffset);
  const files = page.files;
  const notes = [];
  const skippedFiles = [];
  const counts = { total: 0, proposed: 0, resolved: 0 };
  for (const filePath of files) {
    const stat = fs.statSync(filePath);
    if (stat.size > maxBytesPerFile) {
      skippedFiles.push({
        notePath: path.relative(vaultRoot, filePath).replace(/\\/g, "/"),
        targetPath: filePath,
        bytes: stat.size,
        reason: "maxBytesPerFile"
      });
      continue;
    }
    const content = fs.readFileSync(filePath, "utf8");
    const summary = summarizeObsidianProposedUpdates(content, null);
    let blocks = summary.blocks.filter((block) => wantedStatus === "all" || block.status === wantedStatus);
    if (args.includeContentPreview === false) {
      blocks = blocks.map(({ contentPreview, ...block }) => block);
    }
    if (!blocks.length) continue;
    const noteCounts = blocks.reduce(
      (acc, block) => {
        acc.total += 1;
        acc[block.status] += 1;
        return acc;
      },
      { total: 0, proposed: 0, resolved: 0 }
    );
    counts.total += noteCounts.total;
    counts.proposed += noteCounts.proposed;
    counts.resolved += noteCounts.resolved;
    notes.push({
      notePath: path.relative(vaultRoot, filePath).replace(/\\/g, "/"),
      targetPath: filePath,
      bytes: stat.size,
      counts: noteCounts,
      blocks
    });
  }
  return {
    adapter: "obsidian_file",
    vaultRoot,
    folder,
    scanRoot,
    scannedFiles: files.length,
    scannedMarkdownFiles: page.scannedMarkdownFiles,
    maxFiles: fileLimit,
    limit: fileLimit,
    offset: fileOffset,
    hasMore: page.hasMore,
    nextOffset: page.nextOffset,
    maxBytesPerFile,
    skippedFiles,
    status: wantedStatus,
    counts,
    notes
  };
}

function handleObsidianVaultSnapshot(args, dataDir) {
  const status = handleObsidianVaultStatus({ ...args, includeContentPreview: args.includeContentPreview === true });
  const store = loadVaultSnapshotStore(dataDir);
  const now = new Date().toISOString();
  const snapshot = {
    snapshotId: `vault-snapshot-${compactTimestamp(new Date())}-${shortRandomId()}`,
    label: args.label || "",
    createdAt: now,
    createdBy: args.createdBy || "Nova",
    vaultRoot: status.vaultRoot,
    folder: status.folder,
    scanRoot: status.scanRoot,
    status: status.status,
    counts: status.counts,
    scannedFiles: status.scannedFiles,
    scannedMarkdownFiles: status.scannedMarkdownFiles,
    hasMore: status.hasMore,
    nextOffset: status.nextOffset,
    skippedFiles: status.skippedFiles,
    notes: status.notes
  };
  store.snapshots.unshift(snapshot);
  const maxSnapshots = Math.max(1, Math.min(Number(args.maxSnapshots || 50), 200));
  store.snapshots = store.snapshots.slice(0, maxSnapshots);
  saveVaultSnapshotStore(dataDir, store);
  return {
    adapter: "obsidian_file",
    snapshotPath: vaultSnapshotsPath(dataDir),
    snapshot,
    status
  };
}

function handleObsidianVaultSnapshotList(args, dataDir) {
  const store = loadVaultSnapshotStore(dataDir);
  const limit = Math.max(1, Math.min(Number(args.limit || 20), 100));
  const offset = Math.max(0, Math.floor(Number(args.offset || 0)));
  let snapshots = store.snapshots;
  if (args.vaultPath) {
    const vaultRoot = path.resolve(String(args.vaultPath));
    snapshots = snapshots.filter((snapshot) => path.resolve(snapshot.vaultRoot) === vaultRoot);
  }
  if (args.folder !== undefined) {
    const folder = String(args.folder || "").trim().replace(/\\/g, "/").replace(/^\/+/u, "").replace(/\/+$/u, "");
    snapshots = snapshots.filter((snapshot) => (snapshot.folder || "") === folder);
  }
  const page = snapshots.slice(offset, offset + limit).map((snapshot) => {
    if (args.includeNotes === true) return snapshot;
    const { notes, ...summary } = snapshot;
    return { ...summary, noteCount: Array.isArray(notes) ? notes.length : 0 };
  });
  return {
    adapter: "obsidian_file",
    snapshotPath: vaultSnapshotsPath(dataDir),
    total: snapshots.length,
    limit,
    offset,
    hasMore: offset + limit < snapshots.length,
    nextOffset: offset + limit < snapshots.length ? offset + limit : null,
    snapshots: page
  };
}

function snapshotBlockKey(note, block) {
  return `${note.notePath || ""}#${block.previewId || block.marker || ""}`;
}

function snapshotBlockIndex(snapshot) {
  const index = new Map();
  for (const note of snapshot.notes || []) {
    for (const block of note.blocks || []) {
      index.set(snapshotBlockKey(note, block), {
        notePath: note.notePath,
        targetPath: note.targetPath,
        bytes: note.bytes,
        previewId: block.previewId,
        status: block.status,
        resolvedBy: block.resolvedBy || null,
        resolutionNote: block.resolutionNote || null,
        marker: block.marker,
        startLine: block.startLine,
        endLine: block.endLine
      });
    }
  }
  return index;
}

function findSnapshotForDiff(store, id, fallbackIndex) {
  if (id) {
    const snapshot = store.snapshots.find((item) => item.snapshotId === id);
    if (!snapshot) fail(`未找到 vault snapshot: ${id}`);
    return snapshot;
  }
  const snapshot = store.snapshots[fallbackIndex];
  if (!snapshot) fail("至少需要两个 vault snapshot，或传 beforeSnapshotId/afterSnapshotId。");
  return snapshot;
}

function handleObsidianVaultSnapshotDiff(args, dataDir) {
  const store = loadVaultSnapshotStore(dataDir);
  const after = findSnapshotForDiff(store, args.afterSnapshotId, 0);
  const before = findSnapshotForDiff(store, args.beforeSnapshotId, args.afterSnapshotId ? 1 : 1);
  if (before.snapshotId === after.snapshotId) fail("beforeSnapshotId 和 afterSnapshotId 不能相同。");
  const beforeBlocks = snapshotBlockIndex(before);
  const afterBlocks = snapshotBlockIndex(after);
  const added = [];
  const removed = [];
  const statusChanged = [];
  for (const [key, block] of afterBlocks.entries()) {
    const previous = beforeBlocks.get(key);
    if (!previous) {
      added.push(block);
      continue;
    }
    if (
      previous.status !== block.status ||
      previous.resolvedBy !== block.resolvedBy ||
      previous.resolutionNote !== block.resolutionNote ||
      previous.startLine !== block.startLine ||
      previous.endLine !== block.endLine
    ) {
      statusChanged.push({ before: previous, after: block });
    }
  }
  for (const [key, block] of beforeBlocks.entries()) {
    if (!afterBlocks.has(key)) removed.push(block);
  }
  const changeStatus = args.changeStatus || "all";
  const statusMatches = (block) => changeStatus === "all" || block?.status === changeStatus;
  const filteredAdded = added.filter(statusMatches);
  const filteredRemoved = removed.filter(statusMatches);
  const filteredStatusChanged = statusChanged.filter((item) => changeStatus === "all" || statusMatches(item.after));
  const countDelta = {
    total: (after.counts?.total || 0) - (before.counts?.total || 0),
    proposed: (after.counts?.proposed || 0) - (before.counts?.proposed || 0),
    resolved: (after.counts?.resolved || 0) - (before.counts?.resolved || 0),
    notes: (after.notes?.length || 0) - (before.notes?.length || 0),
    skippedFiles: (after.skippedFiles?.length || 0) - (before.skippedFiles?.length || 0)
  };
  const includeBlocks = args.includeBlocks === true;
  return {
    adapter: "obsidian_file",
    snapshotPath: vaultSnapshotsPath(dataDir),
    before: {
      snapshotId: before.snapshotId,
      label: before.label,
      createdAt: before.createdAt,
      counts: before.counts,
      noteCount: before.notes?.length || 0
    },
    after: {
      snapshotId: after.snapshotId,
      label: after.label,
      createdAt: after.createdAt,
      counts: after.counts,
      noteCount: after.notes?.length || 0
    },
    changed: Boolean(added.length || removed.length || statusChanged.length),
    filteredChanged: Boolean(filteredAdded.length || filteredRemoved.length || filteredStatusChanged.length),
    filter: { changeStatus },
    countDelta,
    changes: {
      addedCount: filteredAdded.length,
      removedCount: filteredRemoved.length,
      statusChangedCount: filteredStatusChanged.length,
      unfilteredAddedCount: added.length,
      unfilteredRemovedCount: removed.length,
      unfilteredStatusChangedCount: statusChanged.length,
      added: includeBlocks ? filteredAdded : filteredAdded.slice(0, 20),
      removed: includeBlocks ? filteredRemoved : filteredRemoved.slice(0, 20),
      statusChanged: includeBlocks ? filteredStatusChanged : filteredStatusChanged.slice(0, 20)
    }
  };
}

function handleObsidianVaultIndexBuild(args, dataDir) {
  const status = handleObsidianVaultStatus({
    ...args,
    status: "all",
    limit: args.limit || args.maxFiles || 1000,
    offset: 0,
    includeContentPreview: args.includeContentPreview === true
  });
  const now = new Date().toISOString();
  const blocks = [];
  for (const note of status.notes || []) {
    for (const block of note.blocks || []) {
      blocks.push({
        notePath: note.notePath,
        targetPath: note.targetPath,
        previewId: block.previewId,
        status: block.status,
        resolvedBy: block.resolvedBy || null,
        resolutionNote: block.resolutionNote || null,
        startLine: block.startLine,
        endLine: block.endLine,
        marker: block.marker,
        contentPreview: args.includeContentPreview === true ? block.contentPreview || "" : undefined
      });
    }
  }
  const index = {
    indexId: `vault-index-${compactTimestamp(new Date())}-${shortRandomId()}`,
    label: args.label || "",
    createdAt: now,
    createdBy: args.createdBy || "Nova",
    vaultRoot: status.vaultRoot,
    folder: status.folder,
    scanRoot: status.scanRoot,
    counts: status.counts,
    scannedFiles: status.scannedFiles,
    scannedMarkdownFiles: status.scannedMarkdownFiles,
    hasMore: status.hasMore,
    nextOffset: status.nextOffset,
    skippedFiles: status.skippedFiles,
    notes: status.notes,
    blocks
  };
  const store = loadVaultIndexStore(dataDir);
  store.indexes.unshift(index);
  const maxIndexes = Math.max(1, Math.min(Number(args.maxIndexes || 20), 100));
  store.indexes = store.indexes.slice(0, maxIndexes);
  saveVaultIndexStore(dataDir, store);
  return {
    adapter: "obsidian_file",
    indexPath: vaultIndexesPath(dataDir),
    index: { ...index, notes: undefined, blocks: undefined, noteCount: index.notes.length, blockCount: blocks.length },
    status
  };
}

function filterVaultIndexBlocks(index, args) {
  let blocks = index.blocks || [];
  const wantedStatus = args.status || "all";
  if (wantedStatus !== "all") blocks = blocks.filter((block) => block.status === wantedStatus);
  if (args.previewId || args.blockPreviewId) {
    const wantedId = String(args.previewId || args.blockPreviewId);
    blocks = blocks.filter((block) => block.previewId === wantedId);
  }
  if (args.notePath) {
    const wantedNotePath = String(args.notePath).replace(/\\/g, "/");
    blocks = blocks.filter((block) => block.notePath === wantedNotePath);
  }
  return blocks;
}

function handleObsidianVaultIndexList(args, dataDir) {
  const store = loadVaultIndexStore(dataDir);
  const limit = Math.max(1, Math.min(Number(args.limit || 20), 100));
  const offset = Math.max(0, Math.floor(Number(args.offset || 0)));
  let indexes = store.indexes;
  if (args.vaultPath) {
    const vaultRoot = path.resolve(String(args.vaultPath));
    indexes = indexes.filter((index) => path.resolve(index.vaultRoot) === vaultRoot);
  }
  if (args.folder !== undefined) {
    const folder = String(args.folder || "").trim().replace(/\\/g, "/").replace(/^\/+/u, "").replace(/\/+$/u, "");
    indexes = indexes.filter((index) => (index.folder || "") === folder);
  }
  const page = indexes.slice(offset, offset + limit).map((index) => ({
    indexId: index.indexId,
    label: index.label,
    createdAt: index.createdAt,
    createdBy: index.createdBy,
    vaultRoot: index.vaultRoot,
    folder: index.folder,
    counts: index.counts,
    scannedFiles: index.scannedFiles,
    scannedMarkdownFiles: index.scannedMarkdownFiles,
    hasMore: index.hasMore,
    nextOffset: index.nextOffset,
    skippedFileCount: index.skippedFiles?.length || 0,
    noteCount: index.notes?.length || 0,
    blockCount: index.blocks?.length || 0
  }));
  return {
    adapter: "obsidian_file",
    indexPath: vaultIndexesPath(dataDir),
    total: indexes.length,
    limit,
    offset,
    hasMore: offset + limit < indexes.length,
    nextOffset: offset + limit < indexes.length ? offset + limit : null,
    indexes: page
  };
}

function handleObsidianVaultIndexGet(args, dataDir) {
  const store = loadVaultIndexStore(dataDir);
  const index = args.indexId
    ? store.indexes.find((item) => item.indexId === args.indexId)
    : store.indexes[0];
  if (!index) fail(args.indexId ? `未找到 vault index: ${args.indexId}` : "尚未保存 vault index。");
  const limit = Math.max(1, Math.min(Number(args.limit || 50), 500));
  const offset = Math.max(0, Math.floor(Number(args.offset || 0)));
  const blocks = filterVaultIndexBlocks(index, args);
  const page = blocks.slice(offset, offset + limit);
  const summary = {
    indexId: index.indexId,
    label: index.label,
    createdAt: index.createdAt,
    createdBy: index.createdBy,
    vaultRoot: index.vaultRoot,
    folder: index.folder,
    counts: index.counts,
    noteCount: index.notes?.length || 0,
    blockCount: index.blocks?.length || 0
  };
  return {
    adapter: "obsidian_file",
    indexPath: vaultIndexesPath(dataDir),
    index: summary,
    filter: {
      status: args.status || "all",
      previewId: args.previewId || args.blockPreviewId || null,
      notePath: args.notePath || null
    },
    total: blocks.length,
    limit,
    offset,
    hasMore: offset + limit < blocks.length,
    nextOffset: offset + limit < blocks.length ? offset + limit : null,
    blocks: page
  };
}

function vaultIndexBlockMap(blocks) {
  const index = new Map();
  for (const block of blocks || []) {
    index.set(`${block.notePath || ""}#${block.previewId || block.marker || ""}`, block);
  }
  return index;
}

function handleObsidianVaultIndexRefreshCheck(args, dataDir) {
  const store = loadVaultIndexStore(dataDir);
  const saved = args.indexId
    ? store.indexes.find((item) => item.indexId === args.indexId)
    : store.indexes[0];
  if (!saved) fail(args.indexId ? `未找到 vault index: ${args.indexId}` : "尚未保存 vault index。");
  const currentStatus = handleObsidianVaultStatus({
    vaultPath: args.vaultPath || saved.vaultRoot,
    folder: args.folder !== undefined ? args.folder : saved.folder,
    status: "all",
    limit: args.limit || args.maxFiles || saved.scannedMarkdownFiles || 1000,
    offset: 0,
    maxBytesPerFile: args.maxBytesPerFile,
    includeContentPreview: false
  });
  const currentBlocks = [];
  for (const note of currentStatus.notes || []) {
    for (const block of note.blocks || []) {
      currentBlocks.push({
        notePath: note.notePath,
        targetPath: note.targetPath,
        previewId: block.previewId,
        status: block.status,
        resolvedBy: block.resolvedBy || null,
        resolutionNote: block.resolutionNote || null,
        startLine: block.startLine,
        endLine: block.endLine,
        marker: block.marker
      });
    }
  }
  const savedBlocks = vaultIndexBlockMap(saved.blocks || []);
  const liveBlocks = vaultIndexBlockMap(currentBlocks);
  const added = [];
  const removed = [];
  const statusChanged = [];
  for (const [key, block] of liveBlocks.entries()) {
    const previous = savedBlocks.get(key);
    if (!previous) {
      added.push(block);
      continue;
    }
    if (
      previous.status !== block.status ||
      previous.resolvedBy !== block.resolvedBy ||
      previous.resolutionNote !== block.resolutionNote ||
      previous.startLine !== block.startLine ||
      previous.endLine !== block.endLine
    ) {
      statusChanged.push({ before: previous, after: block });
    }
  }
  for (const [key, block] of savedBlocks.entries()) {
    if (!liveBlocks.has(key)) removed.push(block);
  }
  const countDelta = {
    total: (currentStatus.counts?.total || 0) - (saved.counts?.total || 0),
    proposed: (currentStatus.counts?.proposed || 0) - (saved.counts?.proposed || 0),
    resolved: (currentStatus.counts?.resolved || 0) - (saved.counts?.resolved || 0),
    notes: (currentStatus.notes?.length || 0) - (saved.notes?.length || 0),
    skippedFiles: (currentStatus.skippedFiles?.length || 0) - (saved.skippedFiles?.length || 0)
  };
  const includeBlocks = args.includeBlocks === true;
  const stale = Boolean(added.length || removed.length || statusChanged.length || currentStatus.hasMore);
  return {
    adapter: "obsidian_file",
    indexPath: vaultIndexesPath(dataDir),
    index: {
      indexId: saved.indexId,
      label: saved.label,
      createdAt: saved.createdAt,
      counts: saved.counts,
      noteCount: saved.notes?.length || 0,
      blockCount: saved.blocks?.length || 0
    },
    current: {
      vaultRoot: currentStatus.vaultRoot,
      folder: currentStatus.folder,
      counts: currentStatus.counts,
      noteCount: currentStatus.notes?.length || 0,
      blockCount: currentBlocks.length,
      scannedFiles: currentStatus.scannedFiles,
      scannedMarkdownFiles: currentStatus.scannedMarkdownFiles,
      hasMore: currentStatus.hasMore,
      nextOffset: currentStatus.nextOffset,
      skippedFiles: currentStatus.skippedFiles
    },
    stale,
    reason: stale ? "index_stale_or_partial_scan" : "index_fresh",
    countDelta,
    changes: {
      addedCount: added.length,
      removedCount: removed.length,
      statusChangedCount: statusChanged.length,
      added: includeBlocks ? added : added.slice(0, 20),
      removed: includeBlocks ? removed : removed.slice(0, 20),
      statusChanged: includeBlocks ? statusChanged : statusChanged.slice(0, 20)
    },
    recommendation: stale ? "rebuild_index" : "keep_index"
  };
}

function handleObsidianVaultIndexRefresh(args, dataDir) {
  const check = handleObsidianVaultIndexRefreshCheck({ ...args, includeBlocks: args.includeBlocks === true }, dataDir);
  if (check.stale !== true && args.force !== true) {
    return {
      adapter: "obsidian_file",
      refreshed: false,
      reason: "index_fresh",
      recommendation: "keep_index",
      check
    };
  }
  if (args.confirmRefresh !== true) {
    return {
      adapter: "obsidian_file",
      refreshed: false,
      reason: "confirmation_required",
      recommendation: "confirm_refresh",
      check
    };
  }
  const built = handleObsidianVaultIndexBuild({
    vaultPath: args.vaultPath || check.current?.vaultRoot,
    folder: args.folder !== undefined ? args.folder : check.current?.folder,
    limit: args.limit || args.maxFiles || check.current?.scannedMarkdownFiles || 1000,
    maxBytesPerFile: args.maxBytesPerFile,
    includeContentPreview: args.includeContentPreview === true,
    maxIndexes: args.maxIndexes,
    label: args.label || `refresh ${compactTimestamp(new Date())}`,
    createdBy: args.createdBy || "Nova"
  }, dataDir);
  return {
    adapter: "obsidian_file",
    refreshed: true,
    reason: "index_rebuilt",
    recommendation: "keep_index",
    previousCheck: check,
    refreshedIndex: built.index,
    indexPath: built.indexPath
  };
}

function syncPlanActionFromChange(kind, payload) {
  if (kind === "statusChanged") {
    const before = payload.before || {};
    const after = payload.after || {};
    return {
      actionId: `sync-${kind}-${slugPart(after.previewId || before.previewId || shortRandomId())}`,
      kind,
      notePath: after.notePath || before.notePath,
      previewId: after.previewId || before.previewId,
      beforeStatus: before.status || null,
      afterStatus: after.status || null,
      recommendation: after.status === "resolved" ? "mark_local_index_resolved_or_rebuild" : "review_status_change",
      commandHint: after.status === "resolved"
        ? { command: "obsidian_vault_index_refresh", confirmRefresh: true }
        : { command: "obsidian_note_status", notePath: after.notePath || before.notePath, blockPreviewId: after.previewId || before.previewId },
      evidence: {
        startLine: after.startLine || before.startLine || null,
        endLine: after.endLine || before.endLine || null,
        marker: after.marker || before.marker || ""
      }
    };
  }
  const block = payload || {};
  return {
    actionId: `sync-${kind}-${slugPart(block.previewId || shortRandomId())}`,
    kind,
    notePath: block.notePath,
    previewId: block.previewId,
    status: block.status,
    recommendation: kind === "added" ? "review_new_vault_block" : "review_missing_vault_block",
    commandHint: kind === "added"
      ? { command: "obsidian_note_status", notePath: block.notePath, blockPreviewId: block.previewId }
      : { command: "obsidian_vault_index_refresh", confirmRefresh: true },
    evidence: {
      startLine: block.startLine || null,
      endLine: block.endLine || null,
      marker: block.marker || ""
    }
  };
}

function handleObsidianVaultSyncPlanCreate(args, dataDir) {
  const check = handleObsidianVaultIndexRefreshCheck({ ...args, includeBlocks: true }, dataDir);
  const changes = check.changes || {};
  const actions = [
    ...(changes.statusChanged || []).map((item) => syncPlanActionFromChange("statusChanged", item)),
    ...(changes.added || []).map((item) => syncPlanActionFromChange("added", item)),
    ...(changes.removed || []).map((item) => syncPlanActionFromChange("removed", item))
  ];
  const counts = actions.reduce(
    (acc, action) => {
      acc.total += 1;
      acc[action.kind] = (acc[action.kind] || 0) + 1;
      return acc;
    },
    { total: 0, statusChanged: 0, added: 0, removed: 0 }
  );
  return {
    adapter: "obsidian_file",
    planId: `vault-sync-plan-${compactTimestamp(new Date())}-${shortRandomId()}`,
    createdAt: new Date().toISOString(),
    reviewer: args.reviewer || "Nova",
    readOnly: true,
    writesVault: false,
    writesIndex: false,
    recommendation: actions.length ? "review_actions_then_refresh_index" : "no_action_needed",
    source: {
      indexId: check.index?.indexId || null,
      vaultRoot: check.current?.vaultRoot || null,
      folder: check.current?.folder || "",
      stale: check.stale,
      freshnessRecommendation: check.recommendation
    },
    counts,
    actions,
    check
  };
}

function normalizeSyncActionInput(args) {
  const action = args.action && typeof args.action === "object" ? { ...args.action } : {};
  if (!Object.keys(action).length) fail("obsidian_vault_sync_action_apply 需要 action 对象。");
  if (args.actionId && action.actionId && args.actionId !== action.actionId) {
    fail(`actionId 不匹配: ${args.actionId} != ${action.actionId}`);
  }
  return action;
}

function handleObsidianVaultSyncActionApply(args, dataDir) {
  const action = normalizeSyncActionInput(args);
  if (args.confirmApply !== true) {
    return {
      adapter: "obsidian_file",
      applied: false,
      reason: "confirmation_required",
      recommendation: "confirm_apply",
      action
    };
  }

  if (action.recommendation === "mark_local_index_resolved_or_rebuild" && action.afterStatus === "resolved") {
    const resolved = handleObsidianNoteResolve({
      vaultPath: args.vaultPath,
      notePath: action.notePath,
      blockPreviewId: action.previewId,
      resolvedBy: args.appliedBy || "Nova",
      resolutionNote: args.resolutionNote || "Applied from Obsidian vault sync action."
    }, dataDir);
    return {
      adapter: "obsidian_file",
      applied: true,
      actionId: action.actionId || null,
      appliedCommand: "obsidian_note_resolve",
      action,
      result: resolved
    };
  }

  if (
    action.commandHint?.command === "obsidian_vault_index_refresh" ||
    action.recommendation === "review_missing_vault_block"
  ) {
    if (args.confirmRefresh !== true) {
      return {
        adapter: "obsidian_file",
        applied: false,
        reason: "refresh_confirmation_required",
        recommendation: "confirm_refresh",
        action
      };
    }
    const refreshed = handleObsidianVaultIndexRefresh({
      indexId: args.indexId,
      vaultPath: args.vaultPath,
      folder: args.folder,
      confirmRefresh: true,
      force: args.force === true,
      label: args.label || `sync action ${action.actionId || compactTimestamp(new Date())}`,
      createdBy: args.appliedBy || "Nova"
    }, dataDir);
    return {
      adapter: "obsidian_file",
      applied: refreshed.refreshed === true,
      actionId: action.actionId || null,
      appliedCommand: "obsidian_vault_index_refresh",
      action,
      result: refreshed
    };
  }

  return {
    adapter: "obsidian_file",
    applied: false,
    reason: "manual_review_required",
    recommendation: action.recommendation || "manual_review",
    action
  };
}

function handleObsidianNoteDiff(args, dataDir) {
  const { preview, vaultRoot, notePath, targetPath } = resolveObsidianNoteTarget(args, dataDir);
  const exists = fs.existsSync(targetPath);
  const currentContent = exists ? fs.readFileSync(targetPath, "utf8") : "";
  const desiredContent = desiredObsidianContent(args, preview);
  const marker = obsidianProposedUpdateMarker(preview);
  const resolvedMarkerPrefix = obsidianResolvedUpdateMarkerPrefix(preview);
  const alreadyMerged = exists && currentContent.includes(marker);
  const resolved = exists && currentContent.includes(resolvedMarkerPrefix);
  const resolvedMarker = resolved ? findObsidianResolvedUpdateMarker(currentContent, preview) || resolvedMarkerPrefix : null;
  return {
    adapter: "obsidian_file",
    previewId: preview?.previewId || null,
    vaultRoot,
    notePath,
    targetPath,
    exists,
    alreadyMerged,
    resolved,
    marker: alreadyMerged ? marker : resolvedMarker,
    resolvedMarker,
    diff: diffTextSummary(currentContent, desiredContent)
  };
}

function handleObsidianNoteMerge(args, dataDir) {
  const { preview, vaultRoot, notePath, targetPath } = resolveObsidianNoteTarget(args, dataDir);
  const desiredContent = desiredObsidianContent(args, preview);
  const currentContent = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf8") : "";
  const diff = diffTextSummary(currentContent, desiredContent);
  if (diff.identical) {
    return {
      adapter: "obsidian_file",
      previewId: preview?.previewId || null,
      vaultRoot,
      notePath,
      targetPath,
      merged: false,
      reason: "identical",
      diff
    };
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const marker = obsidianProposedUpdateMarker(preview);
  const resolvedMarkerPrefix = obsidianResolvedUpdateMarkerPrefix(preview);
  if (currentContent.includes(resolvedMarkerPrefix)) {
    const resolvedMarker = findObsidianResolvedUpdateMarker(currentContent, preview) || resolvedMarkerPrefix;
    return {
      adapter: "obsidian_file",
      previewId: preview?.previewId || null,
      vaultRoot,
      notePath,
      targetPath,
      merged: false,
      reason: "already_resolved",
      strategy: "append_proposed_update",
      marker: resolvedMarker,
      resolvedMarker,
      bytesWritten: Buffer.byteLength(currentContent, "utf8"),
      diff
    };
  }
  if (currentContent.includes(marker)) {
    return {
      adapter: "obsidian_file",
      previewId: preview?.previewId || null,
      vaultRoot,
      notePath,
      targetPath,
      merged: false,
      reason: "already_merged",
      strategy: "append_proposed_update",
      marker,
      bytesWritten: Buffer.byteLength(currentContent, "utf8"),
      diff
    };
  }
  const stamped = new Date().toISOString();
  const block = [
    "",
    marker,
    "",
    `## CoReading proposed update (${stamped})`,
    "",
    `- 来源: ${preview?.reviewId || preview?.previewId || "manual"}`,
    `- 合并者: ${args.updatedBy || "nova"}`,
    "",
    desiredContent.trim(),
    "",
    "<!-- /CoReading proposed update -->",
    ""
  ].join("\n");
  const nextContent = `${currentContent.replace(/\s*$/u, "")}\n${block}`;
  fs.writeFileSync(targetPath, nextContent, "utf8");
  return {
    adapter: "obsidian_file",
    previewId: preview?.previewId || null,
    vaultRoot,
    notePath,
    targetPath,
    merged: true,
    strategy: "append_proposed_update",
    marker,
    bytesWritten: Buffer.byteLength(nextContent, "utf8"),
    diff
  };
}

function handleObsidianNoteIntegrate(args, dataDir) {
  const { preview, vaultRoot, notePath, targetPath } = resolveObsidianNoteTarget(args, dataDir);
  const blockPreviewId = args.blockPreviewId || preview?.previewId || null;
  const markerPreview = blockPreviewId ? { previewId: blockPreviewId } : preview;
  const integratedContent = args.integratedContent !== undefined ? args.integratedContent : args.content !== undefined ? args.content : preview?.content;
  if (integratedContent === undefined || integratedContent === null || !String(integratedContent).trim()) {
    fail("需要 integratedContent、content 或 preview.content 才能追加 integrated update。");
  }
  const currentContent = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf8") : "";
  const integratedMarker = obsidianIntegratedUpdateMarker(markerPreview);
  if (currentContent.includes(integratedMarker)) {
    return {
      adapter: "obsidian_file",
      previewId: preview?.previewId || null,
      blockPreviewId,
      vaultRoot,
      notePath,
      targetPath,
      integrated: false,
      resolved: currentContent.includes(obsidianResolvedUpdateMarkerPrefix(markerPreview)),
      reason: "already_integrated",
      marker: integratedMarker,
      bytesWritten: Buffer.byteLength(currentContent, "utf8")
    };
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const stamped = new Date().toISOString();
  const block = [
    "",
    integratedMarker,
    "",
    `## CoReading integrated update (${stamped})`,
    "",
    `- 来源: ${blockPreviewId || preview?.reviewId || preview?.previewId || "manual"}`,
    `- 整理者: ${args.integratedBy || args.updatedBy || "nova"}`,
    "",
    String(integratedContent).trim(),
    "",
    "<!-- /CoReading integrated update -->",
    ""
  ].join("\n");
  let nextContent = `${currentContent.replace(/\s*$/u, "")}\n${block}`;
  const proposedMarker = obsidianProposedUpdateMarker(markerPreview);
  let resolved = false;
  let resolvedMarker = null;
  if (nextContent.includes(proposedMarker)) {
    resolvedMarker = obsidianResolvedUpdateMarker(markerPreview, args.integratedBy || args.updatedBy || "nova");
    const resolutionNote = args.resolutionNote ? String(args.resolutionNote).replace(/\r?\n/gu, " ").trim().slice(0, 500) : "已追加 integrated update。";
    nextContent = nextContent.replace(proposedMarker, `${resolvedMarker}\n<!-- CoReading resolution note: ${resolutionNote} -->`);
    resolved = true;
  } else {
    resolvedMarker = findObsidianResolvedUpdateMarker(nextContent, markerPreview);
    resolved = Boolean(resolvedMarker);
  }
  fs.writeFileSync(targetPath, nextContent, "utf8");
  return {
    adapter: "obsidian_file",
    previewId: preview?.previewId || null,
    blockPreviewId,
    vaultRoot,
    notePath,
    targetPath,
    integrated: true,
    resolved,
    marker: integratedMarker,
    resolvedMarker,
    bytesWritten: Buffer.byteLength(nextContent, "utf8")
  };
}

function handleObsidianNoteResolve(args, dataDir) {
  const { preview, vaultRoot, notePath, targetPath } = resolveObsidianNoteTarget(args, dataDir);
  const currentContent = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf8") : "";
  const blockPreviewId = args.blockPreviewId || preview?.previewId || null;
  const markerPreview = blockPreviewId ? { previewId: blockPreviewId } : preview;
  const marker = obsidianProposedUpdateMarker(markerPreview);
  const resolvedMarkerPrefix = obsidianResolvedUpdateMarkerPrefix(markerPreview);
  if (!currentContent.includes(marker)) {
    const resolvedMarker = findObsidianResolvedUpdateMarker(currentContent, markerPreview);
    return {
      adapter: "obsidian_file",
      previewId: preview?.previewId || null,
      blockPreviewId,
      vaultRoot,
      notePath,
      targetPath,
      resolved: false,
      reason: currentContent.includes(resolvedMarkerPrefix) ? "already_resolved" : "marker_not_found",
      marker: resolvedMarker || marker,
      resolvedMarker,
      bytesWritten: Buffer.byteLength(currentContent, "utf8")
    };
  }
  const resolvedMarker = obsidianResolvedUpdateMarker(markerPreview, args.resolvedBy || args.updatedBy || "nova");
  const resolutionNote = args.resolutionNote ? String(args.resolutionNote).replace(/\r?\n/gu, " ").trim().slice(0, 500) : "";
  const replacement = resolutionNote ? `${resolvedMarker}\n<!-- CoReading resolution note: ${resolutionNote} -->` : resolvedMarker;
  const nextContent = currentContent.replace(marker, replacement);
  fs.writeFileSync(targetPath, nextContent, "utf8");
  return {
    adapter: "obsidian_file",
    previewId: preview?.previewId || null,
    blockPreviewId,
    vaultRoot,
    notePath,
    targetPath,
    resolved: true,
    marker: resolvedMarker,
    previousMarker: marker,
    bytesWritten: Buffer.byteLength(nextContent, "utf8")
  };
}

function todayChinaDate() {
  return new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" }).replace(/\//g, "-");
}

function dailyNoteTags(preview) {
  return ["共读", "CoReadingMCP", preview.bookId || "阅读"].join(", ");
}

function writeDailyNotePreview(preview, args) {
  const dailyNoteRootInput = args.dailyNoteRoot || process.env.CO_READING_DAILY_NOTE_ROOT || process.env.KNOWLEDGEBASE_ROOT_PATH;
  if (!dailyNoteRootInput || !String(dailyNoteRootInput).trim()) {
    fail("执行 DailyNote 预览需要 dailyNoteRoot、CO_READING_DAILY_NOTE_ROOT 或 KNOWLEDGEBASE_ROOT_PATH。");
  }
  const dailyNoteRoot = path.resolve(String(dailyNoteRootInput));
  if (dailyNoteRoot === path.parse(dailyNoteRoot).root) fail(`拒绝把 DailyNote 根目录设置为磁盘根: ${dailyNoteRoot}`);
  const scriptPath = path.join(PROJECT_ROOT, "Plugin", "DailyNoteWrite", "daily-note-write.js");
  const contentText = `${String(preview.content || "").trim()}\n\nTag: ${dailyNoteTags(preview)}`;
  const result = runNodePluginSync(
    scriptPath,
    {
      maidName: "[共读]Nova",
      dateString: todayChinaDate(),
      fileName: slugPart(preview.reviewId || preview.previewId),
      contentText
    },
    {
      PROJECT_BASE_PATH: PROJECT_ROOT,
      KNOWLEDGEBASE_ROOT_PATH: dailyNoteRoot
    },
    30000
  );
  return {
    adapter: "daily_note_write",
    dailyNoteRoot,
    pluginResult: result.payload,
    stderr: result.stderr
  };
}

function proposalFromPreview(preview, args) {
  const content = preview.content && typeof preview.content === "object" ? preview.content : {};
  return {
    command: "ProposeMemory",
    from: args.updatedBy || args.reviewer || "Nova",
    title: content.title || `共读记忆 ${preview.reviewId || preview.previewId}`,
    content: content.content || String(preview.content || ""),
    tags: normalizeArray(content.tags).length ? normalizeArray(content.tags) : ["共读", "CoReadingMCP"],
    target_folder: args.targetFolder || "共读",
    source: JSON.stringify({
      ...(content.source || {}),
      plugin: "CoReadingMCP",
      previewId: preview.previewId,
      reviewId: preview.reviewId,
      bookId: preview.bookId
    }),
    confidence: args.confidence || 0.8,
    risk: args.risk || "review"
  };
}

function writeVcpMemoryPreview(preview, args) {
  const scriptPath = path.join(PROJECT_ROOT, "Plugin", "VCPMemory", "VCPMemory.js");
  const envPatch = { PROJECT_BASE_PATH: PROJECT_ROOT };
  const vcpMemoryRoot = args.vcpMemoryRoot || process.env.CO_READING_VCP_MEMORY_ROOT || process.env.VCP_MEMORY_ROOT;
  if (vcpMemoryRoot) envPatch.VCP_MEMORY_ROOT = path.resolve(vcpMemoryRoot);
  const result = runNodePluginSync(scriptPath, proposalFromPreview(preview, args), envPatch, 30000);
  return {
    adapter: "vcp_memory_proposal",
    vcpMemoryRoot: envPatch.VCP_MEMORY_ROOT || path.join(PROJECT_ROOT, "data", "vcp-memory"),
    pluginResult: result.payload,
    stderr: result.stderr
  };
}

function markdownToObsText(content, maxChars) {
  const limit = Number.isFinite(Number(maxChars)) && Number(maxChars) > 0 ? Number(maxChars) : 2200;
  const text = String(content || "")
    .replace(/^---[\s\S]*?---\s*/u, "")
    .replace(/!\[[^\]]*\]\([^)]+\)/gu, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/^#{1,6}\s*/gmu, "")
    .replace(/^>\s?/gmu, "")
    .replace(/^[*-]\s+/gmu, "")
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/\*\*([^*]+)\*\*/gu, "$1")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
  return text.length > limit ? `${text.slice(0, limit).trim()}\n...` : text;
}

function writeObsPreview(preview, args) {
  const outputDirInput = args.obsOutputDir || preview.destination?.outputDir || process.env.CO_READING_OBS_OUTPUT_DIR;
  if (!outputDirInput || !String(outputDirInput).trim()) {
    fail("执行 OBS 预览需要 obsOutputDir 或 CO_READING_OBS_OUTPUT_DIR。");
  }
  const outputDir = path.resolve(String(outputDirInput));
  if (outputDir === path.parse(outputDir).root) fail(`拒绝把 OBS 输出目录设置为磁盘根: ${outputDir}`);
  fs.mkdirSync(outputDir, { recursive: true });
  const defaultSlug = slugPart(preview.reviewId || preview.previewId || "co-reading");
  const markdownPath = ensureMarkdownPath(args.obsMarkdownPath || preview.destination?.markdownPath, `${defaultSlug}.md`);
  const textPath = ensureTextPath(args.obsTextPath || preview.destination?.textPath, `${defaultSlug}.txt`);
  const markdownTargetPath = resolveInside(outputDir, markdownPath);
  const textTargetPath = resolveInside(outputDir, textPath);
  if (fs.existsSync(markdownTargetPath) && args.overwrite !== true) {
    fail(`OBS Markdown 文件已存在，传 overwrite=true 才会覆盖: ${markdownTargetPath}`);
  }
  if (fs.existsSync(textTargetPath) && args.overwrite !== true) {
    fail(`OBS 文本源文件已存在，传 overwrite=true 才会覆盖: ${textTargetPath}`);
  }
  const markdownContent = String(preview.content || "").trim();
  const textContent = markdownToObsText(markdownContent, args.obsTextMaxChars);
  fs.mkdirSync(path.dirname(markdownTargetPath), { recursive: true });
  fs.mkdirSync(path.dirname(textTargetPath), { recursive: true });
  fs.writeFileSync(markdownTargetPath, `${markdownContent}\n`, "utf8");
  fs.writeFileSync(textTargetPath, `${textContent}\n`, "utf8");
  return {
    adapter: "obs_text_files",
    outputDir,
    markdownPath,
    textPath,
    markdownTargetPath,
    textTargetPath,
    markdownBytesWritten: Buffer.byteLength(`${markdownContent}\n`, "utf8"),
    textBytesWritten: Buffer.byteLength(`${textContent}\n`, "utf8")
  };
}

function executePreview(preview, args) {
  if (preview.target === "obsidian") return writeObsidianPreview(preview, args);
  if (preview.target === "dailyNote") return writeDailyNotePreview(preview, args);
  if (preview.target === "vcpMemory") return writeVcpMemoryPreview(preview, args);
  if (preview.target === "obs") return writeObsPreview(preview, args);
  fail(`未知沉淀目标: ${preview.target}`);
}

function handleReviewCreate(args, dataDir) {
  const scope = deriveReviewScope(args, dataDir);
  const linkedPlan = args.__linkedPlan || (args.planId ? findPlan(loadPlanStore(dataDir), args.planId) : null);
  const manifest = loadManifest(dataDir, args.bookId);
  const source = buildSourceAnchors(manifest, scope);
  const now = new Date().toISOString();
  const review = {
    reviewId: args.reviewId || createArtifactId("review", manifest.bookId),
    artifactType: "range_review",
    status: args.status || "curated",
    bookId: manifest.bookId,
    bookTitle: manifest.title || manifest.bookId,
    bookAuthor: manifest.author || null,
    planId: args.planId || null,
    stepId: args.stepId || null,
    title: args.title || `${manifest.title || manifest.bookId} ${source.anchors.startChunkId}-${source.anchors.endChunkId} 共读评价`,
    summary: String(args.summary || "").trim(),
    stance: args.stance || null,
    observations: normalizeObjectArray(args.observations),
    questions: normalizeObjectArray(args.questions),
    quotes: normalizeObjectArray(args.quotes, "quote"),
    nextActions: normalizeObjectArray(args.nextActions),
    tags: normalizeArray(args.tags).length ? normalizeArray(args.tags) : ["co-reading"],
    scope: source.scope,
    sourceAnchors: source.anchors,
    sinkPolicy: normalizeSinkPolicy(args.sinkPolicy || linkedPlan?.sinkPolicy),
    createdBy: args.createdBy || "nova",
    createdAt: now,
    updatedAt: now,
    sinkPreviewIds: []
  };
  if (!review.summary) fail("summary 是必需参数。");

  const store = loadReviewStore(dataDir);
  if (store.reviews.some((item) => item.reviewId === review.reviewId)) fail(`阅读评价已存在: ${review.reviewId}`);
  store.reviews.push(review);
  saveReviewStore(dataDir, store);
  return { review: summarizeReview(review), fullReview: review, reviewPath: reviewsPath(dataDir) };
}

function handleReviewList(args, dataDir) {
  const store = loadReviewStore(dataDir);
  const reviews = store.reviews
    .filter((review) => !args.bookId || review.bookId === args.bookId)
    .filter((review) => !args.planId || review.planId === args.planId)
    .filter((review) => !args.status || review.status === args.status)
    .map(summarizeReview);
  return { reviews, count: reviews.length, reviewPath: reviewsPath(dataDir) };
}

function handleReviewGet(args, dataDir) {
  const review = findReview(loadReviewStore(dataDir), args.reviewId);
  return { review, markdown: renderReviewMarkdown(review) };
}

function handleSinkPreviewCreate(args, dataDir) {
  const reviewStore = loadReviewStore(dataDir);
  const review = findReview(reviewStore, args.reviewId);
  const targets = normalizeArray(args.targets).length ? normalizeArray(args.targets) : defaultTargetsForReview(review);
  const now = new Date().toISOString();
  const previewStore = loadSinkPreviewStore(dataDir);
  const illustrations = illustrationsForReview(review, dataDir, args);
  const previews = targets.map((target) => buildSinkPreview(review, target, args, now, { illustrations }));
  previewStore.previews.push(...previews);
  saveSinkPreviewStore(dataDir, previewStore);

  review.sinkPreviewIds ||= [];
  review.sinkPreviewIds.push(...previews.map((preview) => preview.previewId));
  review.updatedAt = now;
  saveReviewStore(dataDir, reviewStore);
  return { previews: previews.map(summarizePreview), sinkPreviewPath: sinkPreviewsPath(dataDir) };
}

async function handleSinkPreviewCreateFromBacktrack(args, dataDir, serverModule) {
  const backtrack = await handleInterestBacktrack({ ...args, includeEvidence: true, createPlan: false }, dataDir, serverModule);
  if (!backtrack.evidenceMarkdown) fail("回溯结果缺少 evidenceMarkdown，无法创建沉淀预览。");
  const now = new Date().toISOString();
  const store = loadSinkPreviewStore(dataDir);
  const previews = buildBacktrackSinkPreviews(args, backtrack, now);
  store.previews.push(...previews);
  saveSinkPreviewStore(dataDir, store);
  return {
    backtrack,
    previews: previews.map(summarizePreview),
    preview: previews[0],
    sinkPreviewPath: sinkPreviewsPath(dataDir)
  };
}

async function handleSinkPreviewCreateFromCards(args, dataDir, serverModule) {
  const cards = await callVendorToolJson(serverModule, "reading_list_cards", {
    bookId: args.bookId,
    chunkId: args.chunkId,
    source: args.source,
    scope: args.scope,
    limit: args.limit || 20,
    offset: args.offset || 0
  });
  const requestedCardIds = new Set(normalizeArray(args.cardIds).map(String).filter(Boolean));
  const selectedCards = requestedCardIds.size
    ? normalizeArray(cards).filter((card) => requestedCardIds.has(String(card.id || card.cardId || "")))
    : normalizeArray(cards);
  const now = new Date().toISOString();
  const store = loadSinkPreviewStore(dataDir);
  const previews = buildCardDigestSinkPreviews(args, selectedCards, now);
  store.previews.push(...previews);
  saveSinkPreviewStore(dataDir, store);
  return {
    cards: selectedCards,
    requestedCardIds: [...requestedCardIds],
    previews: previews.map(summarizePreview),
    preview: previews[0],
    sinkPreviewPath: sinkPreviewsPath(dataDir)
  };
}

function handleSinkPreviewList(args, dataDir) {
  const store = loadSinkPreviewStore(dataDir);
  const previews = store.previews
    .filter((preview) => !args.reviewId || preview.reviewId === args.reviewId)
    .filter((preview) => !args.target || preview.target === args.target)
    .filter((preview) => !args.status || preview.status === args.status)
    .map(summarizePreview);
  return { previews, count: previews.length, sinkPreviewPath: sinkPreviewsPath(dataDir) };
}

function handleSinkPreviewGet(args, dataDir) {
  const preview = findPreview(loadSinkPreviewStore(dataDir), args.previewId);
  return { preview };
}

function handleSinkPreviewUpdate(args, dataDir) {
  const store = loadSinkPreviewStore(dataDir);
  const preview = findPreview(store, args.previewId);
  const allowed = new Set(["pending", "approved", "rejected", "exported"]);
  if (!allowed.has(args.status)) fail(`不支持的预览状态: ${args.status}`);
  if (args.content !== undefined && preview.status === "exported" && args.force !== true) {
    fail("已 exported 的沉淀预览不能修改正文；如需覆盖请显式传 force=true。");
  }
  const now = new Date().toISOString();
  const contentChanged = args.content !== undefined && JSON.stringify(args.content) !== JSON.stringify(preview.content);
  const criticalRemovals = contentChanged
    ? assertCriticalRemovalsMatch(preview.content, args.content, args.criticalRemovals)
    : normalizeObjectArray(args.criticalRemovals);
  if (contentChanged) preview.content = args.content;
  preview.status = args.status;
  preview.updatedAt = now;
  preview.history ||= [];
  preview.history.push({
    at: now,
    event: contentChanged ? "content_updated" : "status_updated",
    status: args.status,
    by: args.updatedBy || "nova",
    note: args.note || null,
    criticalRemovals,
    contentChanged
  });
  saveSinkPreviewStore(dataDir, store);
  return { preview: summarizePreview(preview), contentChanged };
}

function handleSinkExecute(args, dataDir) {
  const store = loadSinkPreviewStore(dataDir);
  const preview = findPreview(store, args.previewId);
  if (preview.status === "exported" && args.force !== true) {
    return { preview: summarizePreview(preview), skipped: true, reason: "already_exported", execution: preview.execution || null };
  }
  if (preview.status !== "approved" && args.force !== true) {
    fail(`沉淀预览必须先 approved 才能执行；当前状态: ${preview.status}`);
  }

  const now = new Date().toISOString();
  const execution = executePreview(preview, args);
  preview.status = "exported";
  preview.executedAt = now;
  preview.updatedAt = now;
  preview.execution = {
    ...execution,
    executedAt: now,
    by: args.updatedBy || args.reviewer || "nova"
  };
  preview.history ||= [];
  preview.history.push({
    at: now,
    event: "executed",
    status: "exported",
    by: args.updatedBy || args.reviewer || "nova",
    adapter: execution.adapter
  });
  saveSinkPreviewStore(dataDir, store);
  return { preview: summarizePreview(preview), execution: preview.execution };
}

function normalizeIllustrationPlacement(args) {
  const placement = args.placement && typeof args.placement === "object" ? { ...args.placement } : {};
  placement.position = args.position || placement.position || (args.chunkId ? "after_chunk" : "chapter_end");
  placement.layer = args.layer || placement.layer || (placement.position === "cover" ? "cover" : "chapter");
  placement.bookId = args.bookId || placement.bookId || null;
  placement.chunkId = args.chunkId || placement.chunkId || null;
  placement.startChunkId = args.startChunkId || placement.startChunkId || placement.chunkId || null;
  placement.endChunkId = args.endChunkId || placement.endChunkId || placement.chunkId || null;
  placement.sectionTitle = args.sectionTitle || placement.sectionTitle || null;
  placement.characterOffset = Number.isFinite(Number(args.characterOffset ?? placement.characterOffset))
    ? Number(args.characterOffset ?? placement.characterOffset)
    : null;
  placement.slot = args.slot || placement.slot || null;
  return placement;
}

function summarizeIllustration(item) {
  return {
    illustrationId: item.illustrationId,
    bookId: item.bookId,
    title: item.title,
    status: item.status,
    sourceType: item.sourceType,
    provider: item.provider || null,
    stylePreset: item.stylePreset || null,
    aspectRatio: item.aspectRatio || null,
    assetUri: item.assetUri || null,
    thumbnailUri: item.thumbnailUri || null,
    placement: item.placement,
    tags: item.tags || [],
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function findIllustration(store, illustrationId) {
  const item = store.illustrations.find((candidate) => candidate.illustrationId === illustrationId);
  if (!item) fail(`未找到插图资产: ${illustrationId}`);
  return item;
}

function handleIllustrationCreate(args, dataDir) {
  const manifest = loadManifest(dataDir, args.bookId);
  const now = new Date().toISOString();
  const sourceType = args.sourceType || (args.assetUri ? "library" : "ai");
  const placement = normalizeIllustrationPlacement({ ...args, bookId: manifest.bookId });
  const illustration = {
    illustrationId: args.illustrationId || createArtifactId("illustration", manifest.bookId),
    bookId: manifest.bookId,
    bookTitle: manifest.title || manifest.bookId,
    title: args.title || `${manifest.title || manifest.bookId} 插图请求`,
    intent: args.intent || "atmosphere",
    status: args.status || (args.assetUri ? "generated" : "draft"),
    sourceType,
    provider: args.provider || null,
    model: args.model || null,
    prompt: args.prompt || "",
    negativePrompt:
      args.negativePrompt ||
      "text, watermark, signature, logo, high saturation, harsh contrast, photorealistic celebrity, spoiler scene",
    stylePreset: args.stylePreset || "quiet editorial watercolor",
    aspectRatio: args.aspectRatio || "16:9",
    seed: args.seed || null,
    assetUri: args.assetUri || null,
    thumbnailUri: args.thumbnailUri || args.assetUri || null,
    placement,
    generation: {
      mode: sourceType,
      jobId: args.jobId || null,
      requestPayload: args.requestPayload || null,
      resultPayload: args.resultPayload || null
    },
    safety: {
      spoilerBoundary: args.spoilerBoundary || placement.endChunkId || placement.chunkId || null,
      rawTextIncluded: false,
      moodOverRealism: args.moodOverRealism !== false
    },
    tags: normalizeArray(args.tags).length ? normalizeArray(args.tags) : ["co-reading", "illustration", sourceType],
    createdBy: args.createdBy || "nova",
    createdAt: now,
    updatedAt: now,
    history: [{ at: now, event: "created", by: args.createdBy || "nova" }]
  };
  const store = loadIllustrationStore(dataDir);
  if (store.illustrations.some((item) => item.illustrationId === illustration.illustrationId)) {
    fail(`插图资产已存在: ${illustration.illustrationId}`);
  }
  store.illustrations.push(illustration);
  saveIllustrationStore(dataDir, store);
  return { illustration: summarizeIllustration(illustration), fullIllustration: illustration, illustrationPath: illustrationsPath(dataDir) };
}

function handleIllustrationList(args, dataDir) {
  const store = loadIllustrationStore(dataDir);
  const illustrations = store.illustrations
    .filter((item) => !args.bookId || item.bookId === args.bookId)
    .filter((item) => !args.status || item.status === args.status)
    .filter((item) => !args.sourceType || item.sourceType === args.sourceType)
    .filter((item) => !args.layer || item.placement?.layer === args.layer)
    .map(summarizeIllustration);
  return { illustrations, count: illustrations.length, illustrationPath: illustrationsPath(dataDir) };
}

function handleIllustrationGet(args, dataDir) {
  return { illustration: findIllustration(loadIllustrationStore(dataDir), args.illustrationId) };
}

function handleIllustrationUpdate(args, dataDir) {
  const store = loadIllustrationStore(dataDir);
  const illustration = findIllustration(store, args.illustrationId);
  const patch = args.patch && typeof args.patch === "object" ? { ...args.patch } : {};
  for (const key of [
    "status",
    "prompt",
    "negativePrompt",
    "assetUri",
    "thumbnailUri",
    "provider",
    "model",
    "stylePreset",
    "aspectRatio",
    "seed",
    "generation",
    "safety",
    "tags"
  ]) {
    if (Object.prototype.hasOwnProperty.call(args, key)) patch[key] = args[key];
  }
  if (args.placement || args.chunkId || args.startChunkId || args.endChunkId || args.position || args.layer) {
    patch.placement = normalizeIllustrationPlacement({ ...illustration.placement, ...args, bookId: illustration.bookId });
  }
  if (patch.tags) patch.tags = normalizeArray(patch.tags);
  Object.assign(illustration, patch);
  illustration.updatedAt = new Date().toISOString();
  illustration.history ||= [];
  illustration.history.push({
    at: illustration.updatedAt,
    event: "updated",
    by: args.updatedBy || "nova",
    note: args.note || null,
    patchKeys: Object.keys(patch)
  });
  saveIllustrationStore(dataDir, store);
  return { illustration: summarizeIllustration(illustration), fullIllustration: illustration };
}

function handleIllustrationSuggest(args, dataDir) {
  const manifest = loadManifest(dataDir, args.bookId);
  const scope = buildScope({
    ...args,
    chunkIds: args.chunkId ? [args.chunkId] : args.chunkIds,
    mode: args.mode || "range"
  });
  const chunks = selectChunks(manifest, scope).slice(0, 12);
  if (!chunks.length) fail("插图建议需要至少一个 chunk 锚点。");
  const first = chunks[0];
  const last = chunks[chunks.length - 1];
  const sectionTitles = uniqueValues(chunks.map((chunk) => chunk.sectionTitle || chunk.title)).slice(0, 4);
  const stylePreset = args.stylePreset || "quiet editorial watercolor";
  const aspectRatio = args.aspectRatio || "16:9";
  const mood = args.mood || "quiet, low saturation, reflective";
  const anchorText = chunks.map((chunk) => `${chunk.id}:${chunk.title || chunk.sectionTitle || "untitled"}`).join("; ");
  const base = {
    bookId: manifest.bookId,
    bookTitle: manifest.title || manifest.bookId,
    placement: normalizeIllustrationPlacement({
      bookId: manifest.bookId,
      chunkId: args.chunkId || first.id,
      startChunkId: first.id,
      endChunkId: last.id,
      position: args.position || "chapter_end",
      layer: args.layer || "chapter",
      sectionTitle: sectionTitles[0] || null
    }),
    spoilerBoundary: last.id,
    stylePreset,
    aspectRatio,
    negativePrompt: "text, watermark, signature, logo, high saturation, harsh contrast, photorealistic celebrity, explicit spoiler, later-scene reveal"
  };
  const suggestions = [
    {
      kind: "mood",
      title: `${manifest.title || manifest.bookId} 氛围插图`,
      sourceType: "ai",
      intent: "atmosphere",
      prompt:
        `${stylePreset}, ${mood}, atmospheric illustration for ${manifest.title || manifest.bookId}, ` +
        `section mood from ${sectionTitles.join(" / ") || first.title}, no named character portrait, no future events, anchor metadata: ${anchorText}`,
      placement: base.placement,
      aspectRatio,
      safety: { spoilerBoundary: base.spoilerBoundary, rawTextIncluded: false, moodOverRealism: true }
    },
    {
      kind: "concept",
      title: `${manifest.title || manifest.bookId} 概念插图`,
      sourceType: "ai",
      intent: "concept",
      prompt:
        `${stylePreset}, subdued concept illustration, symbolic object or place suggested by section titles (${sectionTitles.join(" / ") || first.title}), ` +
        `avoid literalizing metaphors, no text, no spoiler, anchor metadata: ${anchorText}`,
      placement: { ...base.placement, layer: args.layer || "inline" },
      aspectRatio,
      safety: { spoilerBoundary: base.spoilerBoundary, rawTextIncluded: false, moodOverRealism: true }
    }
  ];
  if (args.includeNarrative === true) {
    suggestions.push({
      kind: "narrative",
      title: `${manifest.title || manifest.bookId} 叙事插图`,
      sourceType: "ai",
      intent: "narrative",
      prompt:
        `${stylePreset}, restrained narrative scene based only on current range metadata, no future events, no explicit character likeness, ` +
        `soft composition, anchor metadata: ${anchorText}`,
      placement: base.placement,
      aspectRatio,
      safety: { spoilerBoundary: base.spoilerBoundary, rawTextIncluded: false, moodOverRealism: false }
    });
  }
  return {
    bookId: manifest.bookId,
    range: { startChunkId: first.id, endChunkId: last.id, chunkCount: chunks.length },
    sourceChunks: chunks.map(compactChunk),
    styleProfile: { stylePreset, aspectRatio, negativePrompt: base.negativePrompt },
    suggestions
  };
}

async function callLocalCommand(command, args, dataDir, serverModule, vendorDir) {
  if (command === "import_file") return handleImportFile(args, serverModule);
  if (command === "plan_create") return handlePlanCreate(args, dataDir);
  if (command === "interest_backtrack") return handleInterestBacktrack(args, dataDir, serverModule);
  if (command === "plan_list") return handlePlanList(args, dataDir);
  if (command === "plan_get") return handlePlanGet(args, dataDir);
  if (command === "plan_update") return handlePlanUpdate(args, dataDir);
  if (command === "plan_next_step") return handlePlanNextStep(args, dataDir);
  if (command === "plan_execute_step") return handlePlanExecuteStep(args, dataDir, serverModule);
  if (command === "plan_run") return handlePlanRun(args, dataDir, serverModule);
  if (command === "plan_record_step") return handlePlanRecordStep(args, dataDir);
  if (command === "review_create") return handleReviewCreate(args, dataDir);
  if (command === "review_list") return handleReviewList(args, dataDir);
  if (command === "review_get") return handleReviewGet(args, dataDir);
  if (command === "sink_preview_create") return handleSinkPreviewCreate(args, dataDir);
  if (command === "sink_preview_create_from_cards") return handleSinkPreviewCreateFromCards(args, dataDir, serverModule);
  if (command === "sink_preview_create_from_backtrack") return handleSinkPreviewCreateFromBacktrack(args, dataDir, serverModule);
  if (command === "sink_preview_list") return handleSinkPreviewList(args, dataDir);
  if (command === "sink_preview_get") return handleSinkPreviewGet(args, dataDir);
  if (command === "sink_preview_update") return handleSinkPreviewUpdate(args, dataDir);
  if (command === "sink_execute") return handleSinkExecute(args, dataDir);
  if (command === "obsidian_note_read") return handleObsidianNoteRead(args, dataDir);
  if (command === "obsidian_note_diff") return handleObsidianNoteDiff(args, dataDir);
  if (command === "obsidian_note_merge") return handleObsidianNoteMerge(args, dataDir);
  if (command === "obsidian_note_suggest_integration") return handleObsidianNoteSuggestIntegration(args, dataDir);
  if (command === "obsidian_note_apply_integration_choice") return handleObsidianNoteApplyIntegrationChoice(args, dataDir);
  if (command === "obsidian_note_preview_replace_range") return handleObsidianNotePreviewReplaceRange(args, dataDir);
  if (command === "obsidian_note_confirm_replace_range") return handleObsidianNoteConfirmReplaceRange(args, dataDir);
  if (command === "obsidian_note_integrate") return handleObsidianNoteIntegrate(args, dataDir);
  if (command === "obsidian_note_status") return handleObsidianNoteStatus(args, dataDir);
  if (command === "obsidian_vault_status") return handleObsidianVaultStatus(args);
  if (command === "obsidian_vault_snapshot") return handleObsidianVaultSnapshot(args, dataDir);
  if (command === "obsidian_vault_snapshot_list") return handleObsidianVaultSnapshotList(args, dataDir);
  if (command === "obsidian_vault_snapshot_diff") return handleObsidianVaultSnapshotDiff(args, dataDir);
  if (command === "obsidian_vault_index_build") return handleObsidianVaultIndexBuild(args, dataDir);
  if (command === "obsidian_vault_index_list") return handleObsidianVaultIndexList(args, dataDir);
  if (command === "obsidian_vault_index_get") return handleObsidianVaultIndexGet(args, dataDir);
  if (command === "obsidian_vault_index_refresh_check") return handleObsidianVaultIndexRefreshCheck(args, dataDir);
  if (command === "obsidian_vault_index_refresh") return handleObsidianVaultIndexRefresh(args, dataDir);
  if (command === "obsidian_vault_sync_plan_create") return handleObsidianVaultSyncPlanCreate(args, dataDir);
  if (command === "obsidian_vault_sync_action_apply") return handleObsidianVaultSyncActionApply(args, dataDir);
  if (command === "obsidian_note_resolve") return handleObsidianNoteResolve(args, dataDir);
  if (command === "illustration_create") return handleIllustrationCreate(args, dataDir);
  if (command === "illustration_list") return handleIllustrationList(args, dataDir);
  if (command === "illustration_get") return handleIllustrationGet(args, dataDir);
  if (command === "illustration_update") return handleIllustrationUpdate(args, dataDir);
  if (command === "illustration_suggest") return handleIllustrationSuggest(args, dataDir);
  if (command === "user_note_create") return handleUserNoteCreate(args, dataDir, vendorDir);
  if (command === "user_note_list") return handleUserNoteList(args, dataDir, serverModule);
  if (command === "user_note_delete") return handleUserNoteDelete(args, dataDir, vendorDir);
  if (command === "reading_link_weread_book") return handleWereadLinkBook(args, dataDir);
  if (command === "reading_find_weread_context") return handleWereadFindContext(args, dataDir);
  if (command === "reading_get_manifest") return handleCompatGetManifest(args, dataDir);
  if (command === "reading_get_chunk") return handleCompatGetChunk(args, dataDir);
  if (command === "reading_search") return handleCompatSearch(args, dataDir);
  if (command === "reading_search_exact") return handleCompatSearch(args, dataDir, { exact: true });
  if (command === "reading_resume_book") return handleCompatResumeBook(args, serverModule);
  if (command === "reading_update_progress") return handleCompatUpdateProgress(args, dataDir, serverModule);
  if (command === "reading_update_note") return handleCompatUpdateNote(args, dataDir);
  if (command === "reading_read_note") return handleCompatReadNote(args, dataDir);
  if (command === "reading_build_index") return handleCompatBuildIndex(args, dataDir);
  fail(`未知本地命令: ${command}`);
}

function extractContent(toolResult) {
  const content = Array.isArray(toolResult?.content) ? toolResult.content : [];
  const textParts = [];
  const imageParts = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    if (item.type === "text") textParts.push(item.text || "");
    if (item.type === "image") {
      imageParts.push({
        mimeType: item.mimeType || "application/octet-stream",
        dataBytes: item.data ? Buffer.byteLength(item.data, "base64") : 0
      });
    }
  }
  return {
    text: textParts.join("\n\n").trim(),
    images: imageParts
  };
}

function truncate(text) {
  const maxChars = Number(process.env.CO_READING_MAX_RESULT_CHARS || 80000);
  if (!Number.isFinite(maxChars) || maxChars <= 0 || text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n---\n[CoReadingMCP] 内容已截断，原始长度 ${text.length} 字符。`;
}

function safeArgsForDisplay(args) {
  const safe = {};
  for (const [key, value] of Object.entries(args)) {
    if (/base64/i.test(key) && typeof value === "string") {
      safe[key] = `[base64 omitted, ${value.length} chars]`;
    } else {
      safe[key] = value;
    }
  }
  return safe;
}

function formatResult(command, args, toolResult, dataDir) {
  const extracted = extractContent(toolResult);
  const lines = [
    "## CoReadingMCP 执行结果",
    "",
    `- 命令: \`${command}\``,
    `- 数据目录: \`${dataDir}\``,
    `- 参数: \`${JSON.stringify(safeArgsForDisplay(args))}\``,
    ""
  ];
  if (extracted.text) {
    lines.push(truncate(extracted.text));
  } else {
    lines.push("_工具未返回文本内容。_");
  }
  if (extracted.images.length) {
    lines.push("", "### 图像内容", JSON.stringify(extracted.images, null, 2));
  }
  return lines.join("\n");
}

async function main() {
  const payload = parsePayload(await readStdin());
  const { vendorDir, dataDir } = ensureRuntimeEnv();
  const serverModule = await import(pathToFileURL(path.join(vendorDir, "src", "server.js")).href);
  const command = normalizeCommand(payload);
  const args = buildArguments(payload);

  if (command === "list_tools") {
    emit({
      status: "success",
      result: [...LOCAL_TOOLS, ...serverModule.tools].map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }))
    });
    return;
  }

  if (LOCAL_COMMANDS.has(command)) {
    const localResult = await callLocalCommand(command, args, dataDir, serverModule, vendorDir);
    emit({
      status: "success",
      data: localResult,
      result: formatLocalResult(command, localResult, dataDir)
    });
    return;
  }

  if (!serverModule.tools.some((tool) => tool.name === command)) {
    fail(`未知命令: ${command}`, {
      availableCommands: ["list_tools", ...LOCAL_TOOLS.map((tool) => tool.name), ...serverModule.tools.map((tool) => tool.name)]
    });
  }

  const toolResult = await serverModule.callTool(command, args);
  emit({
    status: "success",
    result: formatResult(command, args, toolResult, dataDir)
  });
}

main().catch((error) => {
  fail(error.message || String(error), error.stack);
});
