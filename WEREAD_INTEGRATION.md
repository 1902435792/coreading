# 微信读书联动使用指南

从 [co-reading-kit](https://github.com/Youxuuuuu/co-reading-kit) 移植的微信读书联动功能。

## 功能说明

通过微信读书划线快速定位本地书籍的对应 chunk，适合配合微信读书 Skill 使用。

## 使用流程

### 1. 链接微信读书和本地书籍

```powershell
'{"command":"reading_link_weread_book","wereadTitle":"薄雾[无限]","localBookId":"薄雾","confirm":true}' | node .\CoReadingMCP.cjs
```

**自动匹配模式**（推荐）：

```powershell
'{"command":"reading_link_weread_book","wereadTitle":"薄雾[无限]","wereadAuthor":"作者名"}' | node .\CoReadingMCP.cjs
```

系统会根据书名和作者相似度自动匹配：
- 书名完全匹配：0.9分
- 书名包含关系：0.75分
- 作者匹配：+0.08分
- 匹配阈值：常规书名 0.88，短书名（≤2字）0.93

**手动确认模式**：

```powershell
'{"command":"reading_link_weread_book","wereadTitle":"薄雾[无限]","localBookId":"薄雾","confirm":true}' | node .\CoReadingMCP.cjs
```

明确指定 `localBookId` 和 `confirm:true` 来手动链接。

### 2. 根据划线查找本地上下文

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

## 数据存储

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

## 配合微信读书 Skill 使用

1. 在微信读书中划线标注
2. 通过微信读书 Skill 获取书名和划线文本
3. 使用 `reading_link_weread_book` 建立链接（首次）
4. 使用 `reading_find_weread_context` 定位本地 chunk
5. 基于定位结果进行共读讨论

## 注意事项

- 首次使用需要先链接微信读书和本地书籍
- 书名需要足够准确才能自动匹配
- 划线文本必须在本地 chunk 中能找到精确匹配
- 链接一次建立后会持久保存，下次直接使用

## 故障排除

**找不到匹配书籍**：
- 检查本地书库是否已导入该书
- 尝试手动确认链接：`confirm:true` + `localBookId`
- 查看 `reading_list_books` 确认本地 bookId

**找不到划线上下文**：
- 确认书籍已链接：`reading_link_weread_book`
- 检查划线文本是否准确（不要有多余空格）
- 可能是本地版本和微信读书版本不一致
