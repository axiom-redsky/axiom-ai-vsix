/**
 * 쿼리 의도 ↔ JSX 구조 판정 프리미티브 (locate 게이트 + 입력품질 분석 공용).
 *
 * RegionEdit(게이트)와 RegionInputQuality(측정)가 같은 규칙으로 "쿼리가 어떤 컨트롤을 지목했나 /
 * region 루트가 큰 컨테이너인가"를 판정하도록 한 곳에 둔다. 양쪽이 갈라지면 게이트와 측정이
 * 어긋나(측정은 결함이라는데 게이트는 통과 등) 신뢰를 잃는다. 외부 의존성 0.
 */
import { tokenizeQuery } from './SectionExtractor';

/** 쿼리 토큰(한/영) → 그 컨트롤의 JSX 컴포넌트 태그. */
export const CONTROL_TAGS: Record<string, string> = {
  select: 'Select', 셀렉트: 'Select', 셀렉트박스: 'Select', 드롭다운: 'Select', 콤보박스: 'Select', 옵션: 'Select',
  input: 'Input', 인풋: 'Input', 입력: 'Input',
  button: 'Button', 버튼: 'Button',
  checkbox: 'Checkbox', 체크박스: 'Checkbox',
  switch: 'Switch', 스위치: 'Switch', 토글: 'Switch',
  textarea: 'Textarea',
  radio: 'RadioGroup', 라디오: 'RadioGroup',
};

/** region 루트가 이 태그면 "큰 컨테이너" — 특정 컨트롤 편집의 정밀 타깃이 아니다. */
export const CONTAINER_TAGS = new Set<string>([
  'table', 'Table', 'thead', 'tbody', 'tr', 'div', 'section', 'form', 'ul', 'ol', 'main', 'article',
  'Card', 'CardContent', 'CardHeader', 'TableBody',
  // 헤딩은 컨트롤 편집의 타깃이 될 수 없음 — 필터/연동 의도가 헤딩에 스냅됐으면 명백한 오타깃.
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
]);

/** 필터/정렬/연동 — 기존 데이터 소스를 건드려야 하는(=다중지점 위험) 의도. 순수 '추가'는 제외. */
export const EDIT_INTENT_RE = /필터|filter|정렬|sort|연동|반영/i;

/** 문자열에서 첫 JSX 여는 태그 이름. */
export function firstJsxTag(s: string): string | null {
  return s.match(/<([A-Za-z][A-Za-z0-9]*)/)?.[1] ?? null;
}

/**
 * `<Tag`의 출현 횟수(접두 충돌 방지: `<Select`가 `<SelectTrigger`에 안 걸리게 뒤 글자 금지).
 *
 * 대소문자 무시(`i`) — 컨트롤은 HTML intrinsic 소문자(`<button>`·`<input>`·`<select>`·`<textarea>`)나
 * 컴포넌트 대문자(shadcn `<Button>` 등) 둘 다로 쓰인다. 손으로 짠 페이지·스텁은 소문자를 쓰므로
 * 대소문자를 구분하면(`<Button`만 인식) 실재하는 컨트롤을 "없음"으로 오판한다(실측: `<button>` →
 * "Button 컨트롤이 없음"). `impliedControlTags`가 주는 태그(Button/Input/Select…)에만 쓰이므로
 * 컨테이너(table vs Table 등) 오매칭 우려는 없다. 경계(`(?![A-Za-z0-9])`)는 유지된다.
 */
export function countTag(haystack: string, tag: string): number {
  const re = new RegExp(`<${tag}(?![A-Za-z0-9])`, 'gi');
  return (haystack.match(re) ?? []).length;
}

/** 쿼리에서 함의되는 컨트롤 태그 집합(중복 제거). 토큰화가 놓치는 영문 리터럴도 직접 스캔. */
export function impliedControlTags(query: string): string[] {
  const toks = tokenizeQuery(query).map((t) => t.toLowerCase());
  const ql = query.toLowerCase();
  const tags = new Set<string>();
  for (const key in CONTROL_TAGS) {
    if (toks.includes(key) || ql.includes(key)) tags.add(CONTROL_TAGS[key]);
  }
  return [...tags];
}

/** `.map(`으로 순회하는 목록 변수명들(편집지점 판정용). */
export function mappedListVars(region: string): string[] {
  const out = new Set<string>();
  for (const m of region.matchAll(/\b([A-Za-z_$][\w$]*)\s*\.\s*map\s*\(/g)) out.add(m[1]);
  return [...out];
}

/** 인벤토리에 넣을 입력 컨트롤 태그. */
const INVENTORY_TAGS = 'Select|Input|Checkbox|Switch|RadioGroup|Textarea';
const INVENTORY_OPEN_RE = new RegExp(`<(${INVENTORY_TAGS})(?![A-Za-z0-9])`);

/**
 * region **밖**에 이미 존재하는 입력 컨트롤들의 1줄 인벤토리(B). depsHeader가 첫 return에서 잘려
 * 기존 JSX 컨트롤이 모델에 안 보이던 갭을 메운다 — 모델이 "이미 있다"를 알아 재생성(중복)하지 않게.
 *
 * 각 컨트롤: `<Select value={selectedStatus}>  // "재직상태 선택"`. region 안의 컨트롤은 이미
 * 편집 영역으로 보이므로 제외한다. 토큰을 아끼려 바인딩 state와 placeholder만 발췌한다.
 */
export function extractControlInventory(source: string, regionStartLine: number, regionEndLine: number): string {
  const lines = source.split('\n');
  const items: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(INVENTORY_OPEN_RE);
    if (!m) continue;
    const lineNo = i + 1;
    if (lineNo >= regionStartLine && lineNo <= regionEndLine) continue; // region 안은 이미 보임
    const tag = m[1];
    // 다음 컨트롤 직전(최대 16줄)까지를 이 컨트롤의 범위로 본다(value/placeholder 발췌).
    let windowEnd = Math.min(i + 16, lines.length);
    for (let j = i + 1; j < windowEnd; j++) {
      if (INVENTORY_OPEN_RE.test(lines[j])) { windowEnd = j; break; }
    }
    const look = lines.slice(i, windowEnd).join('\n');
    const value = look.match(/value=\{([^}]+)\}/)?.[1]?.trim();
    const ph = look.match(/placeholder="([^"]*)"/)?.[1];
    let line = value ? `<${tag} value={${value}}>` : `<${tag}>`;
    if (ph) line += `  // "${ph}"`;
    items.push(line);
  }
  return [...new Set(items)].join('\n');
}

/**
 * 다중지점(cross-cutting) 판정 — region 경로가 표현 못 하는 요청인가.
 *
 * 셋이 동시일 때만 true: ① 편집의도(필터/정렬/연동) ② region 루트가 큰 컨테이너
 * ③ 쿼리가 지목한 컨트롤이 region 안에 0개(= 편집 대상이 재작성 표면 밖).
 * 순수 '추가'(컨테이너에 새 컨트롤)나 컨트롤에 직접 스냅된 경우는 제외 → 양성대조 보존.
 */
export function isCrossCutting(query: string, regionRootTag: string | null, region: string): boolean {
  if (!EDIT_INTENT_RE.test(query)) return false;
  if (!regionRootTag || !CONTAINER_TAGS.has(regionRootTag)) return false;
  const controls = impliedControlTags(query);
  if (controls.length === 0) return false;
  return controls.some((tag) => countTag(region, tag) === 0);
}
