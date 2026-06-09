# CoReadingMCP

`CoReadingMCP` 把 `idleprocesscc/co-reading-mcp` 包装为 VCP 同步插件。

## 快速启动

```powershell
cd D:\VCP\VCPToolBox\Plugin\CoReadingMCP
Set-Item Env:VCP_API_KEY (Read-Host "VCP key")
npm run sidecar
```

打开：

```text
http://127.0.0.1:8791
```

最小验证：

```powershell
npm run check
Invoke-RestMethod http://127.0.0.1:8791/api/health
Invoke-RestMethod http://127.0.0.1:8791/api/snapshot
```

前端第一屏是阅读区：当前书、当前 chunk 原文、阅读地图、阅读足迹、选区、笔记、问 Nova。开发阶段可以让 Nova 通过 VCP 陪 Codex 审阅方向；最终使用时只有一个读书伙伴 Nova。

## Nova 接入

Sidecar 默认调用：

```text
http://127.0.0.1:3100/v1/chat/completions
```

可用环境变量覆盖：

- `VCP_API_KEY` 或 `CO_READING_NOVA_API_KEY`：Nova/VCP 访问 key。
- `CO_READING_NOVA_BRIDGE_URL`：OpenAI 兼容 chat completions 地址。
- `CO_READING_NOVA_MODEL`：默认 `gpt-5.5`。
- `CO_READING_NOVA_TIMEOUT_MS`：Nova 单次请求超时，默认 `240000`；前端默认等待 4 分钟，不自动连环重试。
- `CO_READING_NOVA_GUIDE_PATH`：读书 Nova 操作手册路径；默认 `prompts\CoReadingNovaGuide.txt`。

不要把 key 写入 `config.env`、README、日志或 git 历史。仓库只提交源码、前端、脚本、prompt 和 vendor 必要源码；真实阅读数据默认写到 `D:\VCP\VCPToolBox\data\co-reading-mcp`，不提交。

## 用途

- 导入 EPUB、TXT、Markdown 到本地阅读库。
- 按 chunk 阅读、继续阅读、搜索段落。
- 用阅读地图查看全书位置、段内位置、目录节点和本地书签。
- 把已有边注和我的笔记回投到原文，形成可点击定位的阅读足迹。
- 写边注、提交用户笔记、在边注下回复。
- 标记已读、查看进度、收集阅读卡片。
- 浏览阅读卡片收件箱、预览/保存/移出卡片。
- 维护并执行 Nova 共读计划，支持全书、范围和兴趣线索阅读。
- 生成章节/范围评价，并创建 Obsidian、DailyNote、VCPMemory 的沉淀预览。

## 目录

```text
Plugin/CoReadingMCP/
|- CoReadingMCP.cjs
|- CoReadingSidecar.cjs
|- frontend/
|- plugin-manifest.json
|- config.env.example
|- prompts/nova-co-reading-reader.txt
`- vendor/co-reading-mcp/
```

默认数据目录：

```text
D:\VCP\VCPToolBox\data\co-reading-mcp
```

## 调用

常用命令：

- `list_tools`
- `list_books`
- `continue`
- `read_chunk`
- `search`
- `import_file`
- `annotate`
- `user_note_create`
- `user_note_list`
- `submit_notes`
- `list_submissions`
- `read_submission`
- `reply`
- `mark_read`
- `card_inbox`
- `card_collection`
- `open_card`
- `save_card`
- `dismiss_card`
- `list_cards`
- `collect_card`
- `progress`
- `plan_create`
- `interest_backtrack`
- `plan_list`
- `plan_get`
- `plan_update`
- `plan_next_step`
- `plan_execute_step`
- `plan_run`
- `plan_record_step`
- `review_create`
- `review_list`
- `review_get`
- `sink_preview_create`
- `sink_preview_create_from_cards`
- `sink_preview_list`
- `sink_preview_get`
- `sink_preview_update`
- `sink_execute`
- `obsidian_note_read`
- `obsidian_note_diff`
- `obsidian_note_merge`
- `obsidian_note_suggest_integration`
- `obsidian_note_preview_replace_range`
- `obsidian_note_confirm_replace_range`
- `obsidian_note_apply_integration_choice`
- `obsidian_note_integrate`
- `obsidian_note_status`
- `obsidian_vault_status`
- `obsidian_vault_index_build`
- `obsidian_vault_index_list`
- `obsidian_vault_index_get`
- `obsidian_vault_index_refresh_check`
- `obsidian_vault_index_refresh`
- `obsidian_vault_sync_plan_create`
- `obsidian_note_resolve`
- `illustration_create`
- `illustration_list`
- `illustration_get`
- `illustration_update`
- `illustration_suggest`

也可以直接用上游 MCP 工具名，例如 `reading_list_books`、`reading_import_book`。

## 独立共读 Sidecar

不接入 6005/AdminPanel-Vue。共读驾驶舱作为插件自带 sidecar 运行：

```powershell
cd D:\VCP\VCPToolBox\Plugin\CoReadingMCP
npm run sidecar
```

默认打开：

```text
http://127.0.0.1:8791
```

健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:8791/api/health
```

PM2 守护运行：

```powershell
cd D:\VCP\VCPToolBox\Plugin\CoReadingMCP
npm run sidecar:pm2:start
pm2 status vcp-coreading-sidecar
Invoke-RestMethod http://127.0.0.1:8791/api/health
```

更新或停止：

```powershell
npm run sidecar:pm2:restart
npm run sidecar:pm2:stop
npm run sidecar:pm2:delete
```

Windows 用户级开机自启：

```powershell
cd D:\VCP\VCPToolBox\Plugin\CoReadingMCP
npm run sidecar:autostart:status
npm run sidecar:autostart:enable
npm run sidecar:autostart:disable
```

自启脚本写入 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`，只影响当前 Windows 用户，不需要管理员权限；登录后会执行 `npm run sidecar:pm2:start`。手动预览可运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows-autostart.ps1 -Enable -WhatIf
```

可用环境变量：

- `CO_READING_SIDECAR_HOST`：监听地址，默认 `127.0.0.1`。
- `CO_READING_SIDECAR_PORT`：监听端口，默认 `8791`。
- `CO_READING_SIDECAR_MAX_BODY_BYTES`：sidecar 单次请求体上限，默认约 2MB。
- `READING_IMPORT_MAX_BYTES`：导入文件大小上限，wrapper 默认约 100MB。
- `CO_READING_DATA_DIR`：阅读数据目录；可指向临时目录做无污染测试。
- `CO_READING_NOVA_AGENT_HISTORY_LIMIT`：后端 Nova Agent 运行记录保留条数，默认 `80`。
- `PYTHON`：导入器使用的 Python 命令；Windows 默认 `python`，其它平台默认 `python3`。

Sidecar 页面支持：

- 查看书库、计划、评价、沉淀预览。
- 从浏览器选择 TXT/Markdown/EPUB 文件导入书库；超过单次请求体上限的大书会自动走分片导入。
- 打开或切换段落后默认触发一次 Nova 自动预读；可关闭“自动预读”，也可点“Nova 自主读”手动重读。
- Nova 自主预读由 sidecar 后端 Agent 层执行，不由前端拼流程；运行记录写入数据目录的 `nova_agent_runs.json`。
- Nova 面板可收起、恢复、切换窄/宽；沉浸模式默认净读并收起 Nova，阅读中可按需打开。
- 创建范围/全书/兴趣线索/自由共读计划。
- 读取 chunk 原文、搜索兴趣点、按选区/偏移写入和查看 Nova/AI 边注。
- 用阅读地图查看全书 chunk 节点、当前全书/段内进度；本地插书签并返回最近书签。
- 围绕选区、搜索结果或当前 chunk 回溯前后文，并直接打开范围、生成后续共读计划或沉淀预览。
- 将已命中的边注/我的笔记高亮回原文，右侧阅读足迹卡片可点击定位。
- 保存用户私有笔记，按当前 chunk 提交给 Nova，并回看提交批次。
- 把当前选区或段落沉淀为阅读卡片，查看卡片收件箱/收藏，并预览或保存卡片图片。
- 为当前 chunk/range 创建范围评价，并生成 Obsidian/DailyNote/VCPMemory 沉淀预览。
- 领取下一步、执行一个 `plan_execute_step`，或用 `plan_run` 连续推进 3 步。
- 启动/停止 sidecar durable 后台 runner，自动按间隔推进计划，并在失败时显示错误与重试入口。
- 暂停/恢复计划；暂停状态会阻止 runner 继续执行。
- 查看沉淀预览正文，再批准并执行 `sink_execute`。
- 保存 Obsidian 全库 proposed/resolved 快照，回看快照列表，比较整理前后的快照差异，并从差异项定位到对应笔记 block；这些操作只写 CoReadingMCP 数据，不写 Obsidian vault。
- 建立 Obsidian 本地 block 索引、回看索引列表、按待整理状态读取索引、检查索引是否过期、生成只读同步审阅计划、确认后重建索引，并从索引项定位到对应笔记 block；索引只写 CoReadingMCP 数据，不写 Obsidian vault。
- 沉淀路径输入框会优先使用浏览器本地记住的 `Vault`、`DailyNote`、`MemoryRoot`；若本地没有保存值，会从 sidecar 环境变量 `CO_READING_OBSIDIAN_VAULT_DIR`、`CO_READING_DAILY_NOTE_ROOT`、`CO_READING_VCP_MEMORY_ROOT` 自动带入。可用“清空路径”移除浏览器本地设置。
- 基于当前 chunk 生成无剧透插图提示词建议，创建插图请求，登记图库/已生成图片 URI，并在插图库中预览。

## 共读计划

计划数据默认写入：

```text
D:\VCP\VCPToolBox\data\co-reading-mcp\reading_plans.json
```

创建一个范围共读计划：

```powershell
'{"command":"plan_create","bookId":"anthropic-guidelines","mode":"range","startChunkId":"ch00","endChunkId":"ch05","budget":{"maxChunksPerStep":2,"maxAnnotationsPerChunk":2},"annotationDensity":"medium","sinkPolicy":{"requireApproval":true,"obsidian":true}}' | node .\CoReadingMCP.cjs
```

查看下一步：

```powershell
'{"command":"plan_next_step","planId":"<planId>"}' | node .\CoReadingMCP.cjs
```

执行一个 bounded step：

```powershell
'{"command":"plan_execute_step","planId":"<planId>"}' | node .\CoReadingMCP.cjs
```

连续推进多个 bounded step：

```powershell
'{"command":"plan_run","planId":"<planId>","maxSteps":3}' | node .\CoReadingMCP.cjs
```

`plan_run` 会写入 plan history，并使用 `data\co-reading-mcp\locks\<planId>.run.lock` 防止同一计划被两个 runner 同时推进。异常退出留下的旧 lock 可等待默认 TTL 过期，或显式传 `forceLock:true` 覆盖。

Sidecar 后台 runner：

```powershell
$body = '{"planId":"<planId>","intervalMs":2000,"maxStepsPerTick":1,"maxRetries":1,"retryDelayMs":2000}'
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8791/api/runner/start -Body $body -ContentType 'application/json'
Invoke-RestMethod -Uri 'http://127.0.0.1:8791/api/runner/status?planId=<planId>'
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8791/api/runner/retry -Body $body -ContentType 'application/json'
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8791/api/runner/stop -Body '{"planId":"<planId>"}' -ContentType 'application/json'
```

后台 runner job 写入 `runner_jobs.json`；sidecar 重启时会恢复 `running/waiting` job。它每轮调用一次 `plan_run`，尊重 plan pause/completed/error 状态，支持有限自动重试，并把最近结果、错误、tick、retry 和执行数暴露给 UI 的“后台跑 / 停止后台 / 重试”按钮。它仍依赖 sidecar 进程本身运行，不是系统服务级常驻 worker。

## Nova Agent 后端层

Sidecar 提供轻量 Agent API，用现有 VCP/Nova 接口执行读书任务：

- `POST /api/agent/run`：执行单次 Agent action。当前支持 `{"action":"pre_read","bookId":"...","chunkId":"..."}`。
- `GET /api/agent/runs?bookId=...&chunkId=...&action=pre_read`：读取 Agent 运行历史。
- `/api/snapshot` 会带出最近 `agentRuns`，前端据此显示“Nova 已先读”、本段回看和阅读足迹。

`pre_read` 会由后端读取 `list_chunks/read_chunk`，挑选当前段附近候选段，再调用 `/api/nova/ask` 所用的 Nova bridge。相同 `action/bookId/chunkId` 正在执行时，sidecar 复用同一个运行 promise，不会并发重复请求 Nova；需要强制重跑时可传 `force:true`。

暂停和恢复：

```powershell
'{"command":"plan_update","planId":"<planId>","status":"paused"}' | node .\CoReadingMCP.cjs
'{"command":"plan_update","planId":"<planId>","status":"active"}' | node .\CoReadingMCP.cjs
```

`plan_execute_step` 的边界：

- `read_range`：读取本步 chunk、按默认设置标记已读、生成保守 `draft` review，并按计划策略生成沉淀预览。
- `review_range`：读取来源范围后生成 `draft` review 和沉淀预览，但不重复标记进度。
- `search_interest`：搜索兴趣线索，记录命中和候选 `chosenChunkIds`，不自动扩展计划。
- 默认不把完整原文写入 review 或沉淀内容；沉淀预览仍需 `approved` 后才能 `sink_execute`。

写入当前 chunk 边注：

```powershell
'{"command":"annotate","bookId":"anthropic-guidelines","chunkId":"ch00","quote":"short anchored quote","quoteOffset":120,"note":"这句值得停留。","kind":"resonance"}' | node .\CoReadingMCP.cjs
```

`annotate` 走上游 `reading_annotate_passage`，会作为 AI/Nova 边注发布；用户私有笔记先走 `user_note_create`，再按需走 `submit_notes`。

保存并提交用户笔记：

```powershell
'{"command":"user_note_create","bookId":"anthropic-guidelines","chunkId":"ch00","quote":"short anchored quote","quoteOffset":120,"note":"这里我想问 Nova。","status":"open"}' | node .\CoReadingMCP.cjs
'{"command":"submit_notes","bookId":"anthropic-guidelines","chunkId":"ch00","sessionId":"sidecar-anthropic-guidelines"}' | node .\CoReadingMCP.cjs
```

`quoteOffset` 可选；sidecar 从原文选区自动计算。`user_note_create` 直接写入 `author=user,status=open/private/draft`，不会发布成 Nova 边注；`submit_notes` 会把可提交用户笔记标记为 `submitted`，并生成提交批次供 Nova 回应。

收集和回访阅读卡片：

```powershell
'{"command":"collect_card","bookId":"anthropic-guidelines","chunkId":"ch00","quote":"short anchored quote","note":"这段值得后面再回来。","kicker":"收获了一枚回声书签","art":"fold"}' | node .\CoReadingMCP.cjs
'{"command":"card_inbox","bookId":"anthropic-guidelines","limit":10}' | node .\CoReadingMCP.cjs
'{"command":"card_collection","bookId":"anthropic-guidelines","limit":12}' | node .\CoReadingMCP.cjs
'{"command":"sink_preview_create_from_cards","bookId":"anthropic-guidelines","limit":12,"title":"本章阅读卡片 digest","requireApproval":true}' | node .\CoReadingMCP.cjs
'{"command":"sink_preview_create_from_cards","bookId":"anthropic-guidelines","cardIds":["<cardId>"],"title":"单张卡片沉淀","requireApproval":true}' | node .\CoReadingMCP.cjs
'{"command":"save_card","cardId":"<cardId>"}' | node .\CoReadingMCP.cjs
'{"command":"dismiss_card","cardId":"<cardId>"}' | node .\CoReadingMCP.cjs
```

阅读卡片保存在 `cards.jsonl`，适合作为 digest/书签层；`sink_preview_create_from_cards` 会把卡片整理成 Obsidian Markdown 预览，但仍不直接写 vault，后续继续走 `sink_preview_update(approved) -> sink_execute` 的审批链路。传 `cardIds` 时只沉淀指定卡片，适合从 sidecar 的单张卡片入口生成待审批 preview。

记录步骤完成：

```powershell
'{"command":"plan_record_step","planId":"<planId>","stepId":"step-001","status":"done","result":{"summary":"本步读完并完成边注。"}}' | node .\CoReadingMCP.cjs
```

兴趣线索计划可以传 `mode:"interest_trail"` 和 `query`，Nova 会先得到搜索步骤，再围绕命中的 chunk 继续阅读或评价。

围绕兴趣点回溯前后文并创建计划：

```powershell
'{"command":"interest_backtrack","bookId":"anthropic-guidelines","query":"helpfulness","before":1,"after":2,"createPlan":true,"budget":{"maxChunksPerStep":2},"sinkPolicy":{"requireApproval":true,"obsidian":true}}' | node .\CoReadingMCP.cjs
'{"command":"sink_preview_create_from_backtrack","bookId":"anthropic-guidelines","query":"helpfulness","anchorChunkId":"ch00","before":1,"after":2,"vaultPath":"D:\\ObsidianVault","requireApproval":true}' | node .\CoReadingMCP.cjs
```

`interest_backtrack` 不会把整本书塞进上下文；它只返回命中锚点附近的 bounded ranges，默认附带 `evidence/evidenceMarkdown` 证据包，包含命中摘录、范围摘要和 Nova 复读提示，方便作为 Obsidian proposed update 沉淀；在 `createPlan=true` 时会把这些 chunk 变成后续可执行阅读计划。`sink_preview_create_from_backtrack` 会把同一 evidenceMarkdown 包成 Obsidian sink preview，仍需批准后再执行写入。

## 评价与沉淀预览

评价与沉淀预览默认写入：

```text
D:\VCP\VCPToolBox\data\co-reading-mcp\reading_reviews.json
D:\VCP\VCPToolBox\data\co-reading-mcp\sink_previews.json
```

创建章节/范围评价：

```powershell
'{"command":"review_create","bookId":"anthropic-guidelines","planId":"<planId>","stepId":"step-003","summary":"这一段把诚实从态度推进到可执行约束。","observations":[{"text":"核心张力是帮助用户与保持透明之间的平衡。"}],"questions":[{"text":"后续章节如何处理冲突场景？"}],"quotes":[{"chunkId":"ch14","quote":"short anchored quote","note":"可作为边注回链"}],"tags":["co-reading","review"]}' | node .\CoReadingMCP.cjs
```

创建沉淀预览：

```powershell
'{"command":"sink_preview_create","reviewId":"<reviewId>","targets":["obsidian","dailyNote","vcpMemory"],"requireApproval":true}' | node .\CoReadingMCP.cjs
```

Obsidian 预览会自动嵌入同书同范围内 `generated/inserted` 状态的插图；也可显式指定：

```powershell
'{"command":"sink_preview_create","reviewId":"<reviewId>","targets":["obsidian"],"illustrationIds":["<illustrationId>"],"requireApproval":true}' | node .\CoReadingMCP.cjs
```

审批或驳回预览：

```powershell
'{"command":"sink_preview_update","previewId":"<previewId>","status":"approved","note":"确认写入 Obsidian 前的内容。"}' | node .\CoReadingMCP.cjs
```

写入前修正文案：

```powershell
'{"command":"sink_preview_update","previewId":"<previewId>","status":"pending","content":"# Edited preview","note":"写入前修订"}' | node .\CoReadingMCP.cjs
```

执行已审批的预览：

```powershell
'{"command":"sink_execute","previewId":"<previewId>","vaultPath":"D:\\ObsidianVault","overwrite":false}' | node .\CoReadingMCP.cjs
```

执行规则：

- `obsidian`：写入 `vaultPath` 或 `CO_READING_OBSIDIAN_VAULT_DIR` 下的 Markdown 文件。
- Obsidian 执行时会把 Markdown 中的本地插图链接（`file:///...` 或 Windows 本地路径）复制到 `CoReading/_assets/<reviewId>/`，并改写为 vault 相对链接；远程 URL 保持原样。可用 `assetFolder` 和 `overwriteAssets` 覆盖。
- `dailyNote`：调用 `DailyNoteWrite`，需要 `dailyNoteRoot`、`CO_READING_DAILY_NOTE_ROOT` 或 `KNOWLEDGEBASE_ROOT_PATH`。
- `vcpMemory`：调用 `VCPMemory ProposeMemory`，可用 `vcpMemoryRoot` 或 `CO_READING_VCP_MEMORY_ROOT` 指定提案目录。
- 只有 `approved` 状态会执行；`pending`、`rejected` 默认拒绝执行，除非显式传 `force:true`。
- 执行成功后预览状态变为 `exported`，并在 `sink_previews.json` 中记录执行结果。

Obsidian 回读、差异和保守合并：

```powershell
'{"command":"obsidian_note_read","previewId":"<previewId>","vaultPath":"D:\\ObsidianVault"}' | node .\CoReadingMCP.cjs
'{"command":"obsidian_note_diff","previewId":"<previewId>","vaultPath":"D:\\ObsidianVault"}' | node .\CoReadingMCP.cjs
'{"command":"obsidian_note_merge","previewId":"<previewId>","vaultPath":"D:\\ObsidianVault","updatedBy":"Nova"}' | node .\CoReadingMCP.cjs
'{"command":"obsidian_note_suggest_integration","previewId":"<previewId>","vaultPath":"D:\\ObsidianVault"}' | node .\CoReadingMCP.cjs
'{"command":"obsidian_note_preview_replace_range","previewId":"<previewId>","vaultPath":"D:\\ObsidianVault","maxCandidates":3}' | node .\CoReadingMCP.cjs
'{"command":"obsidian_note_confirm_replace_range","previewId":"<previewId>","vaultPath":"D:\\ObsidianVault","confirmReplace":true,"startLine":1,"endLine":4,"expectedDraftHash":"<draftHash>","replacedBy":"Nova"}' | node .\CoReadingMCP.cjs
'{"command":"obsidian_note_confirm_replace_range","previewId":"<previewId>","vaultPath":"D:\\ObsidianVault","confirmReplace":true,"selectedRanges":[{"startLine":1,"endLine":1},{"startLine":5,"endLine":6}],"expectedDraftHash":"<draftHash>","replacedBy":"Nova"}' | node .\CoReadingMCP.cjs
'{"command":"obsidian_note_apply_integration_choice","choiceId":"append_integrated_update","previewId":"<previewId>","vaultPath":"D:\\ObsidianVault","integratedBy":"Nova"}' | node .\CoReadingMCP.cjs
'{"command":"obsidian_note_integrate","previewId":"<previewId>","vaultPath":"D:\\ObsidianVault","integratedContent":"整理进主笔记的最终段落。","integratedBy":"Nova"}' | node .\CoReadingMCP.cjs
'{"command":"obsidian_note_status","previewId":"<previewId>","vaultPath":"D:\\ObsidianVault"}' | node .\CoReadingMCP.cjs
'{"command":"obsidian_vault_status","vaultPath":"D:\\ObsidianVault","folder":"CoReading","status":"proposed","limit":50,"offset":0}' | node .\CoReadingMCP.cjs
'{"command":"obsidian_vault_snapshot","vaultPath":"D:\\ObsidianVault","folder":"CoReading","status":"all","label":"before整理","createdBy":"Nova"}' | node .\CoReadingMCP.cjs
'{"command":"obsidian_vault_snapshot_list","vaultPath":"D:\\ObsidianVault","folder":"CoReading","limit":10}' | node .\CoReadingMCP.cjs
'{"command":"obsidian_vault_snapshot_diff"}' | node .\CoReadingMCP.cjs
'{"command":"obsidian_vault_snapshot_diff","changeStatus":"proposed","includeBlocks":true}' | node .\CoReadingMCP.cjs
'{"command":"obsidian_vault_index_build","vaultPath":"D:\\ObsidianVault","folder":"CoReading","label":"整理队列索引"}' | node .\CoReadingMCP.cjs
'{"command":"obsidian_vault_index_list","vaultPath":"D:\\ObsidianVault","folder":"CoReading"}' | node .\CoReadingMCP.cjs
'{"command":"obsidian_vault_index_get","status":"proposed","limit":50}' | node .\CoReadingMCP.cjs
'{"command":"obsidian_vault_index_refresh_check","vaultPath":"D:\\ObsidianVault","folder":"CoReading","includeBlocks":true}' | node .\CoReadingMCP.cjs
'{"command":"obsidian_vault_sync_plan_create","vaultPath":"D:\\ObsidianVault","folder":"CoReading","includeBlocks":true}' | node .\CoReadingMCP.cjs
'{"command":"obsidian_vault_sync_action_apply","vaultPath":"D:\\ObsidianVault","action":{"actionId":"<actionId>","recommendation":"mark_local_index_resolved_or_rebuild","notePath":"CoReading/example.md","previewId":"<previewId>","afterStatus":"resolved"},"confirmApply":true,"appliedBy":"Nova"}' | node .\CoReadingMCP.cjs
'{"command":"obsidian_vault_index_refresh","vaultPath":"D:\\ObsidianVault","folder":"CoReading","confirmRefresh":true,"label":"用户确认重建"}' | node .\CoReadingMCP.cjs
'{"command":"obsidian_note_resolve","previewId":"<previewId>","vaultPath":"D:\\ObsidianVault","resolvedBy":"Nova","resolutionNote":"已整理进主笔记的人物线索段落。"}' | node .\CoReadingMCP.cjs
'{"command":"obsidian_note_resolve","notePath":"CoReading/notes/example.md","blockPreviewId":"<blockPreviewId>","vaultPath":"D:\\ObsidianVault","resolvedBy":"Nova","resolutionNote":"已核对，无需再处理。"}' | node .\CoReadingMCP.cjs
```

`obsidian_note_status` 只读汇总目标笔记里的 CoReading proposed update，返回待整理/已整理数量、marker 和行号。`obsidian_vault_status` 只读扫描 vault/folder 内 Markdown 笔记，汇总所有 CoReading proposed update，适合回看整个沉淀队列；支持 `limit/offset` 文件级分页，返回 `hasMore/nextOffset`，并用 `skippedFiles` 标出因 `maxBytesPerFile` 跳过的 Markdown 文件。`obsidian_vault_snapshot` 会把这次扫描结果保存到 CoReadingMCP 数据目录的 `obsidian_vault_snapshots.json`，作为后续同步/冲突 UI 的基线；它不写入 Obsidian vault。`obsidian_vault_snapshot_list` 可分页回看这些快照，默认只返回摘要，传 `includeNotes:true` 才带完整 note/block 列表。`obsidian_vault_snapshot_diff` 比较两次已保存快照，默认比较最近两次，返回 counts delta、added/removed/statusChanged blocks；传 `changeStatus:"proposed"` 可只看仍待整理的变化，传 `includeBlocks:true` 可返回完整变化列表。`obsidian_vault_index_build` 会把一次 vault 扫描保存为本地 block 索引 `obsidian_vault_indexes.json`，便于大 vault 后续分页查询；`obsidian_vault_index_get` 可按 proposed/resolved、previewId 或 notePath 过滤，不写入 vault；`obsidian_vault_index_refresh_check` 会只读比较最新索引和当前 vault 扫描，提示索引是否过期；`obsidian_vault_sync_plan_create` 会把这些差异转成只读审阅动作；`obsidian_vault_sync_action_apply` 只执行已确认的安全动作：把指定 proposed block 标记 resolved，或在 `confirmRefresh:true` 时重建本地索引；它不会自动语义合并。`obsidian_vault_index_refresh` 需要 `confirmRefresh:true` 才会重建索引，只写 CoReadingMCP 数据。`obsidian_note_diff` 会在同一 `previewId` 已经追加过时返回 `alreadyMerged=true`，已整理后返回 `resolved=true`、`resolvedMarker`。`obsidian_note_merge` 默认不覆盖原文；它在目标笔记末尾追加 `CoReading proposed update` 区块，方便人工或 Nova 回看后再整理。同一个 `previewId` 再次合并会返回 `reason=already_merged`，不会重复追加同一块内容；已整理后再次合并会返回 `reason=already_resolved` 和完整 resolved marker。`obsidian_note_suggest_integration` 只读比较当前主笔记正文和 proposed update，返回 `recommendation/reasons/evidence/draft/integrationChoices`；`integrationChoices` 包含保留当前正文、追加整合段落、替换相关段落、人工复核四个分支，用于 Nova 或用户确认如何整合，不写文件。`obsidian_note_preview_replace_range` 会基于整合草稿只读返回候选替换段落范围，包含 `Lstart-end`、score、reason、原文预览、草稿预览和 `draftHash`；优先排序高重合候选，同时保留低分备用候选，方便人工选择；返回 `replacementAllowed=false`、`reason=preview_only_manual_confirmation_required`，不会改文件。`obsidian_note_confirm_replace_range` 只在显式传入 `confirmReplace=true`、候选行号或 `selectedRanges`、以及匹配的 `expectedDraftHash` 后写入；多个 `selectedRanges` 会按非重叠行段分别替换，保留未选中的中间原文，返回 `replacementMode` 与写入后 `appliedRanges` 行号，并把关联 proposed update 标记 resolved；哈希不匹配、范围不在当前候选中或范围重叠会拒绝。`obsidian_note_apply_integration_choice` 只执行安全分支：`append_integrated_update` 会追加 integrated update，`keep_current` 只标记 resolved，`replace_with_draft/manual_review` 不写入并返回人工处理原因。`obsidian_note_integrate` 会把整理后的正文追加为 `CoReading integrated update`，并把关联 proposed update 标记为 resolved；重复集成返回 `reason=already_integrated`。`obsidian_note_resolve` 会把该提案 marker 改成 resolved marker，不删除正文内容；既可传 `previewId` 整理对应沉淀预览，也可传 `notePath + blockPreviewId` 整理由 `obsidian_vault_status` 发现的任意 block。可选 `resolutionNote` 会写入一条短整理说明，后续 status 扫描会返回该说明。重复整理会返回 `reason=already_resolved`、`resolvedMarker`。

## 插图系统预留

插图数据默认写入：

```text
D:\VCP\VCPToolBox\data\co-reading-mcp\illustrations.json
```

本轮只预留协议，不直接调用图像生成 API。插图可以来自 AI 生图、图库或人工上传：

```powershell
'{"command":"illustration_suggest","bookId":"anthropic-guidelines","chunkId":"ch00","position":"chapter_end","layer":"chapter"}' | node .\CoReadingMCP.cjs

'{"command":"illustration_create","bookId":"anthropic-guidelines","chunkId":"ch00","position":"chapter_end","layer":"chapter","sourceType":"ai","prompt":"quiet watercolor mood illustration, safe AI transition, no characters, no spoiler","stylePreset":"quiet editorial watercolor","aspectRatio":"16:9","tags":["chapter-end","mood"]}' | node .\CoReadingMCP.cjs
```

图库或已生成图片可写入 URI：

```powershell
'{"command":"illustration_update","illustrationId":"<illustrationId>","status":"generated","assetUri":"file:///D:/Images/coreading/ch00.png","thumbnailUri":"file:///D:/Images/coreading/ch00-thumb.png","updatedBy":"Nova"}' | node .\CoReadingMCP.cjs
```

协议边界：

- `placement` 记录插入锚点：`bookId`、`chunkId`、`startChunkId/endChunkId`、`position`、`layer`、`characterOffset`。
- `sourceType` 支持 `ai`、`library`、`manual`，后续可接 OpenAI、ComfyUI 或本地图库。
- `safety.spoilerBoundary` 默认锁在当前 chunk/range，避免用未读后文生成剧透图。
- `stylePreset` 用于同一本书统一视觉风格；默认偏“安静编辑水彩”，避免高饱和和强具象抢阅读注意力。
- `status` 支持 `draft/requested/generating/generated/inserted/rejected`，用于异步生图和图库审核。

## 验证

```powershell
cd D:\VCP\VCPToolBox\Plugin\CoReadingMCP
npm run check
'{"command":"list_tools"}' | node .\CoReadingMCP.cjs
'{"command":"list_books"}' | node .\CoReadingMCP.cjs
'{"command":"plan_list"}' | node .\CoReadingMCP.cjs
'{"command":"review_list"}' | node .\CoReadingMCP.cjs
'{"command":"sink_preview_list"}' | node .\CoReadingMCP.cjs
```

重启 VCP 后，系统工具列表中应出现 `Co-Reading 共同阅读插件`。

## 阅读器提示词

阅读器专用 Nova 提示词位于：

```text
D:\VCP\VCPToolBox\Plugin\CoReadingMCP\prompts\nova-co-reading-reader.txt
D:\VCP\VCPToolBox\Plugin\CoReadingMCP\prompts\nova-reader-vcp-bridge.txt
D:\VCP\VCPToolBox\Plugin\CoReadingMCP\prompts\CoReadingNovaGuide.txt
```

`nova-co-reading-reader.txt` 面向普通 OpenAI 兼容前端和 MCP 工具前端，不要求 `始/末` 工具语法。

`CoReadingNovaGuide.txt` 是读书 Nova 的操作手册，包含书库、选区问 Nova、笔记/边注、计划阅读、兴趣回溯、Obsidian/DailyNote/VCPMemory 沉淀和记忆写入边界。Sidecar 的 `/api/nova/ask` 会默认读取它。

`nova-reader-vcp-bridge.txt` 是 VCPBridgeServer 的备选读书模式 prompt，可按需手动复制或引用；本仓库不会覆盖用户本地 `VCPBridgeServer\nova.txt`。如果要让 3100 bridge 专门进入读书模式，可以在 `D:\VCP\VCPToolBox\Plugin\VCPBridgeServer\config.env` 中临时设置：

```env
BRIDGE_SYSTEM_PROMPT=nova-reader.txt
BRIDGE_HIJACK_MODE=prepend
```

也可以把本手册注册为 VCP TVS 变量：把 `CoReadingNovaGuide.txt` 放到 `D:\VCP\VCPToolBox\TVStxt\CoReadingNovaGuide.txt`，再在 VCP 根 `config.env` 里追加：

```env
VarCoReadingNovaGuide=CoReadingNovaGuide.txt
```

然后在读书专用 prompt 里使用：

```text
{{VarCoReadingNovaGuide}}
```

默认产品链路采用解耦上下文包：前端/sidecar 显式传入 `bookId`、`chunkId`、原文、选区、offset 和 `contextMode`，Nova 不需要依赖 VCB 工具占位符也能完成当前段落共读。

本地书库入口默认扫描 `D:\书库`，也可用环境变量覆盖：

```env
CO_READING_LIBRARY_DIR=D:\书库
```

前端“本地书库”区域会调用：

```text
GET  /api/local-library
POST /api/local-library/import
```

导入接口只接受 `CO_READING_LIBRARY_DIR` 内的相对路径，拒绝绝对路径和越界路径。

如果要让 Nova 通过 3100 真正使用读书版提示词，确认：

```text
http://127.0.0.1:3100/health
```

返回 `hasSystemPrompt=true`，且本地 `VCPBridgeServer\config.env` 使用 `BRIDGE_SYSTEM_PROMPT=nova-reader.txt`。`nova-reader.txt` 负责保留 Nova 人格边界并展开 `{{VarCoReadingNovaGuide}}`，不要把读书规则直接覆盖到通用 `nova.txt`。

如果读书效果不顺、工具调用不到、或占位符没有展开，优先调整 `prompts\CoReadingNovaGuide.txt` 和 `prompts\nova-reader-vcp-bridge.txt` 这两份读书专用 prompt；不要覆盖主题人格 prompt 或用户本地 `VCPBridgeServer\nova.txt`。
