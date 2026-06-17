/* C4 smoke seeding: import a deterministic markdown book into the ISOLATED sidecar
   and create one user note whose quote overlaps the find term (coexistence test). */
const BASE = process.env.C4_BASE || "http://127.0.0.1:8897";

function fillerParagraph(seed, index) {
  const lines = [
    `读书这件事在第${seed}章的第${index}段里慢慢展开，纸页的纹理像潮水一样推着句子往前走。`,
    `我们沿着叙述者留下的标记继续行进，影子的形状随灯光改变，但论证的骨架保持稳定。`,
    `每一个比喻都在测试读者的耐心，每一次转折都把上一段的结论重新称量一遍。`,
    `如果把章节摊开成地图，这一段是平原，适合放慢速度，确认自己没有跳读。`,
  ];
  return lines.join("");
}

function section(no, title, extras = [], paragraphs = 7) {
  const body = [];
  for (let i = 1; i <= paragraphs; i += 1) body.push(fillerParagraph(no, i));
  // extras: { at: 段序, text: 整段替换/追加文本 }
  for (const extra of extras) body.splice(extra.at, 0, extra.text);
  return `# ${title}\n\n${body.join("\n\n")}`;
}

function buildMarkdown() {
  const parts = [];
  parts.push(section(1, "第一章 回声的入口", [
    { at: 1, text: "回声迷宫的回廊里藏着读书人的脚印。这一句是被注释的句子，旁边应当出现虚线。" },
    { at: 3, text: "有人说回声迷宫只是隐喻，但隐喻也有自己的承重墙。" },
    { at: 5, text: "走出回声迷宫之前，先把来路画在书页边缘。" },
  ]));
  // 第二章拉长到 ~3600+ 字，maxChars=2000 时切成两个 chunk，做“计划本章”的多段范围。
  parts.push(section(2, "第二章 双段长卷", [
    { at: 2, text: "长卷的上半部分提到回声迷宫的另一个出口，它在装订线附近。" },
    { at: 9, text: "长卷的下半部分再次提到回声迷宫，作为对上半部分的回应。" },
  ], 16));
  parts.push(section(3, "第三章 平原行记"));
  parts.push(section(4, "第四章 桥与渡口"));
  parts.push(section(5, "第五章 灯下校勘"));
  parts.push(section(6, "第六章 旁注的重量"));
  parts.push(section(7, "第七章 章法与呼吸"));
  parts.push(section(8, "第八章 暗线收束"));
  parts.push(section(9, "第九章 深井", [
    { at: 4, text: "井底沉着一把深井之钥，只有读到这里的人才会捞起它。" },
  ]));
  parts.push(section(10, "第十章 合卷"));
  return parts.join("\n\n");
}

async function call(path, payload) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === "error") {
    throw new Error(`${path} -> HTTP ${res.status}: ${JSON.stringify(data).slice(0, 400)}`);
  }
  return data;
}

(async () => {
  const markdown = buildMarkdown();
  const imported = await call("/api/command", {
    command: "import_file",
    filename: "c4-echo-maze.md",
    dataBase64: Buffer.from(markdown, "utf8").toString("base64"),
    format: "md",
    bookId: "c4-echo-maze",
    title: "回声迷宫读本",
    author: "C4 联测",
    maxChars: 2000,
    headingRegex: "^#\\s+(.+)$",
    overwrite: true,
  });
  const book = imported.data?.book || imported.data || {};
  console.log("imported:", JSON.stringify({
    bookId: book.bookId, chunkCount: book.chunkCount ?? book.chunks?.length,
  }));

  const chunks = (await call("/api/command", { command: "list_chunks", bookId: "c4-echo-maze" })).data || [];
  console.log("chunks:", chunks.map((c) => `${c.id}:${c.sectionIndex}:${(c.title || "").slice(0, 14)}`).join(" | "));

  // 评注虚线与查找共存：给第一章里含“回声迷宫”的句子建一条笔记。
  const note = await call("/api/command", {
    command: "user_note_create",
    bookId: "c4-echo-maze",
    chunkId: chunks[0]?.id || "ch00",
    quote: "回声迷宫的回廊里藏着读书人的脚印。这一句是被注释的句子，旁边应当出现虚线。",
    quoteOffset: null,
    note: "C4 共存联测：这条笔记的引用句同时包含查找词。",
    kind: "note",
    status: "open",
    tags: ["co-reading", "sidecar", "user-note"],
  });
  console.log("note:", JSON.stringify({ id: note.data?.note?.id || note.data?.id }));
  console.log("SEED OK");
})().catch((error) => {
  console.error("SEED FAIL:", error.message || error);
  process.exit(1);
});
