/**
 * ComponentPropsIndex — region(하이브리드) 편집 프롬프트에 "존재 기반"으로 컴포넌트 prop을 주입한다.
 *
 * 배경(왜 필요한가):
 * region 경로는 토큰 절약차 knowledge/components/*.md 를 주입하지 않는다(ScaffoldContracts 참고). 그래서
 * "선택한 SmartTable에 excel 내보내기(exportable) 추가" 같은 옵션-추가 요청이 모델에게 그 prop의 존재조차
 * 안 보여, 모델이 입력과 동일한 코드를 반환하고 "변경 없음"으로 끝났다. 이 모듈은 편집 영역에 실제로 있는
 * 컴포넌트(<SmartTable/> 등)만 골라 그 컴포넌트의 압축 prop 표를 주입해 그 공백을 메운다.
 *
 * 데이터 출처: src/ai/generated/componentPropsIndex.ts (실 scaffold types.ts에서 자동 생성 — drift 없음).
 * "고유 prop"만 담겨 있다(표준 DOM attr은 생성 단계에서 접힘) → 신호 대 잡음·토큰 모두 유리.
 */
import { COMPONENT_PROPS_INDEX, type IComponentEntry } from './generated/componentPropsIndex';

/** 한 번의 주입에서 다룰 컴포넌트 태그 상한(토큰 보호). 영역에 더 많으면 앞의 것만. */
const MAX_COMPONENTS = 3;

/**
 * 편집 영역 JSX에서 인덱스에 존재하는 컴포넌트 태그를 등장 순서로(중복 제거) 수집한다.
 * `<SmartTable ...>` · `<SmartTable/>` 등 PascalCase 여는 태그만 본다(HTML 소문자 태그 제외).
 */
export function detectComponentsInRegion(region: string): string[] {
  const seen: string[] = [];
  const re = /<([A-Z][A-Za-z0-9]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(region)) !== null) {
    const name = m[1];
    if (COMPONENT_PROPS_INDEX[name] && !seen.includes(name)) seen.push(name);
  }
  return seen;
}

/** 마크다운 표 셀 안의 파이프(`|`)를 이스케이프. 타입 문자열에 `boolean | 'x'`처럼 파이프가 흔하다. */
function escapeCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/**
 * "층 갭" 힌트 — 값이 자체 하위 DSL을 품는 prop(예: SmartTable의 `columns`)은 자동생성 prop 표가
 * 타입명(`SmartColumns<TRow>`)에서 멈춰, 그 안의 컬럼 레벨 옵션(format/badge/…)이 표에 안 보인다.
 * 실측 갭: 사용자가 "SmartTable 옵션"을 물어도 `format: 'phone'`을 표에서 못 찾았다(다른 층이라).
 * 정독용 Q&A 레퍼런스에서만 해당 행 설명에 하위 어휘를 인라인으로 덧붙여 발견성을 살린다
 * (region 편집 주입 경로는 토큰·회귀 보호차 건드리지 않는다 — dslHints=false 기본).
 */
const DSL_HINTS: { match: RegExp; note: string }[] = [
  {
    match: /SmartColumns</,
    note:
      '각 컬럼: `label` · `format` · `badge` · `align` · `aggregate` · `cell` ' +
      '(format 값: money·percent·phone·date·datetime·rrn·bizno…) — 상세는 이어지는 SmartTable 문서 참조',
  },
];

function renderComponent(
  name: string,
  entry: IComponentEntry,
  opts?: { dslHints?: boolean },
): string {
  const head = `### <${name}/> (import: \`${entry.import}\`)`;
  if (entry.props.length === 0) {
    // 순수 HTML/Radix 래퍼 — 특이 prop 없음. 표준 attr만 받는다는 사실 자체가 유용한 신호.
    return `${head}\n- 특이 prop 없음(표준 DOM 속성만 받습니다).`;
  }
  const rows = entry.props
    .map((p) => {
      let doc = p.doc || '';
      if (opts?.dslHints) {
        const hint = DSL_HINTS.find((h) => h.match.test(p.type));
        if (hint) doc = doc ? `${doc} — ${hint.note}` : hint.note;
      }
      return `| \`${escapeCell(p.name)}\`${p.required ? ' *(필수)*' : ''} | \`${escapeCell(p.type)}\` | ${escapeCell(doc)} |`;
    })
    .join('\n');
  const truncNote = entry.truncated ? `\n> (일부 prop 생략됨 — 위는 주요 항목)` : '';
  const domNote = entry.domNote ? ` className 등 표준 DOM 속성도 함께 받습니다.` : '';
  return (
    `${head}${domNote ? `\n${domNote.trim()}` : ''}\n` +
    `| prop | 타입 | 설명 |\n|---|---|---|\n${rows}${truncNote}`
  );
}

/**
 * 주어진 컴포넌트 이름들의 압축 prop 레퍼런스 마크다운 섹션을 만든다. 인덱스에 없는 이름은 무시.
 * 발동 컴포넌트가 없으면 빈 문자열(섹션 미출력 — 종전 동작과 동일).
 */
export function buildComponentPropsSection(names: string[]): string {
  const picked = names.filter((n) => COMPONENT_PROPS_INDEX[n]).slice(0, MAX_COMPONENTS);
  if (picked.length === 0) return '';
  const body = picked.map((n) => renderComponent(n, COMPONENT_PROPS_INDEX[n])).join('\n\n');
  return (
    `## 컴포넌트 prop 레퍼런스 (이 영역에 있는 컴포넌트)\n` +
    `> 아래는 편집 영역에서 실제 사용 중인 컴포넌트가 받는 prop입니다(실 scaffold 소스에서 파생). ` +
    `요청에 **필요한 prop만** 추가하고, 여기 없는 prop을 지어내지 마세요.\n${body}\n\n`
  );
}

/** 편집 영역에서 컴포넌트를 감지해 바로 섹션 문자열을 반환하는 편의 함수. */
export function buildComponentPropsSectionForRegion(region: string): string {
  return buildComponentPropsSection(detectComponentsInRegion(region));
}

/**
 * 산문(질문) 텍스트에서 인덱스에 있는 컴포넌트 이름을 단어 단위로 감지한다(등장 순서·중복 제거).
 * "Select 컴포넌트 옵션 보여줘"의 `Select` 처럼 JSX 태그가 아닌 평문 언급을 잡는다.
 * PascalCase 정확 매칭(대소문자 구분) — 흔한 영단어(select 등 소문자)의 오탐을 피한다.
 */
export function detectComponentsInText(text: string): string[] {
  const seen: string[] = [];
  for (const name of Object.keys(COMPONENT_PROPS_INDEX)) {
    if (new RegExp(`\\b${name}\\b`).test(text) && !seen.includes(name)) seen.push(name);
  }
  // 서브파트(SelectItem 등)보다 루트(Select)를 앞세우려면 이름 길이 짧은 순 우선(루트가 보통 더 짧다).
  return seen.sort((a, b) => a.length - b.length);
}

/**
 * Q&A "컴포넌트 옵션 보여줘"용 — 지목된 컴포넌트의 **전체 고유 prop** 레퍼런스 마크다운.
 * region 편집용 buildComponentPropsSection과 달리, 이건 조회 답변으로 정독하는 용도라 헤더 톤이 다르다.
 */
export function buildComponentOptionsReference(names: string[]): string {
  const picked = names.filter((n) => COMPONENT_PROPS_INDEX[n]).slice(0, MAX_COMPONENTS);
  if (picked.length === 0) return '';
  const body = picked
    .map((n) => renderComponent(n, COMPONENT_PROPS_INDEX[n], { dslHints: true }))
    .join('\n\n');
  return (
    `## 📋 컴포넌트 옵션 레퍼런스 (실 scaffold 소스에서 파생)\n` +
    `> 아래는 지목한 컴포넌트가 받는 **전체 고유 prop**입니다(className 등 표준 DOM 속성은 제외). ` +
    `사용 예시는 이어지는 문서를 참고하세요.\n${body}\n`
  );
}
