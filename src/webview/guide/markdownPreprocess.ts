// 가이드 md 전처리 — 웹뷰 전용 순수 함수. Docusaurus 문법(frontmatter·admonition·highlight 매직코멘트)을
// react-markdown이 소화할 수 있는 형태로 나눈다. (웹뷰 계층은 src/guide/* 를 import하지 않는다 — 자급자족)

export type TDocSegment =
  | { kind: 'md'; text: string }
  | { kind: 'admonition'; variant: string; title: string; body: string };

/** frontmatter 블록 제거(+title 추출). CRLF 안전. */
export function stripFrontmatter(src: string): { title: string | null; body: string } {
  const m = src.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { title: null, body: src };
  const t = m[1].match(/^title\s*:\s*(.+)$/m);
  let title = t ? t[1].trim() : null;
  if (title && ((title.startsWith("'") && title.endsWith("'")) || (title.startsWith('"') && title.endsWith('"')))) {
    title = title.slice(1, -1);
  }
  return { title, body: src.slice(m[0].length) };
}

const ADMONITION_OPEN_RE = /^(:{3,})(info|tip|note|warning|danger|caution)\s*(.*)$/;

/**
 * 최상위 admonition(`:::tip 제목 … :::`)을 분리한다. 콜론 수가 다른 중첩(`::::info` 안의 `:::tip`)은
 * body에 그대로 남기고, 렌더러가 body를 재귀 세그먼트해 처리한다. 제목의 인라인 HTML 태그는 벗긴다.
 */
export function segmentAdmonitions(md: string): TDocSegment[] {
  const lines = md.split('\n');
  const segments: TDocSegment[] = [];
  let plain: string[] = [];
  let i = 0;
  const flush = (): void => {
    if (plain.length > 0) {
      segments.push({ kind: 'md', text: plain.join('\n') });
      plain = [];
    }
  };
  while (i < lines.length) {
    const open = lines[i].match(ADMONITION_OPEN_RE);
    if (!open) {
      plain.push(lines[i]);
      i += 1;
      continue;
    }
    const fence = open[1];
    const body: string[] = [];
    let closed = false;
    let j = i + 1;
    for (; j < lines.length; j++) {
      if (lines[j].trim() === fence) {
        closed = true;
        break;
      }
      body.push(lines[j]);
    }
    if (!closed) {
      // 닫힘 없는 열림 — admonition으로 취급하지 않고 원문 그대로 둔다(문서 파손 방지)
      plain.push(lines[i]);
      i += 1;
      continue;
    }
    flush();
    segments.push({
      kind: 'admonition',
      variant: open[2],
      title: open[3].replace(/<[^>]+>/g, '').trim(),
      body: body.join('\n'),
    });
    i = j + 1;
  }
  flush();
  return segments;
}

// 코드펜스 내 Docusaurus highlight 매직코멘트 줄 제거 — `// highlight-start`, JSX 주석형(highlight-end) 등.
export function stripHighlightComments(code: string): string {
  return code
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\{?\/\*|#|<!--)\s*highlight-(start|end|next-line)\s*(\*\/\}?|-->)?\s*$/.test(line))
    .join('\n');
}

/** 현재 문서 기준 상대경로 해석 — `../assets/x.png` → 가이드 루트 기준 경로('/' 구분). */
export function resolveDocRelPath(currentDocId: string, rel: string): string {
  const base = currentDocId.split('/').slice(0, -1);
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') base.pop();
    else base.push(seg);
  }
  return base.join('/');
}

/** 헤딩 텍스트 → 앵커 id (한글 유지, 공백 → 하이픈). */
export function headingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w가-힣\s-]/g, '')
    .replace(/\s+/g, '-');
}

/** 상대 링크에서 문서 경로와 앵커 분리 + 확장자 제거. */
export function splitDocLink(href: string): { docPath: string; anchor: string | null } {
  const [p, anchor] = href.split('#');
  return { docPath: p.replace(/\.(md|mdx)$/i, ''), anchor: anchor || null };
}
