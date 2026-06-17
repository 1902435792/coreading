# 微信读书配合使用完整工作流

本指南详细说明如何将微信读书与本地共读系统无缝配合使用。

## 前置准备

### 1. 准备本地电子书

确保你有与微信读书相同的电子书本地副本：

```powershell
# 导入本地书籍
'{"command":"reading_import_book","input":"D:/Books/薄雾.epub","bookId":"薄雾","title":"薄雾","author":"作者名"}' | node .\CoReadingMCP.cjs
```

**支持格式**：
- EPUB（推荐）
- TXT
- Markdown

### 2. 检查书库

```powershell
# 列出所有本地书籍
'{"command":"reading_list_books"}' | node .\CoReadingMCP.cjs
```

记下你要链接的书籍的 `bookId`。

## 使用场景与工作流

### 场景 1：从微信读书划线开始深度共读

**步骤流程**：

```
微信读书划线 → 定位本地chunk → 阅读上下文 → AI深度共读 → 沉淀笔记
```

#### 1.1 在微信读书中阅读并划线

在微信读书 App 中：
- 阅读书籍
- 遇到有启发的段落，长按划线
- 可以添加笔记/想法

#### 1.2 建立微信读书与本地书的链接（首次）

**方式一：自动匹配**（推荐）

```powershell
# 使用微信读书的书名和作者
'{"command":"reading_link_weread_book","wereadTitle":"薄雾[无限]","wereadAuthor":"XXX"}' | node .\CoReadingMCP.cjs
```

系统会自动匹配本地书籍：
- 如果匹配成功（评分 ≥ 0.88），自动建立链接
- 如果匹配失败，返回候选列表供你选择

**方式二：手动确认**（精确控制）

```powershell
# 明确指定本地 bookId
'{"command":"reading_link_weread_book","wereadTitle":"薄雾[无限]","localBookId":"薄雾","confirm":true}' | node .\CoReadingMCP.cjs
```

**返回示例**：
```json
{
  "action": "linked",
  "link": {
    "wereadTitle": "薄雾[无限]",
    "localBookId": "薄雾",
    "score": 0.9,
    "status": "linked"
  }
}
```

#### 1.3 根据划线定位本地chunk

复制微信读书的划线文本，查找本地对应位置：

```powershell
'{"command":"reading_find_weread_context","wereadTitle":"薄雾[无限]","markText":"一种深刻的孤独","includeChunk":true}' | node .\CoReadingMCP.cjs
```

**返回信息**：
- 匹配的 `chunkId`
- 划线在 chunk 中的偏移量
- 前后100字符的上下文
- （可选）完整 chunk 正文

**返回示例**：
```json
{
  "found": true,
  "localBookId": "薄雾",
  "wereadTitle": "薄雾[无限]",
  "markText": "一种深刻的孤独",
  "matches": [
    {
      "chunkId": "ch022",
      "chunkTitle": "第六章",
      "offset": 1234,
      "context": "...前文一种深刻的孤独后文...",
      "fullText": "完整的chunk正文..."
    }
  ]
}
```

#### 1.4 深度阅读与共读

**读取完整 chunk**：

```powershell
'{"command":"reading_read_chunk","bookId":"薄雾","chunkId":"ch022"}' | node .\CoReadingMCP.cjs
```

**创建边注**：

```powershell
'{"command":"reading_annotate_passage","bookId":"薄雾","chunkId":"ch022","quote":"一种深刻的孤独","quoteOffset":1234,"note":"这句话让我想到...","kind":"resonance"}' | node .\CoReadingMCP.cjs
```

**创建私有笔记**（先不让AI看到）：

```powershell
'{"command":"user_note_create","bookId":"薄雾","chunkId":"ch022","quote":"一种深刻的孤独","note":"我的初步想法...","status":"private"}' | node .\CoReadingMCP.cjs
```

**提交笔记给AI讨论**：

```powershell
'{"command":"reading_submit_user_notes","bookId":"薄雾","chunkId":"ch022","sessionId":"薄雾-共读"}' | node .\CoReadingMCP.cjs
```

#### 1.5 沉淀到知识库

**创建评价**：

```powershell
'{"command":"review_create","bookId":"薄雾","chunkId":"ch022","summary":"这一章探讨了孤独的本质","observations":[{"text":"作者用雾作为隐喻"}]}' | node .\CoReadingMCP.cjs
```

**生成Obsidian笔记预览**：

```powershell
'{"command":"sink_preview_create","reviewId":"review_xxx","targets":["obsidian"],"requireApproval":true}' | node .\CoReadingMCP.cjs
```

**审批并执行写入**：

```powershell
# 审批
'{"command":"sink_preview_update","previewId":"preview_xxx","status":"approved"}' | node .\CoReadingMCP.cjs

# 写入Obsidian
'{"command":"sink_execute","previewId":"preview_xxx","vaultPath":"D:/ObsidianVault"}' | node .\CoReadingMCP.cjs
```

### 场景 2：从微信读书书评/笔记批量导入

如果你在微信读书有大量笔记想要系统化整理：

#### 2.1 导出微信读书笔记

微信读书支持导出笔记（在笔记页面点击右上角的导出）。

#### 2.2 批量定位和导入

```powershell
# 假设你有一个笔记列表
$notes = @(
  @{mark="第一条划线";thought="我的想法1"},
  @{mark="第二条划线";thought="我的想法2"}
)

foreach($note in $notes) {
  # 1. 定位chunk
  $context = echo "{`"command`":`"reading_find_weread_context`",`"wereadTitle`":`"薄雾[无限]`",`"markText`":`"$($note.mark)`"}" | node .\CoReadingMCP.cjs | ConvertFrom-Json
  
  if($context.found) {
    $chunkId = $context.matches[0].chunkId
    $offset = $context.matches[0].offset
    
    # 2. 创建边注
    echo "{`"command`":`"reading_annotate_passage`",`"bookId`":`"薄雾`",`"chunkId`":`"$chunkId`",`"quote`":`"$($note.mark)`",`"quoteOffset`":$offset,`"note`":`"$($note.thought)`",`"kind`":`"reflection`"}" | node .\CoReadingMCP.cjs
    
    Write-Host "✓ 已导入: $($note.mark)" -ForegroundColor Green
  }
}
```

### 场景 3：使用微信读书进度同步本地阅读

#### 3.1 查看微信读书进度

在微信读书查看你读到哪里了，记下具体的文本段落。

#### 3.2 定位本地进度

```powershell
'{"command":"reading_find_weread_context","wereadTitle":"薄雾[无限]","markText":"你当前读到的段落文字"}' | node .\CoReadingMCP.cjs
```

#### 3.3 更新本地进度

```powershell
'{"command":"reading_mark_read","bookId":"薄雾","chunkId":"ch022"}' | node .\CoReadingMCP.cjs
```

#### 3.4 继续阅读

```powershell
'{"command":"reading_continue","bookId":"薄雾"}' | node .\CoReadingMCP.cjs
```

### 场景 4：建立共读计划（配合微信读书定期阅读）

#### 4.1 基于兴趣点创建计划

假设你在微信读书发现某个主题很有趣：

```powershell
# 搜索相关内容
'{"command":"reading_search_chunks","bookId":"薄雾","query":"孤独"}' | node .\CoReadingMCP.cjs

# 创建围绕这个主题的共读计划
'{"command":"interest_backtrack","bookId":"薄雾","query":"孤独","before":2,"after":2,"createPlan":true}' | node .\CoReadingMCP.cjs
```

#### 4.2 创建范围共读计划

```powershell
'{"command":"plan_create","bookId":"薄雾","mode":"range","startChunkId":"ch020","endChunkId":"ch025","annotationDensity":"medium"}' | node .\CoReadingMCP.cjs
```

#### 4.3 执行共读计划

```powershell
# 查看下一步
'{"command":"plan_next_step","planId":"plan_xxx"}' | node .\CoReadingMCP.cjs

# 执行一步
'{"command":"plan_execute_step","planId":"plan_xxx"}' | node .\CoReadingMCP.cjs

# 连续执行3步
'{"command":"plan_run","planId":"plan_xxx","maxSteps":3}' | node .\CoReadingMCP.cjs
```

## 实战示例：完整工作流

### 示例：阅读《薄雾》并进行深度共读

```powershell
# === 第一步：准备工作 ===

# 1. 导入本地书籍
'{"command":"reading_import_book","input":"D:/Books/薄雾.epub","bookId":"薄雾","title":"薄雾"}' | node .\CoReadingMCP.cjs

# 2. 建立与微信读书的链接
'{"command":"reading_link_weread_book","wereadTitle":"薄雾[无限]","localBookId":"薄雾","confirm":true}' | node .\CoReadingMCP.cjs


# === 第二步：基于微信读书划线进行深度共读 ===

# 3. 在微信读书划线："雾在这里不仅是自然现象，更是一种隐喻"

# 4. 定位本地chunk
'{"command":"reading_find_weread_context","wereadTitle":"薄雾[无限]","markText":"雾在这里不仅是自然现象，更是一种隐喻","includeChunk":true}' | node .\CoReadingMCP.cjs

# 返回 chunkId: ch015

# 5. 阅读完整上下文
'{"command":"reading_read_chunk","bookId":"薄雾","chunkId":"ch015"}' | node .\CoReadingMCP.cjs

# 6. 创建边注
'{"command":"reading_annotate_passage","bookId":"薄雾","chunkId":"ch015","quote":"雾在这里不仅是自然现象，更是一种隐喻","note":"作者通过雾这个意象，探讨了人际关系中的模糊性和距离感","kind":"insight"}' | node .\CoReadingMCP.cjs


# === 第三步：创建共读计划 ===

# 7. 围绕"隐喻"主题回溯
'{"command":"interest_backtrack","bookId":"薄雾","query":"隐喻","before":3,"after":3,"createPlan":true}' | node .\CoReadingMCP.cjs

# 返回 planId: plan_20250614_001

# 8. 执行共读计划
'{"command":"plan_run","planId":"plan_20250614_001","maxSteps":3}' | node .\CoReadingMCP.cjs


# === 第四步：沉淀到知识库 ===

# 9. 创建评价
'{"command":"review_create","bookId":"薄雾","startChunkId":"ch012","endChunkId":"ch018","summary":"这几章通过雾的意象探讨了人际距离","observations":[{"text":"雾作为核心隐喻贯穿始终"},{"text":"人物关系随雾的浓淡而变化"}]}' | node .\CoReadingMCP.cjs

# 返回 reviewId: review_xxx

# 10. 生成Obsidian笔记预览
'{"command":"sink_preview_create","reviewId":"review_xxx","targets":["obsidian"],"requireApproval":true}' | node .\CoReadingMCP.cjs

# 返回 previewId: preview_xxx

# 11. 审批
'{"command":"sink_preview_update","previewId":"preview_xxx","status":"approved"}' | node .\CoReadingMCP.cjs

# 12. 写入Obsidian
'{"command":"sink_execute","previewId":"preview_xxx","vaultPath":"D:/ObsidianVault"}' | node .\CoReadingMCP.cjs
```

## 高级技巧

### 技巧 1：批量处理微信读书想法

```powershell
# 导出微信读书笔记为 CSV
# 格式: 划线文本,我的想法

Import-Csv weread_notes.csv | ForEach-Object {
  $context = echo "{`"command`":`"reading_find_weread_context`",`"wereadTitle`":`"薄雾[无限]`",`"markText`":`"$($_.划线文本)`"}" | 
    node .\CoReadingMCP.cjs | ConvertFrom-Json
  
  if($context.found) {
    echo "{`"command`":`"user_note_create`",`"bookId`":`"薄雾`",`"chunkId`":`"$($context.matches[0].chunkId)`",`"quote`":`"$($_.划线文本)`",`"note`":`"$($_.我的想法)`",`"status`":`"open`"}" | 
      node .\CoReadingMCP.cjs
  }
}
```

### 技巧 2：创建阅读卡片（类似微信读书的书签）

```powershell
'{"command":"reading_collect_card","bookId":"薄雾","chunkId":"ch015","quote":"雾在这里不仅是自然现象，更是一种隐喻","note":"关键洞察","kicker":"💡 核心隐喻","art":"fold"}' | node .\CoReadingMCP.cjs
```

查看卡片收件箱：

```powershell
'{"command":"reading_card_inbox","bookId":"薄雾","limit":10}' | node .\CoReadingMCP.cjs
```

### 技巧 3：与Sidecar配合使用

如果你启动了Sidecar（Web界面）：

```powershell
npm run sidecar
```

访问 `http://127.0.0.1:8791`，你可以：
- 在浏览器中可视化阅读
- 点击导入微信读书链接定位的chunk
- 与Nova进行实时对话共读
- 可视化查看阅读地图和足迹

## 常见问题

### Q1: 微信读书的书名和本地书名不完全一致怎么办？

**A**: 使用手动确认模式：

```powershell
'{"command":"reading_link_weread_book","wereadTitle":"薄雾[无限]","localBookId":"薄雾","confirm":true}' | node .\CoReadingMCP.cjs
```

### Q2: 划线文本找不到怎么办？

**A**: 可能原因：
1. 本地版本和微信读书版本不同（翻译版、修订版）
2. 划线文本包含多余的空格或换行

**解决方法**：
- 尝试缩短划线文本，只用关键短语
- 使用搜索功能手动定位：

```powershell
'{"command":"reading_search_chunks","bookId":"薄雾","query":"关键短语"}' | node .\CoReadingMCP.cjs
```

### Q3: 如何查看已经链接了哪些微信读书？

**A**: 查看映射文件：

```powershell
Get-Content D:\VCP\VCPToolBox\data\co-reading-mcp\weread-book-map.json | ConvertFrom-Json | Select-Object -ExpandProperty links
```

### Q4: 可以链接多个微信读书账号吗？

**A**: 可以。链接信息是基于书名的，不关联账号。不同账号的同名书籍会映射到同一个本地书籍。

### Q5: 如何取消链接？

**A**: 手动编辑映射文件：

```powershell
# 备份
Copy-Item D:\VCP\VCPToolBox\data\co-reading-mcp\weread-book-map.json weread-book-map.backup.json

# 编辑删除不需要的链接
notepad D:\VCP\VCPToolBox\data\co-reading-mcp\weread-book-map.json
```

## 最佳实践

1. **定期同步**：每次在微信读书阅读后，使用 `reading_find_weread_context` 同步划线
2. **分层笔记**：
   - 微信读书：即时想法（快速记录）
   - 本地边注：初步分析（`reading_annotate_passage`）
   - 用户笔记：深度思考（`user_note_create`）
   - Obsidian：系统化沉淀（`sink_execute`）
3. **善用计划**：对感兴趣的主题创建共读计划，让AI帮你深度挖掘
4. **批量处理**：定期导出微信读书笔记，批量导入本地系统

## 工作流示意图

```
微信读书 App
    ↓ (划线/笔记)
    ↓
reading_link_weread_book (建立链接，仅首次)
    ↓
reading_find_weread_context (定位chunk)
    ↓
reading_read_chunk (阅读完整上下文)
    ↓
┌───────────────┬─────────────────┬──────────────────┐
│  边注         │  用户笔记        │  阅读卡片         │
│  annotate     │  user_note      │  collect_card    │
└───────────────┴─────────────────┴──────────────────┘
    ↓
┌───────────────────────────────────────────────────┐
│  创建共读计划 (plan_create / interest_backtrack)  │
└───────────────────────────────────────────────────┘
    ↓
plan_execute_step / plan_run (AI深度共读)
    ↓
review_create (创建评价)
    ↓
sink_preview_create (生成沉淀预览)
    ↓
sink_preview_update (审批)
    ↓
sink_execute (写入Obsidian/OBS/DailyNote)
```

---

**现在你可以开始使用了！** 🚀

建议从简单的工作流开始：
1. 导入一本书
2. 链接微信读书
3. 找一条划线试试 `reading_find_weread_context`
4. 逐步探索更多功能
