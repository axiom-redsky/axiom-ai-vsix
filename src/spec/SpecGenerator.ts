import * as cp from 'child_process';
import { LlmService } from '../ai/LlmService';
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

규칙:
- API 호출은 반드시 useApi(@axiom/hooks) 훅만 사용
- UI 컴포넌트는 @axiom/components/ui 에서 import
- 라우팅은 createHashRouter 기반, 도메인 라우터에 loadable() 적용
- 현재 열린 파일의 타입/구조와 일관성 유지
- 미결정 사항은 "## 미결정 사항" 섹션에 명시
- frontmatter 필수 필드: title, category, domain, screen, owner, status, tags
- 금융 화면: compliance-tags, reviewer 필드 필수
- status 초기값은 반드시 draft

수락 기준 규칙:
- "## 수락 기준" 섹션을 반드시 포함하고, frontmatter 바로 다음에 위치시킨다
- 모든 항목은 - [ ] 체크리스트 형태로 작성한다
- 다음 4가지 케이스를 빠짐없이 포함한다:
  1. 정상 상태: 데이터가 정상적으로 표시되는 케이스
  2. 로딩 상태: API 호출 중 스피너·스켈레톤 등 로딩 UI
  3. 빈 상태: 데이터가 없을 때 안내 메시지·Empty UI
  4. 에러 상태: ApiError 코드별 처리 (400, 403, 500, 503 등 화면에 해당하는 것만)
- 현재 파일 컨텍스트(useApi 호출부, Props, 도메인 스펙)에서 추론하여 구체적으로 작성한다
- 추론이 어려운 항목은 "TODO:" 접두사로 명시한다

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
