/**
 * 지식 문서(knowledge/*.md) 파싱 — **오프라인 응답 전용**.
 *
 * 온라인 RAG(`buildContext`)는 문서를 섹션으로 쪼개 어휘 점수로 줄세우지만, 오프라인은
 * 모델 토큰 예산이 없고 사람이 읽는 화면으로 직행하므로 **문서를 통째로** 다룬다.
 * 이 모듈은 frontmatter를 떼고(중복 노출 방지), 문서 종류(`kind`)를 유도해
 * [OfflineKnowledgeRetriever]가 종류별 결정론 렌더를 하게 한다.
 *
 * vscode/fs 비의존(텍스트만 입력받음) — 단위 테스트에서 그대로 호출 가능.
 */

/** 지식 문서의 표현 종류 — 오프라인 렌더·정렬 바이어스의 단일 축. */
export type KnowledgeKind =
  | 'example' // 실사용 예제(코드가 곧 답)
  | 'source' // 소스 전문
  | 'pattern' // 패턴·훅 설명(시그니처+사용법)
  | 'component' // 컴포넌트 사용법
  | 'catalog' // 목록/카탈로그/개요
  | 'reference'; // 그 외 참고 문서

const VALID_KINDS: ReadonlySet<string> = new Set<KnowledgeKind>([
  'example', 'source', 'pattern', 'component', 'catalog', 'reference',
]);

/** 파싱된 지식 문서 한 건. */
export interface KnowledgeDoc {
  /** 출처 라벨(예: "patterns/use-api-example.md"). */
  source: string;
  /** 유도/명시된 문서 종류. */
  kind: KnowledgeKind;
  /** frontmatter title 또는 첫 헤딩. */
  title: string;
  /** frontmatter를 제거한 본문 마크다운. */
  body: string;
  /** 본문에 담긴 펜스 코드블록(펜스 포함). 코드가 답인 경우 판별·렌더에 쓴다. */
  codeBlocks: string[];
}

/**
 * 앞부분 `---\n…\n---` frontmatter를 분리한다.
 * frontmatter가 없으면 전체를 본문으로 본다.
 */
export function splitFrontmatter(raw: string): { fm: Record<string, string>; body: string } {
  const m = raw.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: {}, body: raw.trim() };

  const fm: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/);
    if (kv) fm[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return { fm, body: raw.slice(m[0].length).trim() };
}

/** 본문에서 펜스(```) 코드블록을 순서대로 추출한다(펜스 포함). */
export function extractCodeBlocks(body: string): string[] {
  return body.match(/```[\s\S]*?```/g) ?? [];
}

/** 본문 첫 마크다운 헤딩 텍스트(없으면 null). */
function firstHeading(body: string): string | null {
  const m = body.match(/^#{1,3}\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

/**
 * 문서 종류를 유도한다. 우선순위:
 *   1. frontmatter `kind:` 명시(저자 오버라이드)
 *   2. 경로 프리픽스(catalog/overview)
 *   3. frontmatter `category:`
 *   4. 본문 신호("## 전체 소스" 또는 큰 코드블록) → example
 *   5. 기본 reference
 */
export function deriveKind(args: {
  source: string;
  fmKind?: string;
  fmCategory?: string;
  body: string;
  codeBlocks: string[];
}): KnowledgeKind {
  const { source, fmKind, fmCategory, body, codeBlocks } = args;

  if (fmKind && VALID_KINDS.has(fmKind)) return fmKind as KnowledgeKind;

  const s = source.toLowerCase();
  if (s.includes('catalog') || s.includes('overview')) return 'catalog';

  switch (fmCategory) {
    case 'source': return 'source';
    case 'component': return 'component';
    case 'pattern': return 'pattern';
    case 'screen': return 'example';
  }

  if (/^##\s*전체\s*소스/m.test(body) || codeBlocks.some((c) => c.length > 400)) {
    return 'example';
  }
  return 'reference';
}

/** 원시 마크다운을 KnowledgeDoc으로 파싱한다. */
export function parseKnowledgeDoc(source: string, raw: string): KnowledgeDoc {
  const { fm, body } = splitFrontmatter(raw);
  const codeBlocks = extractCodeBlocks(body);
  const kind = deriveKind({
    source,
    fmKind: fm.kind?.toLowerCase(),
    fmCategory: fm.category?.toLowerCase(),
    body,
    codeBlocks,
  });
  const title = fm.title || firstHeading(body) || source;
  return { source, kind, title, body, codeBlocks };
}
