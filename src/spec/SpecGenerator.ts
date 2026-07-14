import * as cp from 'child_process';
import { LlmService } from '../ai/pipeline/LlmService';
import { ExtensionConfig } from '../config/ExtensionConfig';
import type { CollectedContext } from './ContextCollector';

function getGitUser(): string {
  try {
    return cp.execSync('git config user.name', { encoding: 'utf-8', timeout: 2000 }).trim();
  } catch {
    return 'unknown';
  }
}

const SPEC_EXTRACT_SYSTEM_PROMPT = `당신은 퍼블리셔가 제공한 HTML/TSX 소스를 분석하여 react-app-scaffold 기반의 SDD 스펙 문서를 역방향으로 생성하는 전문가입니다.

규칙:
- 주어진 파일 구조 분석 결과와 퍼블리셔 CSS 매핑 테이블을 대조하여 React 컴포넌트 구조를 추론한다
- project-config.md의 "퍼블리셔 마크업 컨벤션" 섹션이 있으면 base knowledge보다 우선 적용한다
- API 호출은 useApi(@axiom/hooks) 훅 사용을 기준으로 추론한다
- UI 컴포넌트는 @axiom/components/ui (shadcn 기반)로 매핑한다
- 불명확하거나 추론 불가능한 항목은 "## 미결정 사항" 섹션에 명시한다
- frontmatter 필수 필드: title, category, domain, screen, owner, status, tags
- status는 반드시 draft

수락 기준 규칙:
- "## 수락 기준" 섹션을 반드시 포함하고, frontmatter 바로 다음에 위치시킨다
- 파일 내용으로 추론 가능한 항목은 구체적으로 작성한다
- 다음 4가지 케이스를 빠짐없이 포함한다:
  1. 정상 상태: 데이터가 정상적으로 표시되는 케이스
  2. 로딩 상태: API 호출 중 로딩 UI
  3. 빈 상태: 데이터가 없을 때 안내
  4. 에러 상태: ApiError 처리

컴포넌트 구조 작성 규칙:
- CSS 클래스명을 css-mapping.md 테이블과 대조하여 React 컴포넌트로 매핑한다
- 매핑 불가능한 클래스는 "<!-- publisher: .클래스명 -->" 주석으로 표시한다

출력 형식: YAML frontmatter가 포함된 마크다운 스펙 문서만 반환.
다른 설명 없이 스펙 문서 단독으로 출력하세요.`;

const SPEC_SYSTEM_PROMPT = `당신은 react-app-scaffold 기반 프로젝트의 SDD 스펙 작성자입니다.

코딩 규칙:
- API: useApi(@axiom/hooks) 훅만 사용
- UI: @axiom/components/ui (shadcn 기반)
- 라우팅: createHashRouter + loadable()
- 열린 파일의 타입·구조와 일관성 유지

frontmatter 필수 필드:
  title, category(screen|component|api), domain, screen(PascalCase), owner,
  status(초기값 draft), complexity(L1|L2|L3), tags
  금융 화면 추가 필수: compliance-tags, reviewer

복잡도 등급 — complexity 필드에 반드시 명시:
  L1 (단순): 정적/단순 조회 화면      → 필수: 수락 기준 + 개요 + API + 예외 처리
  L2 (표준): 목록·상세·폼 화면        → L1 + 상태 + 이벤트
  L3 (복잡): 다중API·복합 모달·다단계 폼 → L2 + 컴포넌트 트리 + Props + 렌더 조건 + 폼(폼 화면만)

섹션 작성 규칙:

## 수락 기준 (전체 필수, frontmatter 바로 다음)
  - [ ] 체크리스트 4케이스: 정상 상태 / 로딩 상태 / 빈 상태 / 에러 상태
  파일 컨텍스트에서 추론하여 구체적으로 작성. 추론 불가 시 "TODO:" 접두사.

## 개요 (전체 필수)
  1~2줄. "무엇을 하는 화면" + "핵심 데이터 흐름".

## 컴포넌트 트리 (L3)
  들여쓰기로 계층 표현. 서브컴포넌트 파일 경로 명시. 단일 파일이면 생략.

## Props (L2+)
  TypeScript interface 형태.
  라우터 params는 useParams<{id: string}>()로 받으므로 Props 아님 — 별도 명시.
  Props 없으면 "없음 (라우트 페이지)" 으로 명시.

## 상태 (L2+)
  ### Server State (useApi): 변수명, 타입, endpoint
  ### Local State (useState): 변수명, 타입, 초기값

## 렌더 조건 (L3)
  "조건 → UI 처리" 형태. isLoading / error / empty 3단계 분기 반드시 포함.

## 이벤트 (L2+)
  ### 핸들러명(파라미터): 번호로 동작 순서 나열.
  API 호출 시점, onSuccess/onError 동작 포함.

## API (전체 필수)
  useApi<TData, TVariables>('endpoint', { method }) 시그니처 그대로.
  enabled 조건, invalidateQueries 대상 포함.
  에러 코드별 처리 명시.

## 폼 (L2+, 폼 화면만)
  zod 스키마 코드블록 + 필드별 검증 규칙 표 + submit onSuccess/onError 동작.
  수정 폼이면 values 초기화 방식도 명시.

## 예외 처리 (전체 필수)
  표 형태: 케이스 | 조건 | UI 처리 (Skeleton/EmptyState/Toast 등).
  로딩/빈값/에러 3가지 기본은 반드시 포함.

## 미결정 사항 (선택)
  - [ ] 형태. 승인 전 반드시 해소해야 한다.

출력 형식: YAML frontmatter가 포함된 마크다운 스펙 문서만 반환.
다른 설명 없이 스펙 문서 단독으로 출력하세요.`;

/**
 * ContextCollector가 수집한 3계층 컨텍스트로 스펙 마크다운을 스트리밍 생성한다.
 *
 * Recency bias 적용 (LLM은 끝부분을 더 잘 기억):
 * knowledge → .axiom/ → 활성 파일 (맨 마지막)
 */
export class SpecGenerator {
  constructor(private readonly _llm: LlmService) {}

  /** AI 서버 없을 때 intent에서 최소한의 스펙 스텁을 생성한다 */
  static generateOfflineStub(intent: string, domain: string, owner: string): string {
    const screenMatch = intent.match(/\b([A-Z][a-zA-Z]+(Page|List|Form|Detail|View|Create|Edit)?)\b/);
    const screen = screenMatch?.[1] ?? 'UnknownPage';
    const tags = [domain, screen.replace(/Page$/, '').toLowerCase()].filter(Boolean);

    return [
      '---',
      `title: ${screen} 스펙`,
      `category: screen`,
      `domain: ${domain}`,
      `screen: ${screen}`,
      `owner: ${owner}`,
      `status: draft`,
      `tags: [${tags.join(', ')}]`,
      '---',
      '',
      '## 수락 기준',
      '- [ ] TODO: 정상 상태 — 데이터가 화면에 표시된다',
      '- [ ] TODO: 로딩 상태 — API 호출 중 로딩 UI가 표시된다',
      '- [ ] TODO: 빈 상태 — 데이터가 없을 때 안내 메시지가 표시된다',
      '- [ ] TODO: 에러 상태 — ApiError 처리 및 사용자 피드백이 제공된다',
      '',
      '## 개요',
      `> ⚠️ 오프라인 모드 — AI 서버 연결 실패. 아래 내용을 직접 작성해주세요.`,
      '',
      `**요청:** ${intent}`,
      '',
      '## API',
      '- TODO: API 경로 및 메서드 작성',
      '',
      `## 컴포넌트 구조`,
      `- \`${screen}.tsx\` — src/domains/${domain}/pages/`,
      '',
      '## 예외 처리',
      '- TODO: ApiError 처리 작성',
      '',
      '## 미결정 사항',
      '- AI 서버 연결 후 `/spec` 재실행 권장',
    ].join('\n');
  }

  /** 오프라인 시 파일명 기반 최소 스텁 생성 */
  static generateOfflineStubFromFile(filePath: string, domain: string, owner: string): string {
    const fileName = filePath.split(/[/\\]/).pop() ?? 'UnknownPage';
    const screen = fileName.replace(/\.(tsx|html?|jsx)$/i, '');
    const pascalScreen = screen.charAt(0).toUpperCase() + screen.slice(1);
    const tags = [domain, screen.toLowerCase()].filter(Boolean);

    return [
      '---',
      `title: ${pascalScreen} 스펙`,
      `category: screen`,
      `domain: ${domain}`,
      `screen: ${pascalScreen}`,
      `owner: ${owner}`,
      `status: draft`,
      `tags: [${tags.join(', ')}]`,
      '---',
      '',
      '## 수락 기준',
      '- [ ] TODO: 정상 상태 — 데이터가 화면에 표시된다',
      '- [ ] TODO: 로딩 상태 — API 호출 중 로딩 UI가 표시된다',
      '- [ ] TODO: 빈 상태 — 데이터가 없을 때 안내 메시지가 표시된다',
      '- [ ] TODO: 에러 상태 — ApiError 처리 및 사용자 피드백이 제공된다',
      '',
      '## 개요',
      `> ⚠️ 오프라인 모드 — AI 서버 연결 실패. 파일: ${fileName}`,
      '',
      `## 컴포넌트 구조`,
      `- \`${pascalScreen}.tsx\` — src/domains/${domain}/pages/`,
      '  - <!-- publisher: 클래스명 매핑 직접 작성 필요 -->',
      '',
      '## API',
      '- TODO: API 경로 및 메서드 작성',
      '',
      '## 예외 처리',
      '- TODO: ApiError 처리 작성',
      '',
      '## 미결정 사항',
      '- AI 서버 연결 후 역방향 추출 재실행 권장',
    ].join('\n');
  }

  /** 퍼블리셔 파일 구조 기반 역방향 스펙 생성 */
  async *generateFromFile(
    fileStructure: string,
    ctx: CollectedContext,
    signal?: AbortSignal,
    onFallback?: (reason: string) => void,
  ): AsyncGenerator<string> {
    const config = ExtensionConfig.getEffectiveLlmConfig();

    // Recency bias: knowledge → axiomSpecs → 파일 구조 분석 (맨 마지막)
    const sections = [
      ctx.knowledgeSection,
      ctx.axiomSpecsSection,
      fileStructure,
    ].filter(Boolean);

    const contextBlock = sections.join('\n\n---\n\n');

    const userMessage = [
      `## 스펙 역방향 추출 요청\n위 파일을 분석하여 SDD 스펙 문서를 생성해주세요.`,
      ctx.domain ? `도메인: ${ctx.domain}` : '',
      `owner: ${getGitUser()}`,
      contextBlock ? `\n---\n\n${contextBlock}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    yield* this._llm.streamChat(
      [
        { role: 'system', content: SPEC_EXTRACT_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      config,
      signal,
      onFallback,
    );
  }

  async *generate(
    intent: string,
    ctx: CollectedContext,
    signal?: AbortSignal,
    onFallback?: (reason: string) => void,
  ): AsyncGenerator<string> {
    const config = ExtensionConfig.getEffectiveLlmConfig();

    // Recency bias: knowledge → axiomSpecs → activeFile
    const sections = [
      ctx.knowledgeSection,
      ctx.axiomSpecsSection,
      ctx.activeFileSection,
    ].filter(Boolean);

    const contextBlock = sections.join('\n\n---\n\n');

    const userMessage = [
      `## 스펙 생성 요청\n${intent}`,
      ctx.domain ? `도메인: ${ctx.domain}` : '',
      `owner: ${getGitUser()}`,
      contextBlock ? `\n---\n\n${contextBlock}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    yield* this._llm.streamChat(
      [
        { role: 'system', content: SPEC_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      config,
      signal,
      onFallback,
    );
  }
}
