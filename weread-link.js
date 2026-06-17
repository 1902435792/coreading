#!/usr/bin/env node
"use strict";

/**
 * 微信读书联动功能 - 从 co-reading-kit 移植
 * 提供微信读书书籍链接和划线定位功能
 */

const fs = require("node:fs");
const path = require("node:path");

const MAP_VERSION = 1;
const DEFAULT_LINK_THRESHOLD = 0.88;
const SHORT_TITLE_LINK_THRESHOLD = 0.93;
const DEFAULT_PENDING_THRESHOLD = 0.65;

function normalizeBookTitle(title) {
  let value = String(title || "").normalize("NFKC");

  value = value
    .replace(/[《》]/gu, " ")
    .replace(/\.(?:epub|txt|md)\b/giu, " ")
    .replace(/\b(?:epub|txt|md)\b/giu, " ")
    .replace(
      /\b(?:全集|完本|校对版|校對版|出版版|番外|精校版|精修版|实体书版|實體書版)\b/gu,
      " "
    );

  value = value.replace(/[\[(（【][^\])）】]{0,30}[\])）】]/gu, (segment) => {
    const inner = segment.slice(1, -1);
    return isDisposableBookTitleShell(inner) ? " " : inner;
  });

  value = value
    .replace(/作者[:：]/gu, " ")
    .replace(/[　\s]+/gu, "")
    .replace(/[^\p{Script=Han}A-Za-z0-9]+/gu, "")
    .toLowerCase();

  return value;
}

function isDisposableBookTitleShell(value) {
  const inner = String(value || "")
    .normalize("NFKC")
    .replace(/[　\s]+/gu, "")
    .toLowerCase();

  if (!inner) return true;
  if (
    /^(?:无限|完本|全集|校对版|校對版|出版版|epub|txt|md|番外|精校版|精修版)+$/u.test(
      inner
    )
  )
    return true;
  return false;
}

function normalizeAuthorName(author) {
  return String(author || "")
    .normalize("NFKC")
    .replace(/作者[:：]/gu, " ")
    .replace(/[　\s]+/gu, "")
    .replace(/[^\p{Script=Han}A-Za-z0-9]+/gu, "")
    .toLowerCase();
}

function loadLocalBooks(dataDir) {
  const booksDir = path.join(dataDir, "books");
  if (!fs.existsSync(booksDir)) {
    throw new Error(`books directory not found: ${booksDir}`);
  }

  const entries = fs
    .readdirSync(booksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const books = [];
  for (const entry of entries) {
    const manifestPath = path.join(booksDir, entry, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const localBookId = String(manifest.bookId || entry).trim() || entry;
      const title = String(manifest.title || localBookId).trim() || localBookId;
      const author = String(manifest.author || "").trim();

      books.push({
        bookId: localBookId,
        title,
        author,
        normalizedTitle: normalizeBookTitle(title),
        normalizedAuthor: normalizeAuthorName(author),
        normalizedBookId: normalizeBookTitle(localBookId),
        manifestPath,
      });
    } catch (error) {
      // 跳过解析失败的书
    }
  }

  return books;
}

function loadBookMap(dataDir) {
  const mapPath = path.join(dataDir, "weread-book-map.json");
  if (!fs.existsSync(mapPath)) {
    return { version: MAP_VERSION, updatedAt: "", links: [], pending: [] };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(mapPath, "utf8"));
    return {
      version: Number(parsed.version) || MAP_VERSION,
      updatedAt: parsed.updatedAt || "",
      links: Array.isArray(parsed.links) ? parsed.links : [],
      pending: Array.isArray(parsed.pending) ? parsed.pending : [],
    };
  } catch (error) {
    throw new Error(`Failed to parse weread-book-map.json: ${error.message}`);
  }
}

function saveBookMap(dataDir, bookMap) {
  const mapPath = path.join(dataDir, "weread-book-map.json");
  const nextBookMap = {
    version: MAP_VERSION,
    updatedAt: new Date().toISOString(),
    links: Array.isArray(bookMap.links) ? bookMap.links : [],
    pending: Array.isArray(bookMap.pending) ? bookMap.pending : [],
  };
  fs.writeFileSync(
    mapPath,
    JSON.stringify(nextBookMap, null, 2) + "\n",
    "utf8"
  );
  return mapPath;
}

function scoreBookMatch(input, localBook) {
  const wereadTitle = String(input.wereadTitle || "");
  const wereadAuthor = String(input.wereadAuthor || "");
  const normalizedWereadTitle = normalizeBookTitle(wereadTitle);
  const normalizedWereadAuthor = normalizeAuthorName(wereadAuthor);
  const matchedBy = [];
  let score = 0;

  if (!normalizedWereadTitle) {
    return {
      localBookId: localBook.bookId,
      localTitle: localBook.title,
      localAuthor: localBook.author,
      score: 0,
      matchedBy,
    };
  }

  if (normalizedWereadTitle === localBook.normalizedTitle) {
    score = Math.max(score, 0.9);
    matchedBy.push("normalizedTitle");
  } else if (
    normalizedWereadTitle.includes(localBook.normalizedTitle) ||
    localBook.normalizedTitle.includes(normalizedWereadTitle)
  ) {
    score = Math.max(score, 0.75);
    matchedBy.push("titleIncludes");
  }

  if (
    normalizedWereadAuthor &&
    localBook.normalizedAuthor &&
    normalizedWereadAuthor === localBook.normalizedAuthor
  ) {
    score += 0.08;
    matchedBy.push("normalizedAuthor");
  }

  if (normalizedWereadTitle === localBook.normalizedBookId) {
    score += 0.05;
    matchedBy.push("localBookId");
  }

  score = Number(Math.min(0.99, score).toFixed(2));

  return {
    localBookId: localBook.bookId,
    localTitle: localBook.title,
    localAuthor: localBook.author,
    score,
    matchedBy,
  };
}

function buildPendingKey(input) {
  const wereadBookId = String(input.wereadBookId || "").trim();
  const wereadTitle = normalizeBookTitle(input.wereadTitle || "");
  const wereadAuthor = normalizeAuthorName(input.wereadAuthor || "");

  if (wereadBookId) return `id:${wereadBookId}`;
  return `title:${wereadTitle}::author:${wereadAuthor}`;
}

function findExistingLink(links, query) {
  if (query.wereadBookId) {
    const exact = links.find(
      (link) => String(link.wereadBookId || "") === String(query.wereadBookId)
    );
    if (exact) return exact;
  }

  return (
    links.find((link) => {
      return (
        buildPendingKey(link) ===
        buildPendingKey({
          wereadBookId: query.wereadBookId,
          wereadTitle: query.normalizedWereadTitle,
          wereadAuthor: query.normalizedWereadAuthor,
        })
      );
    }) || null
  );
}

function upsertLink(bookMap, link) {
  const key = buildPendingKey(link);
  const nextLinks = [];
  let inserted = false;

  for (const item of Array.isArray(bookMap.links) ? bookMap.links : []) {
    if (buildPendingKey(item) === key) {
      nextLinks.push(link);
      inserted = true;
      continue;
    }
    nextLinks.push(item);
  }

  if (!inserted) nextLinks.push(link);
  bookMap.links = dedupeLinks(nextLinks);
}

function removePendingByKey(bookMap, key) {
  bookMap.pending = (
    Array.isArray(bookMap.pending) ? bookMap.pending : []
  ).filter((item) => buildPendingKey(item) !== key);
}

function dedupeLinks(links) {
  const map = new Map();
  for (const link of links) {
    map.set(buildPendingKey(link), link);
  }
  return Array.from(map.values());
}

/**
 * 链接微信读书和本地书籍
 */
function linkWereadBook(dataDir, args) {
  const bookMap = loadBookMap(dataDir);
  const books = loadLocalBooks(dataDir);

  const wereadTitle = String(args.wereadTitle || "").trim();
  const wereadAuthor = String(args.wereadAuthor || "").trim();
  const normalizedWereadTitle = normalizeBookTitle(wereadTitle);
  const normalizedWereadAuthor = normalizeAuthorName(wereadAuthor);
  const dedupeKey = buildPendingKey({
    wereadBookId: args.wereadBookId,
    wereadTitle,
    wereadAuthor,
  });

  // 检查已链接
  const existingLinked = findExistingLink(bookMap.links, {
    wereadBookId: args.wereadBookId,
    normalizedWereadTitle,
    normalizedWereadAuthor,
  });
  if (existingLinked && !args.confirm) {
    return { action: "linked", link: existingLinked, reused: true };
  }

  // 手动确认链接
  if (args.confirm) {
    const targetBook = books.find((book) => book.bookId === args.localBookId);
    if (!targetBook)
      throw new Error(`localBookId not found: ${args.localBookId}`);

    const matchedBy = ["manualConfirm"];
    if (
      normalizedWereadTitle &&
      normalizedWereadTitle === targetBook.normalizedTitle
    )
      matchedBy.push("normalizedTitle");
    if (
      normalizedWereadAuthor &&
      targetBook.normalizedAuthor &&
      normalizedWereadAuthor === targetBook.normalizedAuthor
    )
      matchedBy.push("normalizedAuthor");

    const link = {
      wereadBookId: String(args.wereadBookId || ""),
      wereadTitle,
      wereadAuthor,
      localBookId: targetBook.bookId,
      localTitle: targetBook.title,
      localAuthor: targetBook.author || "",
      score: 1,
      status: "linked",
      matchedBy,
      updatedAt: new Date().toISOString(),
    };

    upsertLink(bookMap, link);
    removePendingByKey(bookMap, dedupeKey);
    saveBookMap(dataDir, bookMap);

    return { action: "linked", link, reused: false };
  }

  // 自动匹配
  const scoredCandidates = books
    .map((book) => scoreBookMatch({ wereadTitle, wereadAuthor }, book))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scoredCandidates[0] || null;
  const linkThreshold =
    normalizedWereadTitle.length <= 2
      ? SHORT_TITLE_LINK_THRESHOLD
      : DEFAULT_LINK_THRESHOLD;

  if (best && best.score >= linkThreshold) {
    const targetBook = books.find((book) => book.bookId === best.localBookId);
    const link = {
      wereadBookId: args.wereadBookId || "",
      wereadTitle,
      wereadAuthor,
      localBookId: targetBook.bookId,
      localTitle: targetBook.title,
      localAuthor: targetBook.author || "",
      score: best.score,
      status: "linked",
      matchedBy: best.matchedBy,
      updatedAt: new Date().toISOString(),
    };

    upsertLink(bookMap, link);
    removePendingByKey(bookMap, dedupeKey);
    saveBookMap(dataDir, bookMap);

    return {
      action: "linked",
      link,
      candidates: scoredCandidates,
      reused: false,
    };
  }

  // 无匹配
  removePendingByKey(bookMap, dedupeKey);
  saveBookMap(dataDir, bookMap);
  return {
    action: "no-match",
    candidates: scoredCandidates.slice(0, 5),
    weread: {
      wereadBookId: args.wereadBookId || "",
      wereadTitle,
      wereadAuthor,
    },
  };
}

function normalizeMarkText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/gu, "")
    .toLocaleLowerCase();
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

function findMarkTextMatch(content, markText) {
  const exactOffset = content.indexOf(markText);
  if (exactOffset >= 0)
    return { offset: exactOffset, matchType: "exact", length: markText.length };

  const normalizedMark = normalizeMarkText(markText);
  if (!normalizedMark) return null;
  const normalizedOffset = normalizeMarkText(content).indexOf(normalizedMark);
  if (normalizedOffset < 0) return null;
  const offset = mapNormalizedOffset(content, normalizedOffset);
  return {
    offset,
    matchType: "normalized_exact",
    length: Math.max(1, markText.length),
  };
}

function snippetAround(content, offset, length, before = 100, after = 100) {
  const contextStart = Math.max(0, offset - before);
  const contextEnd = Math.min(content.length, offset + length + after);
  return content
    .substring(contextStart, contextEnd)
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * 根据微信读书划线查找本地chunk上下文
 */
function findWereadContext(dataDir, args) {
  const bookMap = loadBookMap(dataDir);
  const wereadTitle = String(args.wereadTitle || "").trim();
  const markText = String(args.markText || "").trim();

  if (!wereadTitle) throw new Error("wereadTitle is required");
  if (!markText) throw new Error("markText is required");

  // 查找链接
  const normalizedWereadTitle = normalizeBookTitle(wereadTitle);
  const link = bookMap.links.find((link) => {
    return normalizeBookTitle(link.wereadTitle || "") === normalizedWereadTitle;
  });

  if (!link) {
    return {
      found: false,
      reason: "no_link",
      wereadTitle,
      suggestion: "请先使用 reading_link_weread_book 链接微信读书和本地书籍",
    };
  }

  const localBookId = link.localBookId;
  const booksDir = path.join(dataDir, "books");
  const bookDir = path.join(booksDir, localBookId);
  const manifestPath = path.join(bookDir, "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    return { found: false, reason: "book_not_found", localBookId };
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const chunks = Array.isArray(manifest.chunks) ? manifest.chunks : [];

  // 在所有chunk中搜索划线文本
  const matches = [];
  for (const chunk of chunks) {
    const chunkPath = path.join(bookDir, chunk.path);
    if (!fs.existsSync(chunkPath)) continue;

    try {
      const content = fs.readFileSync(chunkPath, "utf8");
      const match = findMarkTextMatch(content, markText);
      if (match) {
        matches.push({
          bookId: localBookId,
          localBookId,
          chunkId: chunk.id,
          chunkTitle: chunk.title || "",
          quote: markText,
          quoteOffset: match.offset,
          offset: match.offset,
          matchType: match.matchType,
          context: snippetAround(content, match.offset, match.length),
          fullText: args.includeChunk ? content : undefined,
        });
      }
    } catch (error) {
      // 跳过无法读取的chunk
    }
  }

  if (!matches.length) {
    return { found: false, reason: "mark_not_found", localBookId, markText };
  }

  return {
    found: true,
    bookId: localBookId,
    localBookId,
    localTitle: link.localTitle,
    wereadTitle,
    markText,
    candidates: matches,
    matches,
  };
}

module.exports = {
  normalizeBookTitle,
  normalizeAuthorName,
  linkWereadBook,
  findWereadContext,
  loadBookMap,
};
