import * as fs from 'fs';

/** 한 마크다운 파일에서 추출된 하나의 섹션 */
export interface MdSection {
  /** 출처 라벨 (예: "patterns/use-api.md") */
  source: string;
  /** 섹션 헤더 (예: "## 오버로드 1: Query 조회 모드"). 헤더가 없으면 빈 문자열 */
  header: string;
  /** 헤더 포함 섹션 전체 텍스트 */
  body: string;
  /** body 길이 (글자 수) */
  length: number;
  /** 쿼리 기준 적합도 점수 (높을수록 우선) */
  score: number;
}

/**
 * 마크다운 본문을 ## / ### 헤더 단위 섹션으로 분할한다.
 * 첫 헤더 이전 도입부(frontmatter + 제목)는 별도 섹션(header="")으로 보존한다.
 */
export function splitIntoSections(source: string, markdown: string): MdSection[] {
  // ## 또는 ### 헤더 앞에서 분할 (# 제목 1개는 보존)
  const parts = markdown.split(/(?=^#{2,3}\s)/m);
  const sections: MdSection[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const headerMatch = trimmed.match(/^(#{2,3})\s+(.+)$/m);
    const header = headerMatch ? headerMatch[0].trim() : '';

    sections.push({
      source,
      header,
      body: trimmed,
      length: trimmed.length,
      score: 0,
    });
  }

  return sections;
}

/**
 * 쿼리 키워드 기준으로 섹션에 점수를 매긴다.
 *
 * 점수 산정 기준:
 * - 헤더에 키워드 등장: +3점/개 (가장 강한 신호)
 * - 본문에 키워드 등장: +1점/개 (중복 매칭은 1점 한정)
 * - 도입부(header="")는 기본 가산점 +1 (타입 정의·import 경로 등 핵심 정보)
 *
 * 매칭 키워드가 없으면 점수는 0이지만, 점수 0이라고 무조건 제외하지는 않는다.
 * (호출자가 필요에 따라 필터링)
 */
export function scoreSections(sections: MdSection[], queryTokens: string[]): void {
  for (const section of sections) {
    let score = 0;
    const headerLower = section.header.toLowerCase();
    const bodyLower = section.body.toLowerCase();

    for (const token of queryTokens) {
      if (!token) continue;
      if (headerLower.includes(token)) score += 3;
      else if (bodyLower.includes(token)) score += 1;
    }

    // 도입부 섹션(헤더 없음)은 파일 타이틀·타입 정의 등 핵심 메타 정보가 많아 가산점
    if (!section.header && section.length < 1500) score += 1;

    section.score = score;
  }
}

/**
 * 사용자 쿼리를 매칭용 키워드 토큰으로 변환한다.
 * - 소문자화, 공백/구두점 기준 분할
 * - 길이 2 이상만 유지 (조사·1글자 노이즈 제거)
 * - 중복 제거
 */
export function tokenizeQuery(query: string): string[] {
  const raw = query
    .toLowerCase()
    .split(/[\s,.\/()[\]{}<>"'`?!:;|+*=&^%$#@~\\-]+/)
    .filter((t) => t.length >= 2);
  return [...new Set(raw)];
}

/**
 * 파일을 읽어 섹션 단위로 분할하고 점수를 매긴 결과를 반환한다.
 * 파일 읽기 실패 시 빈 배열을 반환한다.
 */
export function loadAndScoreSections(
  absPath: string,
  source: string,
  queryTokens: string[],
): MdSection[] {
  try {
    const content = fs.readFileSync(absPath, 'utf-8');
    const sections = splitIntoSections(source, content);
    scoreSections(sections, queryTokens);
    return sections;
  } catch {
    return [];
  }
}

/**
 * 점수 내림차순으로 섹션을 정렬하고 글자 수 예산까지 채워 반환한다.
 *
 * 예산을 초과하는 섹션은 건너뛰되, 더 작은 후속 섹션이 들어갈 수 있으면 계속 채운다.
 * 점수가 동일하면 짧은 섹션을 우선해서 다양성을 확보한다.
 */
export function selectByBudget(sections: MdSection[], maxChars: number): MdSection[] {
  const sorted = [...sections].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.length - b.length;
  });

  const selected: MdSection[] = [];
  let remaining = maxChars;
  for (const section of sorted) {
    if (section.length <= remaining) {
      selected.push(section);
      remaining -= section.length;
    }
    if (remaining <= 200) break;
  }
  return selected;
}

/**
 * 선택된 섹션 목록을 출처별로 그룹화해 시스템 프롬프트에 삽입할 문자열 목록으로 만든다.
 * 동일 파일의 여러 섹션은 한 블록으로 합치고 헤더로 묶는다.
 */
export function formatSectionsAsDocs(sections: MdSection[]): string[] {
  const grouped = new Map<string, MdSection[]>();
  for (const section of sections) {
    const list = grouped.get(section.source) ?? [];
    list.push(section);
    grouped.set(section.source, list);
  }

  const docs: string[] = [];
  for (const [source, list] of grouped) {
    const body = list.map((s) => s.body).join('\n\n');
    docs.push(`## [${source}]\n\n${body}`);
  }
  return docs;
}
