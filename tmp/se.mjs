// src/ai/SectionExtractor.ts
import * as fs from "fs";
function splitIntoSections(source, markdown) {
  const parts = markdown.split(/(?=^#{2,3}\s)/m);
  const sections = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const headerMatch = trimmed.match(/^(#{2,3})\s+(.+)$/m);
    const header = headerMatch ? headerMatch[0].trim() : "";
    sections.push({
      source,
      header,
      body: trimmed,
      length: trimmed.length,
      score: 0,
      rawScore: 0
    });
  }
  return sections;
}
var EXACT_PATH_BONUS = 20;
var SHOW_CODE_INTENT_TOKENS = ["\uC608\uC81C", "example", "\uC0D8\uD50C", "sample", "\uCF54\uB4DC", "code", "\uBCF4\uC5EC", "\uC0AC\uC6A9\uBC95", "\uC0AC\uC6A9\uC608"];
var SHOW_CODE_SECTION_BONUS = 6;
function hasShowCodeIntent(queryTokens) {
  return queryTokens.some((t) => SHOW_CODE_INTENT_TOKENS.some((s) => t.includes(s)));
}
function scoreSections(sections, queryTokens, apiPaths = []) {
  const showCode = hasShowCodeIntent(queryTokens);
  for (const section of sections) {
    let score = 0;
    const headerLower = section.header.toLowerCase();
    const bodyLower = section.body.toLowerCase();
    for (const token of queryTokens) {
      if (!token) continue;
      if (headerLower.includes(token)) score += 3;
      else if (bodyLower.includes(token)) score += 1;
    }
    if (!section.header && section.length < 1500) score += 1;
    if (apiPaths.some((p) => containsExactApiPath(section.header, p))) {
      score += EXACT_PATH_BONUS;
    }
    if (showCode && section.body.includes("```")) {
      score += SHOW_CODE_SECTION_BONUS;
    }
    section.score = score;
    section.rawScore = score;
  }
}
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function extractApiPaths(query) {
  const out = /* @__PURE__ */ new Set();
  const re = /\/[a-zA-Z][\w-]*(?:\/[\w:-]+)+/g;
  let m;
  while ((m = re.exec(query)) !== null) {
    const end = m.index + m[0].length;
    if (/^\.[a-zA-Z]/.test(query.slice(end, end + 2))) continue;
    out.add(m[0]);
  }
  return [...out];
}
function containsExactApiPath(text, apiPath) {
  if (!apiPath) return false;
  const re = new RegExp(`(?<![\\w:/-])${escapeRegExp(apiPath)}(?![\\w:/-])`);
  return re.test(text);
}
function matchedApiPaths(sections, apiPaths) {
  return apiPaths.filter((p) => sections.some((s) => containsExactApiPath(s.header, p)));
}
function unmatchedApiPaths(specTexts, apiPaths) {
  if (specTexts.length === 0) return [];
  return apiPaths.filter((p) => !specTexts.some((t) => containsExactApiPath(t, p)));
}
function formatExactPathDirective(paths) {
  if (paths.length === 0) return "";
  const list = paths.map((p) => `\`${p}\``).join(", ");
  return `> \u{1F3AF} \uC0AC\uC6A9\uC790\uAC00 \uC9C0\uC815\uD55C \uC815\uD655\uD55C API \uC5D4\uB4DC\uD3EC\uC778\uD2B8: ${list}. **useApi \uD638\uCD9C\uC758 URL \uBB38\uC790\uC5F4\uC744 \uC815\uD655\uD788 \uC774 \uACBD\uB85C\uB85C** \uC4F0\uACE0, \uD615\uC81C \uACBD\uB85C(\`.../groups\`, \`.../:id\` \uB4F1)\uB85C \uBC14\uAFB8\uC9C0 \uB9C8\uC138\uC694. \uC751\uB2F5 \uD0C0\uC785\xB7\uB370\uC774\uD130 \uBC14\uC778\uB529(\uBC30\uC5F4 vs \uAC1D\uCCB4\uD0A4 \uC811\uADFC)\uB3C4 **\uC774 \uACBD\uB85C\uC758 response \uC2A4\uD0A4\uB9C8**\uB97C \uB530\uB974\uC138\uC694.

`;
}
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
function loadAndScoreSections(absPath, source, queryTokens) {
  try {
    const content = fs.readFileSync(absPath, "utf-8");
    const sections = splitIntoSections(source, content);
    scoreSections(sections, queryTokens);
    return sections;
  } catch {
    return [];
  }
}
function selectByBudget(sections, maxChars, minRawScore = 0) {
  const sorted = [...sections].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.length - b.length;
  });
  const selected = [];
  let remaining = maxChars;
  for (const section of sorted) {
    if (section.rawScore < minRawScore) continue;
    if (section.length <= remaining) {
      selected.push(section);
      remaining -= section.length;
    }
    if (remaining <= 200) break;
  }
  return selected;
}
function formatSectionsAsDocs(sections) {
  const grouped = /* @__PURE__ */ new Map();
  for (const section of sections) {
    const list = grouped.get(section.source) ?? [];
    list.push(section);
    grouped.set(section.source, list);
  }
  const docs = [];
  for (const [source, list] of grouped) {
    const body = list.map((s) => s.body).join("\n\n");
    docs.push(`## [${source}]

${body}`);
  }
  return docs;
}
export {
  containsExactApiPath,
  extractApiPaths,
  formatExactPathDirective,
  formatSectionsAsDocs,
  hasShowCodeIntent,
  loadAndScoreSections,
  matchedApiPaths,
  scoreSections,
  selectByBudget,
  splitIntoSections,
  tokenizeQuery,
  unmatchedApiPaths
};
