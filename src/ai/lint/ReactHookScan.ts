/**
 * 모듈 스코프 훅 호출 스캐너 — **순수 모듈**(vscode·디스크 비의존).
 *
 * 원래 `FileCreatorService.detectModuleScopeHookViolation` 안에 있던 탐지 로직을 여기로 끌어냈다.
 * 이유: 같은 규칙을 두 곳이 본다.
 *  - **쓰기 전 게이트**(FileCreatorService) — 모델 산출물을 파일에 반영하기 전 거부
 *  - **Scaffold 린트**(ScaffoldLint → VSCode Diagnostics) — 사람이 쓴 코드에도 같은 판정을 노출
 * 탐지기가 두 벌이 되면 "AI가 만들면 막히는데 손으로 쓰면 안 잡힌다"는 비대칭이 생긴다.
 *
 * 게이트는 첫 위반 하나만 필요했지만 린트는 **전부** 필요하므로, 여기서는 목록을 돌려주고
 * 게이트 쪽이 첫 항목만 문자열로 포장한다(메시지 형식은 종전 그대로 유지 — `test:react-rules`가 게이트).
 */

/** 모듈 최상위에서 호출된 훅 한 건. `line`/`column`은 0-based(vscode.Position과 동일). */
export interface IModuleScopeHookCall {
  /** 훅 이름(예: `useApi`). */
  hookName: string;
  /** 훅 호출 토큰이 있는 줄(0-based). 여러 줄 구조분해면 `} = useApi(` 가 있는 줄. */
  line: number;
  /** 그 줄에서 훅 이름이 시작하는 열(0-based). */
  column: number;
  /** 훅 이름이 끝나는 열(0-based, exclusive). */
  endColumn: number;
  /** 위반 문장이 시작하는 줄(0-based) — 선언 첫 줄. */
  statementLine: number;
}

/** 맨 앞이 곧바로 훅 호출인 문장(예: 모듈 스코프 `useEffect(() => …)`). */
const BARE_HOOK = /^(?:await\s+)?(use[A-Z]\w*)\s*(?:<[^()]*>)?\s*\(/;
/** RHS **머리**가 곧바로 훅 호출인지(대입 `=` 바로 다음 토큰이 `useXxx(`). 화살표/함수 RHS는 비대상. */
const RHS_HOOK = /^(?:await\s+)?(use[A-Z]\w*)\s*(?:<[^()]*>)?\s*\(/;

/**
 * 모듈 스코프 선언/훅 **문장 전체 텍스트**(joined)에서 모듈 스코프 훅 호출이면 훅 이름을, 아니면 null.
 *
 * 핵심: binding 이 여러 줄 구조분해(`const {⏎ … ⏎} = useApi(`)여도 잡되, 대입 `=` **직후**(RHS 머리)가
 * 훅일 때만 본다 — 화살표/함수 컴포넌트(`const X = () => { … useState() }`)의 본문 훅을 오탐하지 않도록.
 * (종전엔 훅 호출이 있는 줄의 depthBefore 만 봐서, 구조분해 `{` 가 depth 를 올려 모듈 스코프 useApi 가
 *  탐지를 통째로 빠져나갔다 — 캡쳐 실패의 루트 원인.)
 */
function moduleHookName(joined: string): string | null {
  const bare = joined.match(BARE_HOOK);
  if (bare) return bare[1];
  const decl = joined.match(/^(?:export\s+)?(?:const|let|var)\s+/);
  if (!decl) return null;
  let rest = joined.slice(decl[0].length);
  // 1) binding 패턴 건너뛰기: 구조분해면 매칭 닫힘까지, 아니면 식별자(+타입)
  if (rest[0] === '{' || rest[0] === '[') {
    let d = 0;
    let k = 0;
    for (; k < rest.length; k++) {
      const ch = rest[k];
      if (ch === '{' || ch === '[' || ch === '(') d++;
      else if (ch === '}' || ch === ']' || ch === ')') {
        d--;
        if (d === 0) { k++; break; }
      }
    }
    rest = rest.slice(k);
  }
  // 2) 대입 `=`(==·=>·<=·>=·!= 제외) 를 bracket depth 0 에서 찾는다(타입의 `=>` 등 skip).
  let d = 0;
  let eq = -1;
  for (let k = 0; k < rest.length; k++) {
    const ch = rest[k];
    if (ch === '{' || ch === '[' || ch === '(' || ch === '<') d++;
    else if (ch === '}' || ch === ']' || ch === ')' || ch === '>') d--;
    else if (
      d <= 0 && ch === '=' &&
      rest[k + 1] !== '=' && rest[k + 1] !== '>' &&
      rest[k - 1] !== '=' && rest[k - 1] !== '!' && rest[k - 1] !== '<' && rest[k - 1] !== '>'
    ) { eq = k; break; }
  }
  if (eq === -1) return null;
  const rhs = rest.slice(eq + 1).trimStart();
  const m = rhs.match(RHS_HOOK);
  return m ? m[1] : null;
}

const isSkippable = (t: string): boolean =>
  t === '' ||
  t.startsWith('import ') ||
  t.startsWith('//') ||
  t.startsWith('/*') ||
  t.startsWith('*') ||
  t.startsWith('type ') ||
  t.startsWith('export type ') ||
  t.startsWith('interface ') ||
  t.startsWith('export interface ');

/** 커스텀 훅 정의(`function useXxx` / `const useXxx =`)는 호출이 아님. */
const isHookDef = (t: string): boolean =>
  /^(?:export\s+)?(?:default\s+)?function\s+use[A-Z]/.test(t) ||
  /^(?:export\s+)?const\s+use[A-Z]\w*\s*=/.test(t);

const countBraces = (s: string): number => {
  let d = 0;
  for (const ch of s) {
    if (ch === '{') d++;
    else if (ch === '}') d--;
  }
  return d;
};

/**
 * 모듈 최상위(컴포넌트 함수 밖)에서 호출된 `use*` 훅을 **전부** 찾는다.
 * React Rules of Hooks 위반이자 scaffold `useApi` 계약(knowledge/patterns/use-api.md §호출 위치 규칙) 위반이며,
 * 런타임 즉시 크래시라 타입 검사로는 잡히지 않는다.
 */
export function findModuleScopeHookCalls(code: string): IModuleScopeHookCall[] {
  const lines = code.split('\n');
  const hits: IModuleScopeHookCall[] = [];

  let braceDepth = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (isSkippable(trimmed) || isHookDef(trimmed)) {
      braceDepth += countBraces(line);
      i++;
      continue;
    }

    // 모듈 최상위(depth0)에서 시작하는 선언/훅 문장만 모듈 스코프 후보다.
    if (braceDepth === 0) {
      const startsDecl = /^(?:export\s+)?(?:const|let|var)\s/.test(trimmed);
      const startsBareHook = BARE_HOOK.test(trimmed);
      if (startsDecl || startsBareHook) {
        // 문장이 균형을 이루는 끝줄까지 합쳐(괄호·중괄호·대괄호 모두) 한 텍스트로 검사한다.
        let bal = 0;
        let end = i;
        let joined = '';
        for (let j = i; j < lines.length && j < i + 80; j++) {
          joined += (j > i ? ' ' : '') + lines[j].trim();
          for (const ch of lines[j]) {
            if (ch === '(' || ch === '[' || ch === '{') bal++;
            else if (ch === ')' || ch === ']' || ch === '}') bal--;
          }
          end = j;
          if (bal <= 0) break;
        }
        const hookName = moduleHookName(joined);
        if (hookName) {
          // 스퀴글은 훅 이름 위에 — 여러 줄 구조분해면 `} = useApi(` 가 있는 줄을 찾는다.
          let hookLine = i;
          let hookCol = -1;
          for (let j = i; j <= end; j++) {
            const at = lines[j].indexOf(hookName);
            if (at >= 0) { hookLine = j; hookCol = at; break; }
          }
          if (hookCol < 0) hookCol = line.length - line.trimStart().length;
          hits.push({
            hookName,
            line: hookLine,
            column: hookCol,
            endColumn: hookCol + hookName.length,
            statementLine: i,
          });
        }
        // 훅이든 아니든 합쳐 읽은 만큼 depth 를 갱신하고 그 다음 줄로 건너뛴다.
        for (let j = i; j <= end; j++) braceDepth += countBraces(lines[j]);
        i = end + 1;
        continue;
      }
    }

    // 그 외(함수/컴포넌트 선언, depth>0 본문 등)는 brace 만 갱신하고 한 줄 진행.
    braceDepth += countBraces(line);
    i++;
  }

  return hits;
}
