# 微信读书联动与 co-reading-kit 兼容性指南

从 [co-reading-kit](https://github.com/Youxuuuuu/co-reading-kit) 移植的微信读书联动功能，并记录当前 co-reading-kit 兼容边界；文档只按已验证能力描述，不把工具名注册写成完整支持。

## 目录

- [微信读书联动功能](#微信读书联动功能)
- [co-reading-kit 兼容性](#co-reading-kit-兼容性)
- [功能对比](#功能对比)

## 微信读书联动功能

通过微信读书划线快速定位本地书籍的对应 chunk，适合配合微信读书 Skill 使用。

### 使用流程

#### 1. 链接微信读书和本地书籍

**自动匹配模式**（推荐）：

```powershell
'{"command":"reading_link_weread_book","wereadTitle":"薄雾[无限]","wereadAuthor":"作者名"}' | node .\CoReadingMCP.cjs
```

系统会根据书名和作者相似度自动匹配：

- 书名完全匹配：0.9 分
- 书名包含关系：0.75 分
- 作者匹配：+0.08 分
- 匹配阈值：常规书名 0.88，短书名（≤2 字）0.93

**手动确认模式**：

```powershell
'{"command":"reading_link_weread_book","wereadTitle":"薄雾[无限]","localBookId":"薄雾","confirm":true}' | node .\CoReadingMCP.cjs
```

明确指定 `localBookId` 和 `confirm:true` 来手动链接。

#### 2. 根据划线查找本地上下文

```powershell
'{"command":"reading_find_weread_context","wereadTitle":"薄雾[无限]","markText":"一种深刻的孤独"}' | node .\CoReadingMCP.cjs
```

**返回结果示例**：

```json
{
  "found": true,
  "localBookId": "薄雾",
  "localTitle": "薄雾",
  "wereadTitle": "薄雾[无限]",
  "markText": "一种深刻的孤独",
  "matches": [
    {
      "chunkId": "ch022",
      "chunkTitle": "第六章",
      "offset": 1234,
      "context": "...前文一种深刻的孤独后文..."
    }
  ]
}
```

**包含完整 chunk 正文**：

```powershell
'{"command":"reading_find_weread_context","wereadTitle":"薄雾[无限]","markText":"一种深刻的孤独","includeChunk":true}' | node .\CoReadingMCP.cjs
```

### 数据存储

链接映射保存在：

```
D:\VCP\VCPToolBox\data\co-reading-mcp\weread-book-map.json
```

格式：

```json
{
  "version": 1,
  "updatedAt": "2025-06-14T...",
  "links": [
    {
      "wereadBookId": "",
      "wereadTitle": "薄雾[无限]",
      "wereadAuthor": "作者名",
      "localBookId": "薄雾",
      "localTitle": "薄雾",
      "localAuthor": "作者名",
      "score": 0.9,
      "status": "linked",
      "matchedBy": ["normalizedTitle", "normalizedAuthor"],
      "updatedAt": "2025-06-14T..."
    }
  ],
  "pending": []
}
```

## co-reading-kit 兼容性

本项目基于 `idleprocesscc/co-reading-mcp` 扩展微信读书联动。当前按真实调用结果区分为：上游原生支持、wrapper 兼容、不需要；不要把“工具名出现在 `list_tools`”等同于完整兼容。

### 工具状态矩阵

| co-reading-kit 工具           | 当前状态     | 可用替代或边界                                                  |
| ----------------------------- | ------------ | --------------------------------------------------------------- |
| `reading_import_book`         | 原生支持     | 上游 co-reading-mcp 原生工具。                                  |
| `reading_list_books`          | 原生支持     | 上游 co-reading-mcp 原生工具。                                  |
| `reading_get_manifest`        | wrapper 兼容 | 返回书籍元数据、chunk 列表与可选预览字段。                      |
| `reading_search`              | wrapper 兼容 | 扫描本地 chunk，返回 `bookId/chunkId/offset/snippet` 兼容结构。 |
| `reading_search_exact`        | wrapper 兼容 | 精确划线定位，支持轻微空白/换行差异。                           |
| `reading_get_chunk`           | wrapper 兼容 | 返回 chunk 正文、`prevId/nextId` 与原版跳转字段。               |
| `reading_get_progress`        | 原生支持     | 上游 co-reading-mcp 原生工具。                                  |
| `reading_build_index`         | wrapper 兼容 | 不建立持久索引，只验证 chunk 可读性并返回统计。                 |
| `reading_update_progress`     | wrapper 兼容 | 写入本地进度记录，并同步标记阅读。                              |
| `reading_update_note`         | wrapper 兼容 | 追加写入本地 notes Markdown。                                   |
| `reading_read_note`           | wrapper 兼容 | 读取本地 notes Markdown，并支持 section 截取。                  |
| `reading_resume_book`         | wrapper 兼容 | 基于上游 `reading_continue` 补齐兼容字段。                      |
| `reading_link_weread_book`    | wrapper 兼容 | 本项目新增 WeRead 联动工具，建立微信读书与本地书籍映射。        |
| `reading_find_weread_context` | wrapper 兼容 | 本项目新增 WeRead 联动工具，用微信读书划线文本定位本地 chunk。  |

### 使用示例

当前建议优先使用本项目原生工具名或已接通的 WeRead wrapper：

```powershell
# 查看本地书库
'{"command":"reading_list_books"}' | node .\CoReadingMCP.cjs

# 查看本地书籍结构
'{"command":"reading_list_chunks","bookId":"薄雾"}' | node .\CoReadingMCP.cjs

# 读取 chunk
'{"command":"reading_read_chunk","bookId":"薄雾","chunkId":"ch022"}' | node .\CoReadingMCP.cjs

# 搜索关键词
'{"command":"reading_search_chunks","bookId":"薄雾","query":"孤独"}' | node .\CoReadingMCP.cjs

# 继续阅读
'{"command":"reading_continue","bookId":"薄雾"}' | node .\CoReadingMCP.cjs
```

### 验证方法

```powershell
npm run check
'{"command":"list_tools"}' | node .\CoReadingMCP.cjs
'{"command":"reading_link_weread_book","wereadTitle":"薄雾[无限]","localBookId":"薄雾","confirm":true}' | node .\CoReadingMCP.cjs
'{"command":"reading_find_weread_context","wereadTitle":"薄雾[无限]","markText":"一种深刻的孤独","includeChunk":true}' | node .\CoReadingMCP.cjs
```

`list_tools` 只能验证工具注册。若要声明某个 co-reading-kit wrapper 已兼容，必须再用临时书库或测试书实际调用该工具，并确认返回结构符合调用方预期。

## 功能对比

### co-reading-kit 的 14 个工具

上方矩阵是当前真实边界；wrapper 兼容表示已接通命令分派并能返回兼容结构，但仍应以临时书库实际调用结果为准。

### 本项目的增强功能

除了 co-reading-kit 的 14 个工具外，本项目还提供：

**进阶阅读功能**：

- ✓ 分块导入（支持大文件分片上传）
- ✓ 边注系统（AI 和用户边注）
- ✓ 用户笔记系统（私有/提交/回复）
- ✓ 阅读卡片系统（收件箱/收藏）
- ✓ 共读计划系统（Nova 自动共读）
- ✓ 评价与沉淀系统（Obsidian/OBS/DailyNote）
- ✓ 插图建议系统

**Obsidian 集成**：

- ✓ 笔记合并与整合建议
- ✓ 快照与差异比对
- ✓ 本地索引与同步计划

**当前工具列表规模**：`list_tools` 当前可返回 50+ 工具；这不等同于 co-reading-kit 14 工具完整兼容。

## 配合微信读书 Skill 使用

1. 在微信读书中划线标注
2. 通过微信读书 Skill 获取书名和划线文本
3. 使用 `reading_link_weread_book` 建立链接（首次）
4. 使用 `reading_find_weread_context` 定位本地 chunk
5. 基于定位结果进行共读讨论

## 注意事项

- 首次使用需要先链接微信读书和本地书籍
- 书名需要足够准确才能自动匹配
- 划线文本需要能定位到本地 chunk；当前支持轻微空白/换行差异
- 链接一次建立后会持久保存，下次直接使用
- co-reading-kit 工具名需要按上方矩阵区分状态；`list_tools` 可见不代表实际调用已完整兼容

## 故障排除

**找不到匹配书籍**：

- 检查本地书库是否已导入该书：`reading_list_books`
- 尝试手动确认链接：`confirm:true` + `localBookId`
- 查看可用的本地 bookId

**找不到划线上下文**：

- 确认书籍已链接：`reading_link_weread_book`
- 检查划线文本是否准确；当前已容忍轻微空白/换行差异
- 可能是本地版本和微信读书版本不一致

**工具名不兼容**：

- 先查看上方工具状态矩阵；wrapper 兼容项需要用临时书库实际调用确认返回结构
- 如果遇到问题，优先使用本项目的原生工具名或上方矩阵列出的 wrapper 名称
