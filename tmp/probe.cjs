"use strict";

// src/ai/decompose/CodeSectionExtractor.ts
var DECL_PATTERN = /^(export\s+(?:default\s+)?)?(?:async\s+)?(function|const|let|var|class|interface|type|enum)\s+(\w+)/;
var IMPORT_PATTERN = /^import\s/;
function countDelimiters(line) {
  let open = 0;
  let close = 0;
  let inString = null;
  let inLineComment = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const prev = i > 0 ? line[i - 1] : "";
    if (inLineComment) continue;
    if (inString) {
      if (ch === inString && prev !== "\\") inString = null;
      continue;
    }
    if (ch === "/" && line[i + 1] === "/") {
      inLineComment = true;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      continue;
    }
    if (ch === "{" || ch === "[" || ch === "(") open++;
    else if (ch === "}" || ch === "]" || ch === ")") close++;
  }
  return { open, close };
}
function stripTrailingLineComment(line) {
  let inString = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const prev = i > 0 ? line[i - 1] : "";
    if (inString) {
      if (ch === inString && prev !== "\\") inString = null;
      continue;
    }
    if (ch === "/" && line[i + 1] === "/") return line.slice(0, i);
    if (ch === '"' || ch === "'" || ch === "`") inString = ch;
  }
  return line;
}
function splitTsSections(source) {
  const lines = source.split("\n");
  const sections = [];
  let importStart = null;
  let importBuffer = [];
  const flushImports = (endIdx) => {
    if (importBuffer.length === 0 || importStart === null) return;
    const body = importBuffer.join("\n");
    sections.push({
      name: "imports",
      kind: "import",
      body,
      startLine: importStart + 1,
      endLine: endIdx,
      length: body.length,
      score: 0
    });
    importBuffer = [];
    importStart = null;
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const stripped = line.trim();
    if (IMPORT_PATTERN.test(stripped)) {
      if (importStart === null) importStart = i;
      let depth2 = 0;
      let j = i;
      for (; j < lines.length; j++) {
        const { open, close } = countDelimiters(lines[j]);
        depth2 += open - close;
        importBuffer.push(lines[j]);
        const code = stripTrailingLineComment(lines[j]).trimEnd();
        if (depth2 <= 0 && (/;\s*$/.test(code) || /from\s+['"][^'"]+['"]$/.test(code))) break;
      }
      i = j + 1;
      continue;
    }
    if (importBuffer.length > 0 && stripped !== "") {
      flushImports(i);
    }
    const match = line.match(DECL_PATTERN);
    if (!match) {
      i++;
      continue;
    }
    const kindRaw = match[2];
    const name = match[3];
    let kind = "other";
    if (kindRaw === "function") kind = "function";
    else if (kindRaw === "const" || kindRaw === "let" || kindRaw === "var") kind = "const";
    else if (kindRaw === "class") kind = "class";
    else if (kindRaw === "interface") kind = "interface";
    else if (kindRaw === "type" || kindRaw === "enum") kind = "type";
    const startLine = i;
    let depth = 0;
    let opened = false;
    let endLine = i;
    for (let j = i; j < lines.length; j++) {
      const { open, close } = countDelimiters(lines[j]);
      depth += open - close;
      if (open > 0) opened = true;
      if (!opened && /[;]\s*$/.test(stripTrailingLineComment(lines[j]))) {
        endLine = j;
        break;
      }
      if (opened && depth === 0) {
        endLine = j;
        break;
      }
      endLine = j;
    }
    const body = lines.slice(startLine, endLine + 1).join("\n");
    sections.push({
      name,
      kind,
      body,
      startLine: startLine + 1,
      endLine: endLine + 1,
      length: body.length,
      score: 0
    });
    i = endLine + 1;
  }
  flushImports(lines.length);
  return sections;
}

// src/ai/decompose/SectionExtractor.ts
var KOREAN_JOSA = [
  "\uC73C\uB85C\uC368",
  "\uC73C\uB85C\uC11C",
  "\uC73C\uB85C",
  "\uC5D0\uC11C",
  "\uC5D0\uAC8C",
  "\uD55C\uD14C",
  "\uBD80\uD130",
  "\uAE4C\uC9C0",
  "\uCC98\uB7FC",
  "\uBCF4\uB2E4",
  "\uB9C8\uB2E4",
  "\uC870\uCC28",
  "\uB77C\uB3C4",
  "\uC774\uB098",
  "\uB4E0\uC9C0",
  "\uC740",
  "\uB294",
  "\uC774",
  "\uAC00",
  "\uC744",
  "\uB97C",
  "\uC5D0",
  "\uC758",
  "\uB3C4",
  "\uB85C",
  "\uC640",
  "\uACFC",
  "\uB9CC",
  "\uB098",
  "\uB791",
  "\uAED8"
];
function tokenizeQuery(query) {
  const raw = query.toLowerCase().split(/[\s,.\/·ㆍ‧•…()[\]{}<>"'`?!:;|+*=&^%$#@~\\-]+/).filter((t) => t.length >= 2);
  const out = /* @__PURE__ */ new Set();
  for (const t of raw) {
    out.add(t);
    for (const j of KOREAN_JOSA) {
      if (t.length > j.length && t.endsWith(j)) {
        const stem = t.slice(0, -j.length);
        if (stem.length >= 2) out.add(stem);
        break;
      }
    }
  }
  return [...out];
}

// src/ai/decompose/RegionIntent.ts
var CONTROL_TAGS = {
  select: "Select",
  \uC140\uB809\uD2B8: "Select",
  \uC140\uB809\uD2B8\uBC15\uC2A4: "Select",
  \uB4DC\uB86D\uB2E4\uC6B4: "Select",
  \uCF64\uBCF4\uBC15\uC2A4: "Select",
  \uC635\uC158: "Select",
  input: "Input",
  \uC778\uD48B: "Input",
  \uC785\uB825: "Input",
  button: "Button",
  \uBC84\uD2BC: "Button",
  checkbox: "Checkbox",
  \uCCB4\uD06C\uBC15\uC2A4: "Checkbox",
  switch: "Switch",
  \uC2A4\uC704\uCE58: "Switch",
  \uD1A0\uAE00: "Switch",
  textarea: "Textarea",
  radio: "RadioGroup",
  \uB77C\uB514\uC624: "RadioGroup"
};
var CONTAINER_TAGS = /* @__PURE__ */ new Set([
  "table",
  "Table",
  "thead",
  "tbody",
  "tr",
  "div",
  "section",
  "form",
  "ul",
  "ol",
  "main",
  "article",
  "Card",
  "CardContent",
  "CardHeader",
  "TableBody",
  // 헤딩은 컨트롤 편집의 타깃이 될 수 없음 — 필터/연동 의도가 헤딩에 스냅됐으면 명백한 오타깃.
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6"
]);
var EDIT_INTENT_RE = /필터|filter|정렬|sort|연동|반영/i;
function countTag(haystack, tag) {
  const re = new RegExp(`<${tag}(?![A-Za-z0-9])`, "gi");
  return (haystack.match(re) ?? []).length;
}
function impliedControlTags(query) {
  const toks = tokenizeQuery(query).map((t) => t.toLowerCase());
  const ql = query.toLowerCase();
  const tags = /* @__PURE__ */ new Set();
  for (const key in CONTROL_TAGS) {
    if (toks.includes(key) || ql.includes(key)) tags.add(CONTROL_TAGS[key]);
  }
  return [...tags];
}
function mappedListVars(region) {
  const out = /* @__PURE__ */ new Set();
  for (const m of region.matchAll(/\b([A-Za-z_$][\w$]*)\s*\.\s*map\s*\(/g)) out.add(m[1]);
  return [...out];
}
var INVENTORY_TAGS = "Select|Input|Checkbox|Switch|RadioGroup|Textarea";
var INVENTORY_OPEN_RE = new RegExp(`<(${INVENTORY_TAGS})(?![A-Za-z0-9])`);
function extractControlInventory(source, regionStartLine, regionEndLine) {
  const lines = source.split("\n");
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(INVENTORY_OPEN_RE);
    if (!m) continue;
    const lineNo = i + 1;
    if (lineNo >= regionStartLine && lineNo <= regionEndLine) continue;
    const tag = m[1];
    let windowEnd = Math.min(i + 16, lines.length);
    for (let j = i + 1; j < windowEnd; j++) {
      if (INVENTORY_OPEN_RE.test(lines[j])) {
        windowEnd = j;
        break;
      }
    }
    const look = lines.slice(i, windowEnd).join("\n");
    const value = look.match(/value=\{([^}]+)\}/)?.[1]?.trim();
    const ph = look.match(/placeholder="([^"]*)"/)?.[1];
    let line = value ? `<${tag} value={${value}}>` : `<${tag}>`;
    if (ph) line += `  // "${ph}"`;
    items.push(line);
  }
  return [...new Set(items)].join("\n");
}
function isCrossCutting(query, regionRootTag, region) {
  if (!EDIT_INTENT_RE.test(query)) return false;
  if (!regionRootTag || !CONTAINER_TAGS.has(regionRootTag)) return false;
  const controls = impliedControlTags(query);
  if (controls.length === 0) return false;
  return controls.some((tag) => countTag(region, tag) === 0);
}

// src/ai/locate/RegionEdit.ts
var LOCATE_STOP = /* @__PURE__ */ new Set(["api", "\uBC15\uC2A4", "\uC0AC\uC6A9", "\uC801\uC6A9", "\uD604\uC7AC", "\uD654\uBA74", "\uD574\uC918", "\uCD94\uAC00", "box", "\uC5D0\uC11C"]);
var QUERY_TOKEN_BRIDGE = {
  \uC140\uB809\uD2B8: ["select"],
  \uB4DC\uB86D\uB2E4\uC6B4: ["select"],
  \uCF64\uBCF4\uBC15\uC2A4: ["select"],
  \uC140\uB809\uD2B8\uBC15\uC2A4: ["select"],
  \uC635\uC158: ["select"],
  \uD14C\uC774\uBE14: ["table"],
  \uCEEC\uB7FC: ["table"],
  \uCE7C\uB7FC: ["table"],
  \uAC80\uC0C9: ["search"],
  \uBC84\uD2BC: ["button"],
  \uC785\uB825: ["input"],
  \uC778\uD48B: ["input"],
  \uD544\uD130: ["filter"],
  \uD398\uC774\uC9C0: ["page"],
  \uD398\uC774\uC9D5: ["page"],
  \uD398\uC774\uC9C0\uB124\uC774\uC158: ["page"],
  \uCCB4\uD06C\uBC15\uC2A4: ["checkbox"],
  \uB77C\uB514\uC624: ["radio"],
  \uC2A4\uC704\uCE58: ["switch"],
  \uD1A0\uAE00: ["switch"],
  \uBC43\uC9C0: ["badge"],
  \uBC30\uC9C0: ["badge"],
  \uBAA8\uB2EC: ["dialog"],
  \uB2E4\uC774\uC5BC\uB85C\uADF8: ["dialog"],
  \uC815\uB82C: ["sort"]
};
function bridgeQueryTokens(tokens) {
  const out = new Set(tokens);
  for (const t of tokens) {
    for (const key in QUERY_TOKEN_BRIDGE) {
      if (t === key || t.includes(key)) {
        for (const mapped of QUERY_TOKEN_BRIDGE[key]) out.add(mapped);
      }
    }
  }
  return [...out];
}
var DOMAIN_SUFFIXES = ["\uAD00\uB9AC", "\uD604\uD669", "\uBAA9\uB85D", "\uB9AC\uC2A4\uD2B8", "\uC774\uB825", "\uB0B4\uC5ED", "\uC815\uBCF4", "\uC0C1\uD0DC", "\uB300\uC7A5", "\uC870\uD68C", "\uB4F1\uB85D"];
function decomposeDomainCompounds(tokens) {
  const out = new Set(tokens);
  for (const t of tokens) {
    for (const suf of DOMAIN_SUFFIXES) {
      if (t.length > suf.length + 1 && t.endsWith(suf)) {
        out.add(t.slice(0, -suf.length));
        break;
      }
    }
  }
  return [...out];
}
function firstJsxTag(s) {
  return s.match(/<([A-Za-z][A-Za-z0-9]*)/)?.[1] ?? null;
}
function sectionLabelAbove(lines, fromLine1Based) {
  for (let i = fromLine1Based - 1; i >= 0 && i >= fromLine1Based - 60; i--) {
    const t = (lines[i] ?? "").trim();
    let m = t.match(/<CardTitle[^>]*>([^<{]+)<\/CardTitle>/);
    if (m && m[1].trim()) return m[1].trim();
    m = t.match(/<h[1-6][^>]*>([^<{]+)<\/h[1-6]>/);
    if (m && m[1].trim()) return m[1].trim();
    if (/(?:PageHeader|Header)/.test(t)) {
      m = t.match(/title="([^"]+)"/);
      if (m && m[1].trim()) return m[1].trim();
    }
    if (/^\{\s*\/\*/.test(t)) {
      const inner = t.replace(/^\{\s*\/\*+/, "").replace(/\*+\/\s*\}$/, "").replace(/=+/g, " ").replace(/섹션\s*\d+\s*[:：]?/g, "").trim();
      if (inner) return inner;
    }
  }
  return null;
}
function regionLabel(lines, snap) {
  const body = lines.slice(snap.startLine - 1, snap.endLine);
  const clean = (s) => s.trim().replace(/\s*\*\s*$/, "").trim();
  for (const ln of body) {
    const m = ln.match(/<label[^>]*>([^<{][^<]*)<\/label>/);
    if (m && m[1].trim()) return clean(m[1]);
  }
  for (let i = snap.startLine - 2; i >= 0 && i >= snap.startLine - 4; i--) {
    const m = (lines[i] ?? "").match(/<label[^>]*>([^<{][^<]*)<\/label>/);
    if (m && m[1].trim()) return clean(m[1]);
  }
  const sec = sectionLabelAbove(lines, snap.startLine);
  if (sec) return sec;
  for (const ln of body) {
    const m = ln.match(/>\s*([^<>{}\n][^<>{}]*?)\s*</);
    if (m && /[가-힣A-Za-z]/.test(m[1]) && m[1].trim().length > 1) return m[1].trim();
  }
  return (body[0] ?? "").trim().slice(0, 40);
}
function snapToElement(lines, bestLine) {
  const indentOf = (s) => s.match(/^[ \t]*/)?.[0].length ?? 0;
  const tagName = (s) => s.trim().match(/^<([A-Za-z][A-Za-z0-9]*)/)?.[1] ?? null;
  const findOpenAbove = (fromIdx, indent) => {
    for (let i = fromIdx - 1; i >= 0; i--) {
      const t = lines[i].trim();
      if (indentOf(lines[i]) < indent && /^<[A-Za-z]/.test(t) && !/^<\//.test(t) && !/\/>\s*$/.test(t)) return i;
    }
    return -1;
  };
  const i0 = bestLine - 1;
  if (i0 < 0 || i0 >= lines.length) return null;
  let curLine = i0;
  let curIndent = indentOf(lines[i0]);
  let result = null;
  for (let climb = 0; climb < 6; climb++) {
    const open = findOpenAbove(curLine, curIndent);
    if (open < 0) break;
    const openIndent = indentOf(lines[open]);
    let close = -1;
    for (let i = open + 1; i < lines.length; i++) {
      if (indentOf(lines[i]) === openIndent && /^<\//.test(lines[i].trim())) {
        close = i;
        break;
      }
    }
    if (close < 0) break;
    if (close - open > 120) break;
    result = { startLine: open + 1, endLine: close + 1 };
    const parent = findOpenAbove(open, openIndent);
    const parentTag = parent >= 0 ? tagName(lines[parent]) : null;
    if (parentTag && /^[A-Z]/.test(parentTag)) {
      curLine = open;
      curIndent = openIndent;
      continue;
    }
    break;
  }
  return result;
}
var TABLE_INTENT = /* @__PURE__ */ new Set(["\uD14C\uC774\uBE14", "\uCEEC\uB7FC", "\uCE7C\uB7FC", "\uADF8\uB9AC\uB4DC"]);
function locateSoleElement(lines, openRe, closeRe) {
  const indentOf = (s) => s.match(/^[ \t]*/)?.[0].length ?? 0;
  const opens = [];
  for (let i = 0; i < lines.length; i++) if (openRe.test(lines[i].trim())) opens.push(i);
  if (opens.length !== 1) return null;
  const o = opens[0];
  const ind = indentOf(lines[o]);
  for (let i = o + 1; i < lines.length; i++) {
    if (indentOf(lines[i]) === ind && closeRe.test(lines[i].trim())) {
      if (i - o > 200) return null;
      return { startLine: o + 1, endLine: i + 1 };
    }
  }
  return null;
}
function snapBlockFrom(lines, openIdx) {
  const indentOf = (s) => s.match(/^[ \t]*/)?.[0].length ?? 0;
  const t = lines[openIdx].trim();
  if (!/^<[A-Za-z]/.test(t) || /^<\//.test(t)) return null;
  if (/\/>\s*$/.test(t)) return { startLine: openIdx + 1, endLine: openIdx + 1 };
  const tag = t.match(/^<([A-Za-z][A-Za-z0-9]*)/)?.[1];
  if (tag && new RegExp(`</${tag}>`).test(t)) return { startLine: openIdx + 1, endLine: openIdx + 1 };
  const ind = indentOf(lines[openIdx]);
  for (let i = openIdx + 1; i < lines.length; i++) {
    if (indentOf(lines[i]) === ind && /^<\//.test(lines[i].trim())) {
      if (i - openIdx > 200) return null;
      return { startLine: openIdx + 1, endLine: i + 1 };
    }
  }
  return null;
}
function findTableInSection(lines, anchorLine) {
  const isSectionComment = (s) => /^\{\s*\/\*/.test(s.trim());
  let lo = 0;
  let hi = lines.length;
  for (let i = anchorLine - 2; i >= 0; i--) if (isSectionComment(lines[i])) {
    lo = i;
    break;
  }
  for (let i = anchorLine; i < lines.length; i++) if (isSectionComment(lines[i])) {
    hi = i;
    break;
  }
  let best = -1;
  let bestDist = Infinity;
  for (let i = lo; i < hi; i++) {
    if (/^<(table|Table)\b/.test(lines[i].trim())) {
      const d = Math.abs(i - (anchorLine - 1));
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
  }
  return best >= 0 ? snapBlockFrom(lines, best) : null;
}
function isContentAnchor(lineLower, token) {
  const i = lineLower.indexOf(token);
  if (i < 0) return false;
  const before = lineLower.slice(0, i);
  const inDquote = (before.split('"').length - 1) % 2 === 1;
  const inSquote = (before.split("'").length - 1) % 2 === 1;
  const noArrow = before.replace(/=>/g, "  ");
  const inJsxText = noArrow.lastIndexOf(">") > noArrow.lastIndexOf("<");
  return inDquote || inSquote || inJsxText;
}
var DEPS_PRUNE_MIN_HEADER_CHARS = 6e3;
var JS_KEYWORDS = /* @__PURE__ */ new Set([
  "const",
  "let",
  "var",
  "return",
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "break",
  "continue",
  "function",
  "new",
  "typeof",
  "instanceof",
  "void",
  "delete",
  "in",
  "of",
  "null",
  "undefined",
  "true",
  "false",
  "this",
  "async",
  "await",
  "yield",
  "import",
  "from",
  "export",
  "default",
  "as",
  "type",
  "interface",
  "extends",
  "implements",
  "public",
  "private",
  "readonly",
  "string",
  "number",
  "boolean",
  "any",
  "unknown",
  "never",
  "React"
]);
function identifiersIn(text) {
  const out = /* @__PURE__ */ new Set();
  for (const m of text.matchAll(/[A-Za-z_$][\w$]*/g)) if (!JS_KEYWORDS.has(m[0])) out.add(m[0]);
  return out;
}
function declaredNames(stmt) {
  const names = [];
  for (const m of stmt.matchAll(/\b(?:const|let|var)\s+(\[[^\]]*\]|\{[^}]*\}|[A-Za-z_$][\w$]*)/g)) {
    const decl = m[1];
    if (decl[0] === "[" || decl[0] === "{") {
      for (let part of decl.slice(1, -1).split(",")) {
        part = part.trim();
        if (decl[0] === "{" && part.includes(":")) part = part.slice(part.indexOf(":") + 1);
        const id = part.replace(/[=:].*$/s, "").replace(/^\.\.\./, "").trim();
        if (/^[A-Za-z_$][\w$]*$/.test(id)) names.push(id);
      }
    } else {
      names.push(decl);
    }
  }
  return names;
}
function braceDelta(s) {
  let d = 0;
  for (const ch of s) {
    if (ch === "(" || ch === "{" || ch === "[") d++;
    else if (ch === ")" || ch === "}" || ch === "]") d--;
  }
  return d;
}
function groupStatements(lines) {
  const stmts = [];
  let buf = [];
  let depth = 0;
  for (const line of lines) {
    buf.push(line);
    depth += braceDelta(line);
    const t = line.trim();
    if (depth <= 0 && (t.endsWith(";") || t.endsWith("}"))) {
      stmts.push(buf.join("\n"));
      buf = [];
      depth = 0;
    }
  }
  if (buf.length) stmts.push(buf.join("\n"));
  return stmts;
}
function sliceRelevantHooks(hookLines, region) {
  let bodyStart = 0;
  let d = 0;
  for (let i = 0; i < hookLines.length; i++) {
    d += braceDelta(hookLines[i]);
    if (d >= 1) {
      bodyStart = i + 1;
      break;
    }
  }
  const stmts = groupStatements(hookLines.slice(bodyStart));
  const needed = identifiersIn(region);
  for (const v of mappedListVars(region)) needed.add(v);
  const keep = /* @__PURE__ */ new Set();
  let prev = -1;
  while (keep.size !== prev) {
    prev = keep.size;
    for (let i = 0; i < stmts.length; i++) {
      if (keep.has(i)) continue;
      const decl = declaredNames(stmts[i]);
      const refs = identifiersIn(stmts[i]);
      const isEffect = /\buse[A-Z]\w*Effect\b/.test(stmts[i]);
      if (decl.some((d2) => needed.has(d2)) || isEffect && [...refs].some((r2) => needed.has(r2))) {
        keep.add(i);
        for (const r2 of refs) needed.add(r2);
        for (const d2 of decl) needed.add(d2);
      }
    }
  }
  return stmts.filter((_, i) => keep.has(i)).join("\n");
}
function selectReachableTypes(typeSecs, seedText) {
  const needed = identifiersIn(seedText);
  const keep = /* @__PURE__ */ new Set();
  let prev = -1;
  while (keep.size !== prev) {
    prev = keep.size;
    typeSecs.forEach((s, i) => {
      if (keep.has(i)) return;
      if (s.name && needed.has(s.name)) {
        keep.add(i);
        for (const r2 of identifiersIn(s.body)) needed.add(r2);
      }
    });
  }
  return typeSecs.filter((_, i) => keep.has(i)).map((s) => s.body);
}
function detectHandlerBodyOutsideRegion(query, source, startLine, endLine) {
  if (!/클릭|누르면|누를|onclick|onchange|onsubmit|onblur|onfocus|이벤트|핸들러|handler|콜백|callback/i.test(query)) {
    return null;
  }
  const lines = source.split("\n");
  const region = lines.slice(startLine - 1, endLine).join("\n");
  const refRe = /\bon[A-Z][A-Za-z]*\s*=\s*\{\s*([A-Za-z_$][\w$]*)\s*\}/g;
  const idents = /* @__PURE__ */ new Set();
  let m;
  while (m = refRe.exec(region)) idents.add(m[1]);
  if (idents.size === 0) return null;
  for (const ident of idents) {
    const esc = ident.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const declRe = new RegExp(`^\\s*(?:export\\s+)?(?:async\\s+)?(?:const|let|var|function)\\s+${esc}\\b`);
    for (let i = 0; i < lines.length; i++) {
      if (declRe.test(lines[i])) {
        const declLine = i + 1;
        if (declLine >= startLine && declLine <= endLine) return null;
        return { ident, declLine };
      }
    }
  }
  return null;
}
function locateEditRegion(source, query, forcedRegion) {
  const lines = source.split("\n");
  const baseTokens = tokenizeQuery(query).map((t) => t.toLowerCase()).filter((t) => t.length >= 2 && !LOCATE_STOP.has(t));
  const tokens = bridgeQueryTokens(decomposeDomainCompounds(baseTokens));
  const dedupeSubstrings = (arr) => arr.filter((t) => !arr.some((o) => o !== t && o.includes(t)));
  const scored = [];
  for (let i = 0; i < lines.length; i++) {
    const low = lines[i].toLowerCase();
    const hit = dedupeSubstrings(tokens.filter((t) => low.includes(t)));
    if (hit.length > 0) scored.push({ line: i + 1, score: hit.length, hit });
  }
  scored.sort((a, b) => b.score - a.score || a.line - b.line);
  const isCommentOrImport = (s) => /^\/\/|^\/\*|^\*/.test(s.trim()) || /^import\b/.test(s.trim());
  const MIN_REGION_SCORE = 2;
  let chosen = null;
  let chosenSnap = null;
  for (const cand of scored) {
    if (cand.score < MIN_REGION_SCORE) break;
    if (isCommentOrImport(lines[cand.line - 1] ?? "")) continue;
    const s = snapToElement(lines, cand.line);
    if (s) {
      chosen = cand;
      chosenSnap = s;
      break;
    }
  }
  if (tokens.some((t) => TABLE_INTENT.has(t))) {
    const tbl = locateSoleElement(lines, /^<(table|Table)\b/, /^<\/(table|Table)>/);
    if (tbl) {
      const insideTable = chosen && chosen.line >= tbl.startLine && chosen.line <= tbl.endLine;
      if (!insideTable) {
        chosen = { line: tbl.startLine, score: 1, hit: ["table"] };
        chosenSnap = tbl;
      }
    }
  }
  if (!chosen) {
    const qual = [];
    for (const cand of scored) {
      const ln = lines[cand.line - 1] ?? "";
      if (isCommentOrImport(ln)) continue;
      const low = ln.toLowerCase();
      if (!cand.hit.some((t) => isContentAnchor(low, t))) continue;
      const s = snapToElement(lines, cand.line);
      if (s) qual.push({ line: cand.line, snap: s, hit: cand.hit });
    }
    if (qual.length > 0) {
      const key = (q) => `${q.snap.startLine}-${q.snap.endLine}`;
      const k0 = key(qual[0]);
      if (qual.every((q) => key(q) === k0)) {
        chosen = { line: qual[0].line, score: Math.max(1, qual[0].hit.length), hit: qual[0].hit };
        chosenSnap = qual[0].snap;
      }
    }
  }
  if (!chosen) {
    const commentCands = scored.filter((c) => /^\{?\s*\/\*|^\/\//.test((lines[c.line - 1] ?? "").trim()));
    for (const c of commentCands) {
      let openIdx = -1;
      for (let i = c.line; i <= Math.min(c.line + 1, lines.length - 1); i++) {
        const t = (lines[i] ?? "").trim();
        if (/^<[A-Za-z]/.test(t) && !/^<\//.test(t)) {
          openIdx = i;
          break;
        }
      }
      if (openIdx < 0) continue;
      const s = snapBlockFrom(lines, openIdx);
      if (s) {
        chosen = { line: openIdx + 1, score: c.score, hit: c.hit };
        chosenSnap = s;
        break;
      }
    }
  }
  if (!chosen) {
    for (const tag of impliedControlTags(query)) {
      const openRe = new RegExp(`<${tag}(?![A-Za-z0-9])`, "i");
      const occ = [];
      for (let i = 0; i < lines.length; i++) if (openRe.test(lines[i])) occ.push(i);
      if (occ.length !== 1) continue;
      const s = snapBlockFrom(lines, occ[0]);
      if (s) {
        chosen = { line: occ[0] + 1, score: MIN_REGION_SCORE, hit: [tag.toLowerCase()] };
        chosenSnap = s;
        break;
      }
    }
  }
  if (chosen && chosenSnap && tokens.some((t) => TABLE_INTENT.has(t))) {
    const chosenTag = firstJsxTag(lines.slice(chosenSnap.startLine - 1, chosenSnap.endLine).join("\n"));
    if (chosenTag !== "table" && chosenTag !== "Table") {
      const tbl = findTableInSection(lines, chosen.line);
      if (tbl) {
        chosen = { line: tbl.startLine, score: chosen.score, hit: chosen.hit };
        chosenSnap = tbl;
      }
    }
  }
  if (forcedRegion) {
    const fLow = lines.slice(forcedRegion.startLine - 1, forcedRegion.endLine).join("\n").toLowerCase();
    const fhit = tokens.filter((t) => fLow.includes(t));
    chosen = { line: forcedRegion.startLine, score: Math.max(MIN_REGION_SCORE, fhit.length || 1), hit: fhit };
    chosenSnap = forcedRegion;
  }
  const top = scored[0] ?? null;
  const bestLine = chosen?.line ?? top?.line ?? 1;
  const bestScore = chosen?.score ?? top?.score ?? 0;
  const matched = new Set(chosen?.hit ?? top?.hit ?? []);
  const snap = chosenSnap;
  const startLine = snap ? snap.startLine : Math.max(1, bestLine - 3);
  const endLine = snap ? snap.endLine : Math.min(lines.length, bestLine + 15);
  const region = lines.slice(startLine - 1, endLine).join("\n");
  const sections = splitTsSections(source);
  const backingParts = [];
  for (const s of sections) {
    if (s.kind !== "const") continue;
    const esc = s.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${esc}\\b`).test(region)) backingParts.push(s.body);
  }
  const backingDecls = backingParts.join("\n");
  let hookLines = [];
  const comp = sections.find((s) => s.kind === "function" && /^export\s+default\b/.test(s.body.trimStart()));
  if (comp) {
    const compLines = lines.slice(comp.startLine - 1, comp.endLine);
    const retIdx = compLines.findIndex((l) => /^\s*return\s*\(/.test(l));
    hookLines = retIdx >= 0 ? compLines.slice(0, retIdx) : compLines.slice(0, 30);
  }
  const fullHookBlock = hookLines.join("\n");
  const fullParts = [];
  for (const s of sections) {
    if (s.kind === "import" || s.kind === "type" || s.kind === "interface") fullParts.push(s.body);
  }
  if (fullHookBlock) {
    fullParts.push(`// [\uCEF4\uD3EC\uB10C\uD2B8 \uC120\uC5B8\uBD80 \u2014 \uAE30\uC874 \uD6C5/state/import \uCC38\uACE0\uC6A9. \uC0C8 \uCF54\uB4DC\uAC00 \uC774\uB4E4\uACFC \uCDA9\uB3CC\xB7\uC911\uBCF5\uB418\uC9C0 \uC54A\uAC8C]
${fullHookBlock}`);
  }
  const fullDepsHeader = fullParts.join("\n\n");
  const pruneDeps = fullDepsHeader.length >= DEPS_PRUNE_MIN_HEADER_CHARS;
  let depsHeader;
  if (!pruneDeps) {
    depsHeader = fullDepsHeader;
  } else {
    const hookBlock = sliceRelevantHooks(hookLines, region);
    const leanParts = [];
    for (const s of sections) if (s.kind === "import") leanParts.push(s.body);
    const typeSecs = sections.filter((s) => s.kind === "type" || s.kind === "interface");
    leanParts.push(...selectReachableTypes(typeSecs, `${region}
${hookBlock}
${backingDecls}`));
    if (hookBlock.trim()) {
      leanParts.push(
        `// [\uCEF4\uD3EC\uB10C\uD2B8 \uC120\uC5B8\uBD80 \u2014 \uD3B8\uC9D1 \uC601\uC5ED\uC774 \uCC38\uC870\uD558\uB294 \uD6C5/state\uB9CC \uBC1C\uCDCC(\uC77D\uAE30 \uC804\uC6A9). \uC0C8 \uCF54\uB4DC\uAC00 \uC774\uB4E4\uACFC \uCDA9\uB3CC\xB7\uC911\uBCF5\uB418\uC9C0 \uC54A\uAC8C]
${hookBlock}`
      );
    }
    depsHeader = leanParts.join("\n\n");
  }
  const controlInventory = snap ? extractControlInventory(source, startLine, endLine) : "";
  const hasServerParamsFilter = EDIT_INTENT_RE.test(query) && /useApi/.test(depsHeader) && /\bparams\s*:/.test(depsHeader);
  const AMBIG_TOKEN_FREQ = 8;
  const AMBIG_TIES = 8;
  const AMBIG_SPREAD = 1e3;
  const AMBIG_DIFFUSE_COUNT = 5;
  const tokenLineFreq = (tok) => scored.reduce((n, s) => n + (s.hit.includes(tok) ? 1 : 0), 0);
  const topLines = scored.filter((s) => s.score === bestScore).map((s) => s.line);
  const spread = topLines.length > 1 ? Math.max(...topLines) - Math.min(...topLines) : 0;
  const allGeneric = !!chosen && chosen.hit.length > 0 && chosen.hit.every((t) => tokenLineFreq(t) >= AMBIG_TOKEN_FREQ);
  const genericTieAmbiguous = allGeneric && topLines.length >= AMBIG_TIES && spread >= AMBIG_SPREAD;
  const noStrongAnchor = bestScore < MIN_REGION_SCORE;
  const impliedTags = noStrongAnchor ? impliedControlTags(query) : [];
  const controlOccurrences = [];
  for (const tag of impliedTags) {
    const re = new RegExp(`<${tag}(?![A-Za-z0-9])`, "i");
    for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) controlOccurrences.push(i + 1);
  }
  const controlSpread = controlOccurrences.length > 1 ? Math.max(...controlOccurrences) - Math.min(...controlOccurrences) : 0;
  const diffuseControl = controlOccurrences.length >= AMBIG_DIFFUSE_COUNT && controlSpread >= AMBIG_SPREAD;
  const wantsTable = tokens.some((t) => TABLE_INTENT.has(t) || t === "table" || t === "grid");
  const tableOccurrences = [];
  if (!chosen && wantsTable) {
    for (let i = 0; i < lines.length; i++) if (/^<(table|Table)\b/.test(lines[i].trim())) tableOccurrences.push(i + 1);
  }
  const tableSpread = tableOccurrences.length > 1 ? Math.max(...tableOccurrences) - Math.min(...tableOccurrences) : 0;
  const diffuseTable = tableOccurrences.length >= AMBIG_DIFFUSE_COUNT && tableSpread >= AMBIG_SPREAD;
  const isAmbiguous = !forcedRegion && (genericTieAmbiguous || diffuseControl || diffuseTable);
  const ambigReason = diffuseControl ? `\uCEE8\uD2B8\uB864 <${impliedTags.join("/")}> \uAC00 \uD30C\uC77C \uC804\uBC18(${controlSpread}\uC904)\uC5D0 ${controlOccurrences.length}\uACF3 \u2014 \uC5B4\uB290 \uAC83\uC778\uC9C0 \uCFFC\uB9AC\uC5D0 \uC774\uB984\uC774 \uC5C6\uC5B4 \uBD88\uBA85\uD655 \u2192 \uB418\uBB3C\uC74C.` : diffuseTable ? `\uD14C\uC774\uBE14\uC774 \uD30C\uC77C \uC804\uBC18(${tableSpread}\uC904)\uC5D0 ${tableOccurrences.length}\uACF3 \u2014 \uC5B4\uB290 \uAD6C\uC5ED\uC758 \uD45C\uC778\uC9C0 \uCFFC\uB9AC\uC5D0 \uC774\uB984\uC774 \uC5C6\uC5B4 \uBD88\uBA85\uD655 \u2192 \uB418\uBB3C\uC74C.` : `generic \uD1A0\uD070(${chosen?.hit.join(", ")})\uB9CC\uC73C\uB85C ${topLines.length}\uAC1C \uB3D9\uC810 \uD6C4\uBCF4\uAC00 ${spread}\uC904\uC5D0 \uAC78\uCCD0 \uD769\uC5B4\uC9D0 \u2014 \uC5B4\uB290 \uC139\uC158\uC778\uC9C0 \uBD88\uBA85\uD655(\uB9E8 \uC704\uB85C \uCD94\uB77D) \u2192 \uB418\uBB3C\uC74C.`;
  const candidateLines = diffuseControl ? controlOccurrences : diffuseTable ? tableOccurrences : topLines;
  const ambiguousCandidates = [];
  if (isAmbiguous) {
    const scoreByLine = /* @__PURE__ */ new Map();
    for (const s of scored) scoreByLine.set(s.line, s.score);
    const relByLabel = /* @__PURE__ */ new Map();
    for (const ln of candidateLines) {
      if (isCommentOrImport(lines[ln - 1] ?? "")) continue;
      const label = sectionLabelAbove(lines, ln);
      if (!label) continue;
      const labelLow = label.toLowerCase();
      const labelHits = dedupeSubstrings(tokens.filter((t) => labelLow.includes(t))).length;
      const rel = labelHits * 10 + (scoreByLine.get(ln) ?? 0);
      if (!relByLabel.has(label)) ambiguousCandidates.push(label);
      relByLabel.set(label, Math.max(relByLabel.get(label) ?? 0, rel));
    }
    ambiguousCandidates.sort((a, b) => (relByLabel.get(b) ?? 0) - (relByLabel.get(a) ?? 0));
  }
  const hitLine = (lines[bestLine - 1] ?? "").trim();
  const handlerBodyTarget = snap && !forcedRegion ? detectHandlerBodyOutsideRegion(query, source, startLine, endLine) : null;
  let safety;
  if (isAmbiguous) {
    safety = { ok: false, gate: "ambiguous", reason: ambigReason };
  } else if (bestScore <= 0) {
    safety = { ok: false, gate: "anchor-missing", reason: `grep \uC810\uC218 0 \u2014 \uC9C8\uBB38 \uD1A0\uD070\uC774 \uD30C\uC77C\uC5D0 \uC5C6\uC74C(\uC575\uCEE4 \uBD80\uC7AC). splice \uC2DC ${bestLine}\uC904(\uBCF4\uD1B5 import)\uB85C \uCD94\uB77D\uD574 \uD30C\uC77C \uD30C\uC190 \uC704\uD5D8.` };
  } else if (/^\/\/|^\/\*|^\*/.test(hitLine)) {
    safety = { ok: false, gate: "anchor-comment", reason: `\uCD5C\uACE0 \uB9E4\uCE6D(${bestLine}\uC904)\uC774 \uC8FC\uC11D \u2014 \uCF54\uB4DC \uC575\uCEE4\uAC00 \uC544\uB2CC \uC6B0\uC5F0 \uC77C\uCE58.` };
  } else if (/^import\b/.test(hitLine)) {
    safety = { ok: false, gate: "anchor-import", reason: `\uCD5C\uACE0 \uB9E4\uCE6D(${bestLine}\uC904)\uC774 import \uB77C\uC778 \u2014 \uD3B8\uC9D1 \uC601\uC5ED\uC73C\uB85C \uBD80\uC801\uD569.` };
  } else if (!snap) {
    safety = { ok: false, gate: "snap-failed", reason: `\uC644\uACB0 JSX \uC694\uC18C \uC2A4\uB0C5 \uC2E4\uD328 \u2192 \xB1\uC708\uB3C4\uC6B0(${startLine}~${endLine})\uB294 \uADE0\uD615 \uBE14\uB85D\uC774 \uC544\uB2D8. \uBAA8\uB378 \uC7AC\uC791\uC131 splice \uC2DC \uAD6C\uC870 \uD30C\uC190 \uC704\uD5D8.` };
  } else if (handlerBodyTarget) {
    safety = { ok: false, gate: "handler-body", reason: `\uC774\uBCA4\uD2B8 \uD578\uB4E4\uB7EC \uB3D9\uC791 \uBCC0\uACBD \uB300\uC0C1\uC774 \uBA85\uBA85 \uD568\uC218 '${handlerBodyTarget.ident}'(${handlerBodyTarget.declLine}\uC904)\uC774\uB098 \uD3B8\uC9D1 \uC601\uC5ED(${startLine}~${endLine}) \uBC16 \u2014 region(JSX \uC694\uC18C)\uB9CC\uC73C\uB860 \uD568\uC218 \uBCF8\uBB38\uC744 \uBABB \uACE0\uCE68(\uBC14\uC778\uB529 \uC778\uB77C\uC778 \uAD50\uCCB4\uB85C \uAE30\uC874 \uD568\uC218 \uBB34\uB825\uD654 \uC704\uD5D8) \u2192 full \uD3F4\uBC31.` };
  } else if (isCrossCutting(query, firstJsxTag(region), region) && !hasServerParamsFilter) {
    safety = { ok: false, gate: "cross-cutting", reason: `\uB2E4\uC911\uC9C0\uC810 \uD3B8\uC9D1 \uC758\uB3C4(\uC11C\uBC84 params \uC5C6\uC74C) \u2014 region \uB8E8\uD2B8 <${firstJsxTag(region)}>(${startLine}~${endLine}) \uCEE8\uD14C\uC774\uB108 + \uC9C0\uBAA9 \uCEE8\uD2B8\uB864 \uC601\uC5ED \uBC16. \uB2E8\uC77C region \uD45C\uD604 \uBD88\uAC00 \u2192 full \uD3F4\uBC31.` };
  } else {
    safety = { ok: true, gate: "ok", reason: `\uCF54\uB4DC\uC904 \uC575\uCEE4(${bestLine}\uC904, \uC810\uC218 ${bestScore}) + \uC644\uACB0 JSX \uC694\uC18C \uC2A4\uB0C5(${startLine}~${endLine}) \u2014 region/hybrid \uC548\uC804.` };
  }
  const candidates = [];
  {
    const seen = /* @__PURE__ */ new Set();
    const seenLabel = /* @__PURE__ */ new Set();
    const push = (s, sc) => {
      const k = `${s.startLine}-${s.endLine}`;
      if (seen.has(k)) return;
      const label = regionLabel(lines, s);
      if (seenLabel.has(label)) return;
      seen.add(k);
      seenLabel.add(label);
      candidates.push({ startLine: s.startLine, endLine: s.endLine, label, score: sc });
    };
    if (chosenSnap) push(chosenSnap, bestScore);
    for (const cand of scored) {
      if (cand.score < 1 || candidates.length >= 6) break;
      if (isCommentOrImport(lines[cand.line - 1] ?? "")) continue;
      const s = snapToElement(lines, cand.line);
      if (s) push(s, cand.score);
    }
  }
  return { lines, bestLine, bestScore, matched: [...matched], startLine, endLine, region, depsHeader, backingDecls, controlInventory, safety, ambiguousCandidates, candidates };
}

// src/ai/apply/StructuralAnchor.ts
var STATE_HOOK = /\buse(?:State|Ref)\s*[(<]/;
var FETCH_HOOK = /\buse(?:Api\b|[A-Z]\w*(?:Query|Mutation|Fetch)\b)\s*[(<]/;
function isBlankOrComment(line) {
  const t = line.trim();
  return t === "" || t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}
function findComponentSection(sections) {
  return sections.find(
    (s) => s.kind === "function" && /^export\s+default\b/.test(s.body.trimStart())
  ) ?? null;
}
function computeComponentAnchor(section) {
  const lines = section.body.split("\n");
  const base = section.startLine;
  let depth = 0;
  let opened = false;
  let openBraceIdx = 0;
  let stmtStart = null;
  let lastStateEndIdx = null;
  let lastFetchEndIdx = null;
  let firstOtherStartIdx = null;
  let returnIdx = null;
  let bodyIndent = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const startDepth = depth;
    const { open, close } = countDelimiters(line);
    depth += open - close;
    if (!opened) {
      if (depth >= 1) {
        opened = true;
        openBraceIdx = i;
      }
      continue;
    }
    if (startDepth === 1 && stmtStart === null && !isBlankOrComment(line)) {
      stmtStart = i;
      if (!bodyIndent) bodyIndent = line.match(/^[ \t]*/)?.[0] ?? "";
    }
    if (stmtStart !== null && depth === 1) {
      const text = lines.slice(stmtStart, i + 1).join("\n");
      const firstTrimmed = lines[stmtStart].trim();
      if (/^return\b/.test(firstTrimmed)) {
        returnIdx = stmtStart;
        break;
      }
      if (FETCH_HOOK.test(text)) {
        lastFetchEndIdx = i;
      } else if (STATE_HOOK.test(text)) {
        lastStateEndIdx = i;
      } else if (firstOtherStartIdx === null) {
        firstOtherStartIdx = stmtStart;
      }
      stmtStart = null;
    }
    if (opened && depth === 0) break;
  }
  let fetchIdx0;
  let fetchReason;
  if (lastFetchEndIdx !== null) {
    fetchIdx0 = lastFetchEndIdx + 1;
    fetchReason = "after-last-fetch";
  } else if (lastStateEndIdx !== null) {
    fetchIdx0 = lastStateEndIdx + 1;
    fetchReason = "after-last-state";
  } else if (firstOtherStartIdx !== null) {
    fetchIdx0 = firstOtherStartIdx;
    fetchReason = "before-other";
  } else if (returnIdx !== null) {
    fetchIdx0 = returnIdx;
    fetchReason = "before-return";
  } else {
    fetchIdx0 = openBraceIdx + 1;
    fetchReason = "after-open-brace";
  }
  let stateIdx0;
  let stateReason;
  if (lastStateEndIdx !== null) {
    stateIdx0 = lastStateEndIdx + 1;
    stateReason = "after-last-state";
  } else {
    stateIdx0 = openBraceIdx + 1;
    stateReason = "after-open-brace";
  }
  return {
    name: section.name,
    startLine: section.startLine,
    endLine: section.endLine,
    hookInsertLine: base + fetchIdx0,
    hookInsertReason: fetchReason,
    stateInsertLine: base + stateIdx0,
    stateInsertReason: stateReason,
    bodyIndent: bodyIndent || "	"
  };
}
function parseImportLine(line) {
  const m = line.match(/^\s*import\s+(?:type\s+)?(.+?)\s+from\s*['"]([^'"]+)['"]/);
  if (!m) {
    return null;
  }
  const clause = m[1];
  const module2 = m[2];
  const named = [];
  let def = null;
  const namedMatch = clause.match(/\{([^}]*)\}/);
  if (namedMatch) {
    for (const part of namedMatch[1].split(",")) {
      const id = part.trim().split(/\s+as\s+/)[0].trim();
      if (id) named.push(id);
    }
  }
  const defMatch = clause.replace(/\{[^}]*\}/, "").replace(/,/g, "").trim();
  if (defMatch && !defMatch.startsWith("*")) def = defMatch;
  return { module: module2, named, def };
}
function computeImportAnchor(section) {
  const byModule = /* @__PURE__ */ new Map();
  const lines = section.body.split("\n");
  lines.forEach((line, idx) => {
    const parsed = parseImportLine(line);
    if (!parsed) return;
    const entry = byModule.get(parsed.module) ?? { named: /* @__PURE__ */ new Set(), def: null, lineIndex0: idx };
    if (parsed.named.length > 0 && entry.named.size === 0) entry.lineIndex0 = idx;
    for (const n of parsed.named) entry.named.add(n);
    if (parsed.def) entry.def = parsed.def;
    byModule.set(parsed.module, entry);
  });
  return { startLine: section.startLine, endLine: section.endLine, byModule };
}
function computeAnchors(source) {
  const sections = splitTsSections(source);
  const compSection = findComponentSection(sections);
  const importSection = sections.find((s) => s.kind === "import") ?? null;
  return {
    component: compSection ? computeComponentAnchor(compSection) : null,
    imports: importSection ? computeImportAnchor(importSection) : null,
    sections: sections.map((s) => ({
      name: s.name,
      kind: s.kind,
      startLine: s.startLine,
      endLine: s.endLine
    }))
  };
}

// src/ai/actions/OfflineRecipeApply.ts
function jsxInsertRange(source) {
  const comp = computeAnchors(source).component;
  if (!comp) return null;
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const end = Math.min(comp.endLine, lines.length);
  const at = (n) => (lines[n - 1] ?? "").trim();
  let searchFrom = comp.startLine + 1;
  for (let n = comp.startLine; n <= end; n++) {
    if (/\breturn\s*[(<]/.test(at(n))) {
      searchFrom = n;
      break;
    }
  }
  let rootLine = -1;
  for (let n = searchFrom; n <= end; n++) {
    if (/^(?:return\s*\(?\s*)?<[A-Za-z>]/.test(at(n))) {
      rootLine = n;
      break;
    }
  }
  if (rootLine < 0) return null;
  let openEnd = rootLine;
  while (openEnd <= end && !/>$/.test(at(openEnd))) openEnd++;
  if (openEnd > end) return null;
  if (/\/>$/.test(at(openEnd))) return null;
  let closeLine = -1;
  for (let n = end; n > openEnd; n--) {
    if (/^<\/[A-Za-z>]/.test(at(n))) {
      closeLine = n;
      break;
    }
  }
  const from = openEnd + 1;
  const to = closeLine > 0 ? closeLine : end - 1;
  return from <= to ? { from, to, rootLine } : null;
}

// scripts/_probe-locate.ts
var page = [
  "import React, { useState } from 'react';",
  "",
  "export default function EmployeePage(): React.ReactNode {",
  '  const [hireDate, setHireDate] = useState("");',
  "  return (",
  '    <div className="page">',
  "      <input value={keyword} />",
  "      <Input",
  '        type="date"',
  "        value={hireDate}",
  "        onChange={(e) => setHireDate(e.target.value)}",
  "      />",
  "    </div>",
  "  );",
  "}"
].join("\n");
var r = locateEditRegion(page, "\uC785\uC0AC\uC77C \uB0A0\uC9DC \uC785\uB825\uC744 \uB2EC\uB825\uC73C\uB85C \uBC14\uAFD4\uC918");
console.log(JSON.stringify({ best: r.bestLine, score: r.bestScore, matched: r.matched, start: r.startLine, end: r.endLine, safety: r.safety }, null, 1));
console.log("range", JSON.stringify(jsxInsertRange(page)));
