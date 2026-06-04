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
  /** 쿼리 기준 적합도 점수 (높을수록 우선). 라우팅 보너스 등 가산이 반영될 수 있음 */
  score: number;
  /**
   * 라우팅 보너스 가산 이전의 순수 쿼리 적합도.
   * 곁가지·임베딩 섹션을 관련도 하한으로 거를 때 사용한다(score는 보너스로 부풀려질 수 있음).
   */
  rawScore: number;
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
      rawScore: 0,
    });
  }

  return sections;
}

/**
 * 사용자가 지정한 정확 경로의 섹션에 부여하는 가산점.
 *
 * 토큰 매칭(헤더 +3/개)만으로는 `/api/common-codes`와 형제 `/api/common-codes/groups`·`/:id`가
 * 모두 api·common·codes로 동점이 되어, 모델이 형제 중 엉뚱한 URL을 고르는 사고가 난다(실측).
 * 정확일치 섹션만 압도적으로 끌어올려 "사용자가 지정한 그 엔드포인트"가 1순위로 주입되게 한다.
 */
const EXACT_PATH_BONUS = 20;

/**
 * 쿼리 키워드 기준으로 섹션에 점수를 매긴다.
 *
 * 점수 산정 기준:
 * - 헤더에 키워드 등장: +3점/개 (가장 강한 신호)
 * - 본문에 키워드 등장: +1점/개 (중복 매칭은 1점 한정)
 * - 도입부(header="")는 기본 가산점 +1 (타입 정의·import 경로 등 핵심 정보)
 * - 사용자가 지정한 정확 API 경로와 헤더가 정확일치: +EXACT_PATH_BONUS (형제 하위경로는 제외)
 *
 * 매칭 키워드가 없으면 점수는 0이지만, 점수 0이라고 무조건 제외하지는 않는다.
 * (호출자가 필요에 따라 필터링)
 *
 * @param apiPaths 쿼리에서 추출한 정확 API 경로(예: `/api/common-codes`). `extractApiPaths` 결과를 넘긴다.
 */
export function scoreSections(
  sections: MdSection[],
  queryTokens: string[],
  apiPaths: string[] = [],
): void {
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

    // 사용자가 따옴표/리터럴로 박은 정확 경로 — 형제 하위경로와 분리해 압도적으로 우선
    if (apiPaths.some((p) => containsExactApiPath(section.header, p))) {
      score += EXACT_PATH_BONUS;
    }

    section.score = score;
    section.rawScore = score;
  }
}

/** 정규식 메타문자 이스케이프 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 쿼리에서 정확 API 경로 리터럴을 추출한다(예: `'/api/common-codes'`, `/api/projects/:id`).
 *
 * - 슬래시로 시작하고 첫 세그먼트가 영문, 2개 이상 세그먼트인 토큰만 경로로 본다.
 * - 바로 뒤에 `.확장자`가 오면 파일 경로(예: `/plan/api-spec.md`)로 보고 제외한다.
 *   (참조 파일 경로는 `_loadReferencedFiles`가 따로 처리하므로 여기서 잡으면 안 된다)
 */
export function extractApiPaths(query: string): string[] {
  const out = new Set<string>();
  const re = /\/[a-zA-Z][\w-]*(?:\/[\w:-]+)+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query)) !== null) {
    const end = m.index + m[0].length;
    if (/^\.[a-zA-Z]/.test(query.slice(end, end + 2))) continue; // 파일 경로(.md/.ts 등) 제외
    out.add(m[0]);
  }
  return [...out];
}

/**
 * 텍스트(섹션 헤더·본문 등)에 API 경로 `apiPath`가 **독립된 경로로** 등장하는지 판정한다.
 *
 * 형제 하위경로·상위경로의 부분일치는 false:
 *  - `/api/common-codes` 는 `GET \`/api/common-codes/groups\`` 와 매칭되지 않는다(뒤에 `/groups`).
 *  - `/common-codes`     는 `/api/common-codes` 와 매칭되지 않는다(앞에 `/api`).
 * 경로 연속 문자(`\w : / -`)가 경계에 닿으면 매칭을 거부하는 방식이다.
 */
export function containsExactApiPath(text: string, apiPath: string): boolean {
  if (!apiPath) return false;
  const re = new RegExp(`(?<![\\w:/-])${escapeRegExp(apiPath)}(?![\\w:/-])`);
  return re.test(text);
}

/**
 * 주어진 섹션 집합에서 `apiPaths` 중 헤더 정확일치 섹션이 실제로 존재하는 경로만 골라낸다.
 * 스펙에 없는 경로로 "이 경로를 쓰라"는 지시를 만들지 않기 위한 검증용.
 */
export function matchedApiPaths(sections: MdSection[], apiPaths: string[]): string[] {
  return apiPaths.filter((p) => sections.some((s) => containsExactApiPath(s.header, p)));
}

/**
 * `apiPaths` 중 주입된 스펙 텍스트 어디에도 정확 경로로 등장하지 않는 경로를 골라낸다.
 *
 * 헤더뿐 아니라 **본문 전체**를 대상으로 하므로(표·예시에만 적힌 경로는 정상 문서로 인정),
 * 진짜 "스펙에 없는 경로"만 남는다. 사용자에게 정보성 경고를 한 번 띄울 때 쓴다.
 * 빈 `specTexts`(검증 대상 없음)이면 빈 배열 — 확인 불가 시 경고하지 않는다.
 */
export function unmatchedApiPaths(specTexts: string[], apiPaths: string[]): string[] {
  if (specTexts.length === 0) return [];
  return apiPaths.filter((p) => !specTexts.some((t) => containsExactApiPath(t, p)));
}

/**
 * 사용자가 지정한 정확 엔드포인트를 모델에 명시하는 지시 블록을 만든다.
 * URL 드리프트(형제 경로로 바뀜)와 응답 구조 혼동을 동시에 차단한다.
 * 매칭 경로가 없으면 빈 문자열.
 */
export function formatExactPathDirective(paths: string[]): string {
  if (paths.length === 0) return '';
  const list = paths.map((p) => `\`${p}\``).join(', ');
  return (
    `> 🎯 사용자가 지정한 정확한 API 엔드포인트: ${list}. ` +
    `**useApi 호출의 URL 문자열을 정확히 이 경로로** 쓰고, 형제 경로(\`.../groups\`, \`.../:id\` 등)로 ` +
    `바꾸지 마세요. 응답 타입·데이터 바인딩(배열 vs 객체키 접근)도 **이 경로의 response 스키마**를 따르세요.\n\n`
  );
}

/**
 * 한국어 조사(접미) — 명사 뒤에 붙어 grep `includes()` 부분일치를 깨뜨리는 주범.
 * 예: "department를", "select도", "목록에". 길이 내림차순으로 한 번만 벗겨 어근 후보를 추가한다.
 * 형태소 분석기(사전) 없이 폐쇄망 의존성 0을 유지하기 위한 휴리스틱.
 */
const KOREAN_JOSA = [
  '으로써', '으로서', '으로', '에서', '에게', '한테', '부터', '까지', '처럼', '보다', '마다', '조차', '라도', '이나', '든지',
  '은', '는', '이', '가', '을', '를', '에', '의', '도', '로', '와', '과', '만', '나', '랑', '께',
];

/**
 * 사용자 쿼리를 매칭용 키워드 토큰으로 변환한다.
 * - 소문자화, 공백/구두점/가운뎃점(·ㆍ‧•) 기준 분할 ("재직상태·투입상태" → 둘로)
 * - 길이 2 이상만 유지 (1글자 노이즈 제거)
 * - 한국어 조사를 벗긴 어근을 **추가**(원본도 유지 — 과도 분리 방지, 남는 길이 2 이상일 때만)
 * - 중복 제거
 *
 * 조사를 벗기는 이유: locate의 grep이 `line.includes(token)` 부분일치라, 명사에 조사가 붙으면
 * ("select도", "department를") 코드 식별자에 매칭되지 않아 위치를 통째로 못 찾는다(견고성 매핑 실측).
 */
export function tokenizeQuery(query: string): string[] {
  const raw = query
    .toLowerCase()
    .split(/[\s,.\/·ㆍ‧•…()[\]{}<>"'`?!:;|+*=&^%$#@~\\-]+/)
    .filter((t) => t.length >= 2);

  const out = new Set<string>();
  for (const t of raw) {
    out.add(t);
    for (const j of KOREAN_JOSA) {
      if (t.length > j.length && t.endsWith(j)) {
        const stem = t.slice(0, -j.length);
        if (stem.length >= 2) out.add(stem); // 어근이 2글자 이상일 때만(잡음 방지)
        break; // 가장 긴 조사 하나만 벗긴다
      }
    }
  }
  return [...out];
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
 *
 * @param minRawScore 관련도 하한. rawScore가 이 값 미만인 섹션은 예산이 남아도 제외한다.
 *                    0(기본)이면 종전처럼 예산이 허락하는 한 모두 채운다.
 */
export function selectByBudget(
  sections: MdSection[],
  maxChars: number,
  minRawScore = 0,
): MdSection[] {
  const sorted = [...sections].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.length - b.length;
  });

  const selected: MdSection[] = [];
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
