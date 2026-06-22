import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ExtensionConfig } from '../config/ExtensionConfig';
import { HybridRagEngine } from './HybridRagEngine';
import { ExternalCorpusLoader } from './ExternalCorpusLoader';
import type { ExternalCorpus } from './ExternalCorpusLoader';
import type { EditorContext } from './EditorContextCollector';
import type { ContextBreakdown } from '../types/messages';
import { extractRelevantTsSlice } from './CodeSectionExtractor';
import { tokenizeQuery } from './SectionExtractor';
import { OfflineKnowledgeRetriever } from './OfflineKnowledgeRetriever';
import type { IntentResult } from './IntentClassifier';
import { scanLibraryVersions } from './PackageVersionScanner';
import {
  isSmalltalk as signalIsSmalltalk,
  isQnAQuery as signalIsQnAQuery,
  isExplicitEditOrCreate as signalIsExplicitEditOrCreate,
  extractDomainFromQuery as signalExtractDomainFromQuery,
} from './IntentSignals';

/** 코드 슬라이싱 적용 대상 언어 ID */
const SLICEABLE_LANGUAGES = new Set(['typescript', 'typescriptreact', 'javascript', 'javascriptreact']);

/** 슬라이싱 결과 글자 수 상한 — 파일이 이보다 작으면 그대로, 크면 함수 단위 필터링 */
const FILE_SLICE_BUDGET = 3000;

interface DomainContext {
  domainName: string | null;
  domainExists: boolean;
  /** 도메인이 존재할 때: 기존 도메인 라우터 파일 내용 */
  domainRouterContent: string | null;
  /** 신규 도메인일 때: 현재 루트 라우터 파일 내용 */
  rootRouterContent: string | null;
  /** true이면 현재 열린 파일 경로에서 도메인을 추출한 경우 → 현재 파일 수정 시나리오(C) */
  isCurrentFileContext: boolean;
}

export class ScaffoldContextBuilder {
  private readonly _engine = new HybridRagEngine();
  private _ragDir: string | null | undefined = undefined; // undefined = 아직 탐색 전
  /** buildSystemPrompt 가장 최근 호출의 구성 요소별 글자 수 */
  private _lastBreakdown: ContextBreakdown = {
    rulesChars: 0, fileChars: 0, ragChars: 0, sddChars: 0, domainChars: 0,
  };
  private readonly _libraryVersions: string;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly _outputChannel?: vscode.OutputChannel
  ) {
    this._libraryVersions = scanLibraryVersions();
  }

  /** 가장 최근 buildSystemPrompt 호출의 컨텍스트 구성 요소별 글자 수를 반환한다. */
  lastBreakdown(): ContextBreakdown {
    return this._lastBreakdown;
  }

  /**
   * knowledge/ 디렉터리를 확인하고 HybridRagEngine을 초기화한다.
   * activate 시점에 호출하면 첫 채팅 전에 임베딩 인덱스가 준비된다.
   */
  startIndexBuild(): void {
    const dir = this._getRagDir();
    if (!dir) return;

    const { folder, files } = ExtensionConfig.getUserRagSources();
    const extraDirs = folder ? [folder] : [];
    const externalCorpora = this._loadExternalCorpora(folder);

    // .axiom/knowledge/ 자동 감지 — userRagFolder 와 중복되지 않는 경우에만 추가
    const axiomKnowledge = this._getAxiomKnowledgeDir();
    if (axiomKnowledge && axiomKnowledge !== folder && this._outputChannel) {
      extraDirs.push(axiomKnowledge);
      const loader = new ExternalCorpusLoader(this._outputChannel);
      externalCorpora.push(loader.load(axiomKnowledge));
    }

    this._engine.initialize(dir, extraDirs, files, externalCorpora);
  }

  /**
   * 이미 초기화된 로컬 RAG 엔진으로 쿼리 관련 scaffold 문서 섹션을 검색한다(LLM 불필요).
   * 오프라인 응답기(OfflineResponder)가 knowledge/*.md 의 useApi·유틸·라이브러리 등 상세 지식을
   * 끌어오는 데 쓴다. filePath/fileContent가 비어도 동작한다(쿼리만으로 검색).
   * 엔진 미초기화·오류 시 빈 배열을 돌려 호출부가 폴백하도록 한다.
   */
  async retrieveScaffoldDocs(userQuery: string, filePath = '', fileContent = ''): Promise<string[]> {
    try {
      // 오프라인 응답은 임베딩 폴백을 끈다 — 키워드/파일컨텍스트 정밀 라우팅만 사용해
      // 저관련 임베딩 청크(엉뚱한 지식) 노이즈를 차단한다. 정밀 라우팅이 비면 빈 배열.
      const ctx = await this._engine.buildContext(userQuery, filePath, fileContent, undefined, { skipEmbedding: true });
      return ctx.docs;
    } catch (err) {
      console.warn(`[Axiom AI] retrieveScaffoldDocs 실패: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * **오프라인 전용** 지식 검색. `retrieveScaffoldDocs`(온라인 공유 `buildContext`)와 달리,
   * 의미(로컬 임베딩)+키워드로 **문서를 통째로** 찾아 종류별로 렌더한다 — 어휘 점수 보정 상수·
   * 예산 chopping 없이. 온라인 경로(`buildSystemPrompt`)는 이 메서드를 호출하지 않는다.
   * 엔진 미초기화·오류 시 빈 배열을 돌려 호출부가 폴백하도록 한다.
   */
  async retrieveOfflineKnowledge(query: string, intent: IntentResult, fileContent = ''): Promise<string[]> {
    try {
      const ragDir = this._getRagDir();
      if (!ragDir) return [];
      const retriever = new OfflineKnowledgeRetriever({
        keywordSources: (q) => this._engine.offlineKeywordSources(q),
        semanticScores: (q) => this._engine.offlineSemanticScores(q),
        fileContextSources: (content) => this._engine.offlineFileContextSources(content),
        loadDoc: (source) => {
          const abs = path.isAbsolute(source) ? source : path.join(ragDir, source);
          return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : null;
        },
        // 빈손 방지 폴백 — 정밀/의미 검색이 모두 비면 전체 카탈로그(존재하는 파일만)를 안내한다.
        fallbackSources: () =>
          ['catalog/overview.md', 'catalog/hooks.md'].filter((rel) =>
            fs.existsSync(path.join(ragDir, rel)),
          ),
      });
      return await retriever.retrieve(query, intent, fileContent);
    } catch (err) {
      console.warn(`[Axiom AI] retrieveOfflineKnowledge 실패: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * 사용자 질문과 현재 파일 컨텍스트를 기반으로 시스템 프롬프트를 조립한다.
   *
   * - Method 1 (키워드 라우팅) + Method 3 (파일 컨텍스트) 병렬 실행
   * - 결과가 부족하면 Method 2 (임베딩 유사도) 폴백
   * - 페이지 생성 요청 시 도메인 존재 여부를 감지하여 프롬프트에 주입
   */
  /** 사용자 쿼리에 화면 이동(navigate) 의도가 있는지 감지한다. */
  private _hasNavigationIntent(query: string): boolean {
    const q = query.toLowerCase();
    const patterns = [
      '이동', 'navigate', 'navigation', '네비게이션',
      '뒤로', '이전 페이지', '루트', '메인으로', '메인 페이지',
      'router.push', 'usenavigate', '화면이동', '페이지이동',
    ];
    return patterns.some((p) => q.includes(p));
  }

  /** 필터·검색·정렬 의도가 있는 요청인지(서버 params 배선 지침 노출용). */
  private _hasFilterIntent(query: string): boolean {
    const q = query.toLowerCase();
    return ['필터', 'filter', '검색', 'search', '정렬', 'sort'].some((p) => q.includes(p));
  }

  /**
   * 파일 생성/수정 의도가 명시적으로 드러나는지 판단한다(보수적: 동사·생성 패턴 기반).
   * 하나라도 걸리면 Q&A 게이팅을 적용하지 않고 기존 시나리오 지시문을 그대로 주입한다.
   */
  private _isExplicitEditOrCreate(query: string): boolean {
    return signalIsExplicitEditOrCreate(query);
  }

  /**
   * 조회·설명형(Q&A) 질문인지 판단한다. 코드를 보여달라거나 개념·사용법을 묻는 질문.
   * 게이팅은 _isExplicitEditOrCreate가 false일 때만 적용되므로 여기서는 신호만 본다.
   */
  private _isQnAQuery(query: string): boolean {
    return signalIsQnAQuery(query);
  }

  /**
   * 인사·감사·맞장구 등 비액션(non-actionable) 잡담인지 판단한다.
   * 파일이 열려 있다는 이유만으로 이런 입력이 시나리오 C(파일 수정)로 빠지는 것을 막는다.
   * _isExplicitEditOrCreate가 우선 적용되므로(isQnAGated 참조) 여기서는 짧은 인사/맞장구 신호만 본다(보수적).
   */
  private _isSmalltalk(query: string): boolean {
    return signalIsSmalltalk(query);
  }

  /**
   * 고정 스캐폴딩(규칙·가이드 + 현재 파일)의 보수적 추정 글자 수.
   * 적응형 예산 계산의 상수로만 쓰인다(정밀 측정 아님 — 소형 윈도우 보호용 안전 마진).
   */
  private static readonly ESTIMATED_RULES_CHARS = 6000;

  /** 선택영역·쿼리·슬라이스 안내문 등 가변 부가 텍스트를 위한 예약 여유분(자). */
  private static readonly FILE_BUDGET_RESERVE_MARGIN = 4000;

  /**
   * 현재 파일을 스텁으로 자르기 시작하는 글자 임계값을 **모델 컨텍스트 윈도우에 맞춰 적응형**으로 계산한다.
   *
   * 고정 3000자(FILE_SLICE_BUDGET)는 64k 윈도우 모델에도 ~300줄 파일을 잘라, 모델이 실제 코드를 보지
   * 못한 채 `<search>`를 기억으로 지어내 매칭 실패하는 근본 원인이었다. 윈도우가 넉넉하면 파일을 통째로
   * 넣어 모델이 실제 코드를 보게 한다(약한 모델이 patch를 정확히 만드는 가장 견고한 조건).
   * 규칙·가이드 + RAG + 가변 부가 텍스트 몫을 목표 상한에서 빼고 남는 만큼을 파일에 허용하며,
   * 작은 윈도우 보호를 위해 하한은 종전 고정값으로 둔다. adaptiveBudget이 꺼져 있으면 종전 동작(무회귀).
   */
  private _computeFileSliceBudget(
    diet: ReturnType<typeof ExtensionConfig.getPromptDietConfig>,
  ): number {
    const ab = diet.adaptiveBudget;
    if (!ab.enabled) return FILE_SLICE_BUDGET;
    const contextWindow = ExtensionConfig.getLlmConfig().contextWindow;
    const charBudget = ExtensionConfig.getRagConfig().charBudget;
    const targetChars = contextWindow * ab.charsPerToken * ab.targetRatio;
    const reserved =
      ScaffoldContextBuilder.ESTIMATED_RULES_CHARS +
      charBudget +
      ScaffoldContextBuilder.FILE_BUDGET_RESERVE_MARGIN;
    return Math.max(FILE_SLICE_BUDGET, Math.floor(targetChars - reserved));
  }

  /**
   * 적응형 RAG 예산을 계산한다. 비활성이면 undefined를 반환해 엔진이 고정 charBudget을 쓰게 한다.
   *
   * 목표 전체 글자 수 = contextWindow(토큰) × charsPerToken × targetRatio.
   * 여기서 규칙·가이드 추정 + 현재 파일 추정을 뺀 만큼만 RAG에 할당하되,
   * floorChars ~ charBudget 범위로 clamp 한다. 윈도우가 넉넉하면 charBudget 그대로(no-op).
   */
  private _computeRagBudget(
    diet: ReturnType<typeof ExtensionConfig.getPromptDietConfig>,
    ctx: EditorContext,
  ): number | undefined {
    const ab = diet.adaptiveBudget;
    if (!ab.enabled) return undefined;

    const charBudget = ExtensionConfig.getRagConfig().charBudget;
    const contextWindow = ExtensionConfig.getLlmConfig().contextWindow;
    const targetChars = contextWindow * ab.charsPerToken * ab.targetRatio;

    const estFileChars = Math.min(ctx.content?.length ?? 0, this._computeFileSliceBudget(diet));
    const estFixed = ScaffoldContextBuilder.ESTIMATED_RULES_CHARS + estFileChars;

    const available = Math.floor(targetChars - estFixed);
    return Math.max(ab.floorChars, Math.min(charBudget, available));
  }

  /**
   * 코어 규칙 문자열을 조립한다.
   * - 가드레일(라우터·useApi·Rules of Hooks·import 경로·타입 네이밍·스택)은 항상 포함.
   * - 상황별 가이드(화면 이동 패턴, 파일 생성 범위)는 opts로 게이팅한다.
   * A/B/C 시나리오 경로는 opts 둘 다 true로 호출해 종전 동작과 바이트 단위로 동일하다.
   */
  private _buildCoreRules(opts: { includeNavigation: boolean; includeFileScope: boolean }): string {
    const routerInfo = this._getRouterImportSource();
    const routerImportRule = routerInfo.version
      ? `- **react-router import**: 이 프로젝트는 react-router ${routerInfo.version}을 사용합니다. useParams 등 react-router 관련 훅은 반드시 \`'${routerInfo.source}'\`에서 import 하세요 (예: \`import { useParams } from '${routerInfo.source}';\`)`
      : `- **react-router import**: useParams 등 react-router 관련 훅은 \`'${routerInfo.source}'\`에서 import 하세요`;

    const navRules = opts.includeNavigation
      ? `\n- **화면 이동 금지 패턴**: useNavigate(), useHistory() 등 react-router 훅 사용 금지\n- **화면 이동 올바른 패턴**: 전역 $router 객체 사용 (import 불필요) — $router.push('/path'), $router.replace('/path'), $router.back()`
      : '';
    const fileScopeRule = opts.includeFileScope
      ? `\n- **⚠️ 파일 생성 범위 엄수**: 사용자가 명시적으로 요청한 파일(페이지)만 생성할 것. FormPage, DetailPage, StatusPage 등 관련 페이지를 임의로 추가 생성하는 것은 절대 금지. 요청 = 1개 페이지이면 axiom-action의 createFile(page) 블록도 반드시 1개만 출력할 것.`
      : '';

    return `당신은 Axiom AI입니다. react-app-scaffold 전용 코딩 어시스턴트입니다.

## 핵심 규칙
- 모든 코드는 아래 scaffold 문서의 패턴을 따라야 합니다
- createBrowserRouter 사용 금지 → 항상 createHashRouter (createAppRouter() 경유)
- useQuery/useMutation 직접 사용 금지 → 항상 @axiom/hooks의 useApi 사용
- **기존 코드 보존(중요)**: 새 \`useApi\`나 import를 추가할 때 ① 이미 있는 import를 다시 추가하지 말 것(중복), ② 기존 훅의 구조분해 필드(\`isPending\`, \`error\`, \`refetch\` 등)를 **이름 바꾸지 말 것**. 충돌이 걱정되면 **새로 추가하는 훅의 필드만** 고유 이름으로 alias한다(예: \`const { data: departments, isPending: isDepartmentsPending, error: departmentsError } = useApi(...)\`). 기존 훅과 그 사용처는 건드리지 않는다.
- **⚠️ React Rules of Hooks 절대 준수**: \`use\`로 시작하는 모든 훅(useApi, useState, useEffect, useMemo, useCallback, useRef, useParams 등)은 반드시 **React 함수 컴포넌트 본문 또는 커스텀 훅(\`use*\`) 함수 본문의 최상위**에서만 호출. 다음 위치에서 호출 절대 금지: ① 모듈 최상위(import 아래·\`export default function\` 위), ② 조건문/반복문/일반 \`if·for·try\` 블록 안, ③ 일반 함수(컴포넌트가 아닌 \`calculateXxx\`, \`formatXxx\` 등 유틸 함수)나 콜백 안, ④ class 컴포넌트 안. 새 \`useApi\` 호출을 추가할 때는 반드시 \`export default function ComponentName(): React.ReactNode { ... }\` 블록 **안쪽**, 다른 훅 선언 옆, \`return\` 문 위에 위치시킬 것.
- 상대경로 임포트 금지 → UI 컴포넌트는 반드시 @axiom/components/ui 단일 경로에서 named import 사용 (예: import { Button, Input, Card, CardHeader, CardTitle, CardContent, CardDescription, Label } from '@axiom/components/ui'; — @/components/ui/button 등 개별 파일 경로 절대 금지), 훅은 반드시 @axiom/hooks (예: import { useApi } from '@axiom/hooks'), 내부 타입·유틸은 @/ 앨리어스 사용 (@/hooks/useApi 형식 절대 금지)
- scaffold의 package.json에 없는 라이브러리 제안 금지
- 코드 주석은 한국어로 작성${navRules}${fileScopeRule}
${routerImportRule}

## TypeScript 타입 네이밍 컨벤션 (반드시 준수)
- **일반 타입**: \`type\` 키워드 + \`T\` 접두사 → \`type TUser = { ... }\`, \`type TBenchMember = { ... }\`
- **인터페이스**: \`interface\` 키워드 + \`I\` 접두사 → \`interface IApiConfig { ... }\`
- **API 응답/요청 타입**: \`type\` 키워드 + \`T\` 접두사 사용 (interface 사용 금지)
- **Props 타입**: \`type\` 키워드, 접두사 없음 → \`type UserCardProps = { ... }\`
- **접두사 없는 interface/type 선언 절대 금지** → \`interface BenchMember\`, \`type BenchMember\` 형식 금지
- **선언 위치**: \`type\`·\`interface\`·\`enum\` 등 타입 선언은 함수 컴포넌트 **본문 안에 두지 말 것**. 같은 파일 안에 둘 경우 \`export default function\` 컴포넌트 **바로 위(모듈 스코프)** 에 선언한다 — 컴포넌트 함수 \`{ ... }\` 안에서 \`type\`/\`interface\`를 선언하지 않는다.

## 함수 컴포넌트 내부 선언 순서 (반드시 준수)
함수 컴포넌트 본문 안의 선언은 아래 순서로 배치합니다(새 코드 추가·수정 시에도 이 순서를 유지):
1. **변수/상태 선언부**: \`useState\`, \`useRef\` 등 상태·ref 선언을 함수 컴포넌트 **최상단**에 둔다.
2. **useApi 선언부**: 데이터 페치 훅(\`useApi\` 등) 선언을 그 **다음(두 번째 영역)** 에 둔다. 변수/상태 선언부가 없으면 함수 컴포넌트 최상단에 둔다.
3. **그 외**: \`useEffect\`, 일반 함수, \`handleXxx\` 핸들러 함수는 그 **다음 순위**에 둔다.

## 프로젝트 스택
React 19, TypeScript, Vite 8, TanStack Query v5 (v5 API만 사용), shadcn/ui, TailwindCSS 4
해시 기반 라우팅 (createHashRouter), 도메인 기반 아키텍처 (core/domains/shared)${this._libraryVersions ? `\n\n## 설치된 라이브러리 버전\n${this._libraryVersions}` : ''}`;
  }

  async buildSystemPrompt(ctx: EditorContext, userQuery: string, forceQnA = false): Promise<string> {
    const ragDir = this._getRagDir();
    const diet = ExtensionConfig.getPromptDietConfig();

    // 적응형 RAG 예산: 규칙·가이드 + 현재 파일이 이미 크면 RAG 상한을 남은 컨텍스트에 비례해 줄인다.
    // 컨텍스트 윈도우가 넉넉하면(예: 32K) 사실상 charBudget 그대로다(축소는 소형 윈도우 모델 보호용).
    const budgetOverride = this._computeRagBudget(diet, ctx);

    let scaffoldSection = '';

    if (ragDir) {
      const ragCtx = await this._engine.buildContext(
        userQuery,
        ctx.filePath ?? '',
        ctx.content ?? '',
        budgetOverride
      );

      if (ragCtx.docs.length > 0) {
        scaffoldSection =
          `## Scaffold 문서 (관련 항목)\n` +
          ragCtx.docs.join('\n\n---\n\n');
      }
    } else {
      scaffoldSection =
        '(scaffold 지식 문서를 찾을 수 없습니다. axiom-ai.ragPath 설정을 확인하세요.)';
    }

    let fileContent = ctx.content ?? '';
    if (ctx.isTruncated && ctx.absoluteFilePath) {
      try {
        fileContent = fs.readFileSync(ctx.absoluteFilePath, 'utf-8');
      } catch {
        // 읽기 실패 시 잘린 컨텍스트 유지
      }
    }

    // TS/TSX 등 코드 파일이면 함수 단위로 슬라이싱 — 쿼리와 무관한 함수는 stub으로 대체.
    // 임계값은 모델 컨텍스트 윈도우 기반 적응형: 윈도우가 넉넉하면 통째로 넣어(스텁 없이) 모델이
    // 실제 코드를 보게 한다 — patch 매칭 실패의 근본 원인 제거.
    const fileSliceBudget = this._computeFileSliceBudget(diet);
    let sliceNotice = '';
    if (
      ctx.available &&
      ctx.language &&
      SLICEABLE_LANGUAGES.has(ctx.language) &&
      fileContent.length > fileSliceBudget
    ) {
      const sliced = extractRelevantTsSlice(
        fileContent,
        tokenizeQuery(userQuery),
        fileSliceBudget,
        ctx.selection
          ? { startLine: ctx.selection.startLine, endLine: ctx.selection.endLine }
          : undefined,
      );
      fileContent = sliced.text;
      if (sliced.skippedCount > 0) {
        sliceNotice =
          `\n> ⚠️ 파일이 커서 쿼리와 무관한 ${sliced.skippedCount}개 선언은 \`// ... [kind name] 원본 NN줄 보존 (자리 표시자)\` 형식의 stub 라인으로 대체했습니다.\n` +
          `> - **stub 라인은 자리 표시자**입니다. 디스크에는 원본 코드가 그대로 있고, 응답에 stub을 그대로 포함하면 서버가 쓰기 직전에 원본으로 복원합니다.\n` +
          `> - ⚠️ **stub에 적힌 이름(kpiCards, useFoo 등)을 새 코드에서 이미 선언된 변수·hook처럼 참조하지 마세요.** 사용자가 새 API/데이터 소스 추가를 요청했다면 별도의 \`const\` 선언과 \`import\`를 응답에 명시적으로 추가해야 합니다.\n` +
          `> - 모드 선택은 위의 "출력 모드 선택" 규칙을 따르세요(import 추가·여러 위치 변경이면 full). stub의 존재가 모드 선택을 바꾸지는 않습니다.\n` +
          `> - full 모드로 응답할 때 stub 라인은 **한 글자도 바꾸지 말고 그대로** 포함하세요.\n`;
      }
    }

    const selectionSection = ctx.selection
      ? (() => {
          // contextWindow에 라인 번호를 부여한다 — 모델이 "라인 349"를 코드 안의 정확한
          // 위치로 매핑할 수 있게 함. qwen-class 약한 모델은 줄 세기를 못해서 같은 토큰이
          // 여러 곳에 있을 때 잘못된 위치를 고르기 쉬움.
          const windowLines = ctx.selection!.contextWindow.split('\n');
          const startLineNo = ctx.selection!.contextStartLine;
          const selStart = ctx.selection!.startLine;
          const selEnd = ctx.selection!.endLine;
          const maxWidth = String(startLineNo + windowLines.length - 1).length;
          const numbered = windowLines
            .map((line, i) => {
              const lineNo = startLineNo + i;
              const marker = lineNo >= selStart && lineNo <= selEnd ? ' ← 선택됨' : '';
              return `${String(lineNo).padStart(maxWidth, ' ')}| ${line}${marker}`;
            })
            .join('\n');
          return [
            '',
            `### 🎯 선택 영역 (라인 ${selStart}~${selEnd})`,
            '선택된 텍스트:',
            '```',
            ctx.selection!.text,
            '```',
            '',
            `**선택 영역 주변 코드 (라인 ${ctx.selection!.contextStartLine}~${ctx.selection!.contextEndLine}, ` +
              '실제 파일 원본 / 각 줄 앞에 라인 번호 부여):**',
            '```',
            numbered,
            '```',
            '',
            '⚠️ **수정 범위 규칙 — 위반 시 거부됨**:',
            `1. 수정 대상은 라인 **${selStart}~${selEnd}** 안의 토큰 정확히 1곳뿐. 같은 변수명/표현식이 다른 라인(예: 위 코드의 다른 \`← 선택됨\` 표시 없는 라인)에 또 있어도 **절대 건드리지 마세요**.`,
            `2. \`<search>\`/\`<replace>\`는 라인 ${selStart}~${selEnd}만 포함. 양쪽 1줄 정도까지 맥락으로 확장 허용.`,
            '3. `<search>` 코드는 위 코드 블록에서 그대로 복사하되 **앞의 `NNN| ` 라인 번호 prefix는 절대 포함하지 마세요**. 라인 번호는 위치 파악용일 뿐 실제 파일 내용이 아닙니다.',
            '4. **선택 영역 밖에 새로 추가**할 코드(import, `useApi` 등 훅 호출, state 선언, 타입 선언)는 `<patch>`로 만들지 마세요 — 그 위치는 파일이 커서 잘려 안 보이므로 `<search>`가 매칭되지 않습니다. 대신 **조각만** 내면 위치는 확장이 알아서 끼웁니다(같은 `<axiom-action>` 안에 `<patch>`와 함께 출력):',
            "   - 훅/state: `<hook>const { data: departments } = useApi<TDepartment[]>('/api/departments');</hook>`",
            '   - import: `<import module="@axiom/hooks" named="useApi" />`',
            '   - 타입: `<hook>` 안에 `type TDepartment = { ... }` 선언을 함께 넣으면 확장이 모듈 스코프로 올립니다.',
            '5. **선택 밖 소비처는 출력하지 마세요.** 선택 영역에서 필드/식별자를 rename하면(예: `name`→`employee_name`), 컴포넌트 본문의 소비처(`member.name`→`member.employee_name` 등)는 **확장이 자동으로 반영**합니다. 소비처 JSX/로직을 추측해 `<patch>`로 내지 마세요(추측한 코드는 실제 파일과 달라 매칭 실패합니다).',
            '',
            `**예시**: 위 코드에 \`u.end_date\`가 라인 ${selStart}과 다른 라인 두 곳에 있어도, \`← 선택됨\` 표시가 있는 **라인 ${selStart}만** 변경하세요.`,
          ].join('\n');
        })()
      : ctx.selectedText
        ? `\n### 선택된 텍스트\n\`\`\`\n${ctx.selectedText}\n\`\`\``
        : '';

    // 라인 앵커(lines) 모드용: 파일이 슬라이싱되지 않은(라인번호가 실제와 1:1로 맞는) 경우에만
    // 본문에 `NNN| ` prefix를 부여한다. 슬라이싱되면 번호가 어긋나므로 부여하지 않는다.
    const lineEditCfg = ExtensionConfig.getLineEditConfig();
    const fileIsSliced = sliceNotice.length > 0;
    const linesAllowed =
      ctx.available && lineEditCfg.enabled && !fileIsSliced && ctx.content !== undefined;

    let fileBody = fileContent;
    let lineNumberNotice = '';
    if (linesAllowed) {
      const fl = fileContent.split('\n');
      const width = String(fl.length).length;
      fileBody = fl.map((l, i) => `${String(i + 1).padStart(width, ' ')}| ${l}`).join('\n');
      lineNumberNotice =
        '> 각 줄 앞 `NNN| `는 **위치 파악용 라인 번호**입니다 — 실제 파일 내용이 아니므로 출력(<edit>·코드)에 절대 포함하지 마세요.';
    }

    const fileSection = ctx.available
      ? [
          '\n\n---\n\n## 현재 열린 파일: ' + ctx.filePath,
          sliceNotice,
          lineNumberNotice,
          '```' + ctx.language,
          fileBody,
          '```',
          selectionSection,
        ].join('\n')
      : '';

    const domainCtx = this._getDomainContext(userQuery, ctx.filePath ?? '');
    const domainSection = this._buildDomainSection(domainCtx, userQuery);

    // 쿼리에 명시된 참조 파일(예: /plan/api-spec.md)을 읽어 주입한다.
    // 모든 시나리오(Q&A·A·B·C)에 공통 적용 — 모델이 임의 엔드포인트를 지어내지 않게 한다.
    const referencedSection = this._buildReferencedFilesSection(userQuery);

    // SDD 컨텍스트는 _handleMessage가 ctx.content에 append하므로 파일 섹션에 포함된다.
    // 별도 분리가 필요하면 EditorContext에 sddChars를 추가하는 추가 작업이 필요.
    this._lastBreakdown = {
      rulesChars: 0, // coreRules는 시나리오 분기 뒤 합산 — _buildScenarioCPrompt / 시나리오 A·B 반환 직전에 갱신
      fileChars: fileSection.length,
      ragChars: scaffoldSection.length,
      sddChars: 0,
      domainChars: domainSection.length,
    };

    // 대화 게이팅(프롬프트 다이어트): 조회·설명형 질문이나 인사·잡담이면 파일이 열려 있어도 시나리오 C로
    // 가지 않고 출력 모드·생성 지시문을 통째로 생략한다. 의도 분류를 파일 열림 기반 시나리오 추론보다
    // 우선시킨다. 판정은 isQnAGated 단일 진실원을 사용해 후처리부(ChatViewProvider)와 항상 일치시킨다.
    if (this.isQnAGated(userQuery, forceQnA)) {
      const qnaRules = this._buildCoreRules({
        includeNavigation: this._hasNavigationIntent(userQuery),
        includeFileScope: false,
      });
      const qnaPrompt = `${qnaRules}

## 현재 작업: 질문 답변 (조회·설명)
사용자의 질문에 답하세요. 코드 예시가 필요하면 위 scaffold 문서의 패턴을 따른 코드 블록으로 보여주되,
**파일을 생성·수정하는 axiom-action 블록은 출력하지 마세요** — 이 요청은 파일 변경이 아니라 설명 요청입니다.
${scaffoldSection}${fileSection}${referencedSection}`;
      // 도메인 섹션은 Q&A 프롬프트에 포함하지 않으므로 0으로 보정
      this._lastBreakdown.domainChars = 0;
      this._lastBreakdown.rulesChars = Math.max(
        0,
        qnaPrompt.length - fileSection.length - scaffoldSection.length - referencedSection.length,
      );
      return qnaPrompt;
    }

    // 코어 규칙 = 가드레일(항상) + 상황별 가이드(옵션). A/B/C 경로는 종전과 동일하게 모두 포함한다.
    const coreRules = this._buildCoreRules({ includeNavigation: true, includeFileScope: true });

    // 시나리오 C: 현재 열린 파일 수정 — A/B 예시 없이 C 전용 프롬프트 사용
    if (domainCtx.isCurrentFileContext) {
      const cPrompt = this._buildScenarioCPrompt(
        coreRules, domainCtx, userQuery, domainSection, scaffoldSection, fileSection,
        linesAllowed, lineEditCfg.requireAnchor, !!ctx.selection,
        referencedSection, ExtensionConfig.isScenarioCCompactModes(),
      );
      // rulesChars = 전체 - 다른 섹션 (rules + 시나리오 가이드 합산)
      this._lastBreakdown.rulesChars = Math.max(
        0,
        cPrompt.length - fileSection.length - scaffoldSection.length - domainSection.length - referencedSection.length,
      );
      return cPrompt;
    }

    // 시나리오 A / B: 새 파일 생성 흐름
    const abPrompt = `${coreRules}

## 파일 생성 기능 (DDD 구조)
이 프로젝트는 DDD(Domain Driven Design) 패턴을 사용하며 업무별 코드는 src/domains/{domain}/ 하위에 위치합니다.
사용자가 특정 업무(domain)에 파일 생성을 요청하면, 응답 끝에 아래 형식의 액션 블록을 반드시 포함해야 합니다.

### 지원 templateType
- page: 페이지 컴포넌트 → src/domains/{domain}/pages/{ComponentName}.tsx
- component: 도메인 컴포넌트 → src/domains/{domain}/components/{ComponentName}.tsx
- store: 상태관리 모듈 → src/domains/{domain}/store/{componentName}.ts
- api: API 모듈 → src/domains/{domain}/api/{componentName}.ts
- router: 라우터 파일 → src/domains/{domain}/router/index.tsx

### 파일명 규칙
- 컴포넌트(page, component): PascalCase (예: AccountList)
- 일반 파일(store, api): camelCase (예: accountStore)
- 라우터 path: kebab-case (예: AccountListPage → account-list). element/children/component는 PascalCase 유지

### 중요: axiom-action 블록 형식 규칙
- JSON 메타데이터와 코드를 **분리**하여 작성한다 (JSON 안에 코드를 넣지 말 것)
- JSON 한 줄 다음에 코드 블록(\`\`\`tsx)을 바로 이어서 작성
- updateFile 액션의 코드 블록은 수정된 **전체 파일 내용**이어야 함

### 시나리오 A: 도메인이 이미 존재하는 경우 (axiom-action 정확히 2개만 출력 — 페이지 createFile 1개 + 라우터 updateFile 1개)
응답 끝에 아래 2개의 블록을 순서대로 포함:

블록 1 — 페이지 파일 생성:
<axiom-action>
{"action":"createFile","templateType":"page","domain":"{domain}","componentName":"{ComponentName}","filePath":"src/domains/{domain}/pages/{ComponentName}.tsx"}
\`\`\`tsx
// 전체 TSX 코드를 여기에 작성
\`\`\`
</axiom-action>

블록 2 — 기존 도메인 라우터에 신규 페이지 경로 추가 (아래 [현재 도메인 라우터 파일] 내용을 수정):
<axiom-action>
{"action":"updateFile","templateType":"router","domain":"{domain}","componentName":"{ComponentName}","filePath":"src/domains/{domain}/router/index.tsx"}
\`\`\`tsx
// 신규 페이지가 추가된 라우터 전체 파일 내용
\`\`\`
</axiom-action>

### 시나리오 B: 도메인이 존재하지 않는 경우 / 신규 도메인 (axiom-action 정확히 3개만 출력 — 페이지 createFile 1개 + 라우터 createFile 1개 + 루트 라우터 updateFile 1개)
응답 끝에 아래 3개의 블록을 순서대로 포함:

블록 1 — 페이지 파일 생성:
<axiom-action>
{"action":"createFile","templateType":"page","domain":"{domain}","componentName":"{ComponentName}","filePath":"src/domains/{domain}/pages/{ComponentName}.tsx"}
\`\`\`tsx
// 전체 TSX 코드
\`\`\`
</axiom-action>

블록 2 — 도메인 라우터 파일 신규 생성:
<axiom-action>
{"action":"createFile","templateType":"router","domain":"{domain}","componentName":"{ComponentName}","filePath":"src/domains/{domain}/router/index.tsx"}
\`\`\`tsx
// 도메인 라우터 전체 코드
\`\`\`
</axiom-action>

블록 3 — 루트 라우터에 도메인 등록 (아래 [현재 루트 라우터 파일] 내용을 수정):
<axiom-action>
{"action":"updateFile","templateType":"router","domain":"{domain}","componentName":"{ComponentName}","filePath":"src/shared/router/index.tsx"}
\`\`\`tsx
// 신규 도메인이 등록된 루트 라우터 전체 파일 내용
\`\`\`
</axiom-action>

### 도메인 라우터 파일 규칙 (중요)
- \`src/domains/{domain}/router/index.tsx\`에서 **createHashRouter 직접 사용 금지**
- 도메인 라우터는 \`TAppRoute[]\` 배열만 export (createHashRouter는 루트 App.tsx에서만 사용)
- 올바른 패턴: \`const routes: TAppRoute[] = [...]; export default routes;\`

${domainSection}${scaffoldSection}${fileSection}${referencedSection}`;
    this._lastBreakdown.rulesChars = Math.max(
      0,
      abPrompt.length - fileSection.length - scaffoldSection.length - domainSection.length - referencedSection.length,
    );
    return abPrompt;
  }

  /**
   * 시나리오 C 전용 시스템 프롬프트.
   * A/B 시나리오 예시를 제외하고 현재 파일 수정에만 집중하도록 구성한다.
   */
  private _buildScenarioCPrompt(
    coreRules: string,
    domainCtx: DomainContext,
    userQuery: string,
    domainSection: string,
    scaffoldSection: string,
    fileSection: string,
    linesAllowed: boolean,
    requireAnchor: boolean,
    hasSelection: boolean,
    referencedSection = '',
    compactModes = false,
  ): string {
    const filePath = domainCtx.domainName
      ? `src/domains/${domainCtx.domainName}/pages/[ComponentName].tsx`
      : '[현재 열린 파일 경로]';

    const templateType = 'page';

    // 컴팩트 모드는 선택 영역이 없을 때만 의미가 있다(선택 영역은 patch를 강제하므로 별도 경로).
    // lines가 허용될 때 patch는 lines와 역할이 겹쳐 약한 모델의 선택부담만 키운다 → patch를 빼고
    // structural(추가)+lines(치환/삽입/삭제) 2개로 좁힌다. lines 불가(슬라이싱 등) 시엔 patch가
    // 유일한 국소 편집 수단이라 유지한다(structural+patch).
    const compact = compactModes && !hasSelection;
    const dropPatch = compact && linesAllowed;

    const mp = ExtensionConfig.getMultiPatchConfig();

    const patchModeBlock = mp.enabled
      ? `**patch 모드** — 국소 변경. \`<patch>\` 블록을 1~${mp.maxPatches}개 출력 가능.

⚠️ **\`<search>\` 필수 규칙: 원본 파일에 지금 존재하는 코드만 작성. 아직 없는 코드를 \`<search>\`에 넣으면 매칭 실패.**
- **코드 추가(import·state·hook 등)**: 기존 인접 라인을 앵커로 \`<search>\`에 넣고, \`<replace>\`에 기존 라인 + 새 라인을 함께 출력
- import 추가 예: \`<search>import { useState } from 'react';</search><replace>import { useState } from 'react';\nimport { getXxx } from '@/api/xxx';</replace>\`
- state 추가 예: \`<search>const [existingState, setExistingState] = useState(X);</search><replace>const [existingState, setExistingState] = useState(X);\n  const [newState, setNewState] = useState([]);</replace>\`
- 각 \`<search>\`는 **원본 파일 기준**(이전 patch 적용 결과 반영 금지), 라인 범위 **겹침 금지**, 전후 맥락 **${mp.minContextLines}줄 이상** 포함.

<axiom-action>
{"action":"updateFile","mode":"patch","templateType":"${templateType}","domain":"${domainCtx.domainName ?? ''}","filePath":"${filePath}"}
<patch>
<search>
원본 파일에 현재 존재하는 코드 (전후 맥락 ${mp.minContextLines}줄 포함)
</search>
<replace>
교체할 새 코드
</replace>
</patch>
</axiom-action>

여러 위치 수정 시 \`<patch>\` 블록을 N개 나열. import 추가는 별도 \`<patch>\`로 분리.`
      : `**patch 모드** — 단일 블록 수정.

⚠️ **\`<search>\`에는 원본 파일에 지금 존재하는 코드만. 추가할 코드를 \`<search>\`에 넣으면 매칭 실패.**

<axiom-action>
{"action":"updateFile","mode":"patch","templateType":"${templateType}","domain":"${domainCtx.domainName ?? ''}","filePath":"${filePath}"}
<patch>
<search>원본 파일에 현재 존재하는 코드 (정확히 일치)</search>
<replace>교체할 새 코드</replace>
</patch>
</axiom-action>`;

    // 선택 영역이 있으면 structural 모드를 아예 제시하지 않는다.
    // structural은 삽입 위치를 구조 앵커로만 결정해 선택 영역을 무시하며, 선택한 JSX 내부
    // 바인딩 교체 같은 국소 수정을 표현할 수 없다(서버측 가드도 이 응답을 거부함).
    const structuralModeBlock = hasSelection
      ? ''
      : `**structural 모드 (훅·import 추가 시 최우선 권장)** — 위치를 직접 찾지 마세요. "추가할 코드"만 출력하면 확장이 컴포넌트 본문의 정확한 위치(기존 훅 다음, return 위)에 결정론적으로 삽입합니다. \`<search>\`·라인 번호·전체 파일이 전혀 필요 없습니다.
- useApi/useState/useEffect 등 **훅 추가**, **import 추가**는 이 모드를 쓰세요.
- \`<hook>\`: 컴포넌트 본문에 추가할 훅/코드 줄만 작성 (들여쓰기 없이 — 확장이 맞춰 넣음).
- \`<hook>\` 안에 \`type\`/\`interface\`/\`enum\` 선언을 함께 써도 됩니다. 확장이 이를 자동으로 분리해 **함수 컴포넌트 바로 위(모듈 스코프)** 에 배치하므로, 컴포넌트 본문 안에 직접 박지 마세요.
- 기존 더미 변수를 실제 데이터로 교체할 때는 **같은 이름**으로 받으세요 (예: \`const { data: teamReports } = useApi(...)\`). 그러면 확장이 같은 이름의 기존 더미 선언을 자동으로 삭제합니다 — 더미를 지우는 별도 출력은 필요 없습니다.
- \`<import>\`: 추가할 import. 이미 있으면 자동 무시됩니다. named는 콤마로 구분.

<axiom-action>
{"action":"updateFile","mode":"structural","templateType":"${templateType}","domain":"${domainCtx.domainName ?? ''}","filePath":"${filePath}"}
<hook>
const { data, isPending, error } = useApi<TResponse>('/api/endpoint');
</hook>
<import module="@axiom/hooks" named="useApi" />
</axiom-action>`;

    // "출력 모드 선택" 요약 규칙. 선택 영역이 있으면 patch를 강제하고 structural/lines를 금지한다
    // — 선택 영역 수정은 patch(`<search>`/`<replace>`)로만 정확히 표현·검증되기 때문이다.
    const modeSelectionRules = hasSelection
      ? `> - **patch 모드 (선택 영역 수정 시 필수)**: 위 "🎯 선택 영역"에 표시된 코드를 \`<search>\`/\`<replace>\`로 직접 고치세요. ⛔ **\`<hook>\`(structural)·\`<edit>\`(lines) 모드 절대 금지** — structural은 선택 영역을 무시하고 엉뚱한 위치(컴포넌트 위·훅 다음)에 삽입되어, 정작 선택한 코드는 그대로 남습니다.`
      : `> - **structural 모드 (훅·import 추가 시 최우선)**: useApi 등 \`use*\` 훅 추가나 import 추가는 structural 모드로. 위치를 찾지 말고 추가할 조각만 출력하세요.${
          linesAllowed
            ? `
> - **lines 모드 (그 외 일반 코드 수정의 기본)**: 위 파일에 붙은 라인 번호를 보고 **바뀐 줄만** \`<edit>\`로 출력하세요. 원본을 다시 복사하지 않아 출력이 가장 작습니다.${
                dropPatch
                  ? ''
                  : `
> - **patch 모드**: 라인 번호가 헷갈리거나 lines로 표현하기 어려운 국소 변경에 한해 \`<patch>\` 블록 사용(폴백).`
              }`
            : `
> - **patch 모드**: 기존 코드의 특정 부분을 고치는 국소 변경(선택 영역 수정 등)은 \`<patch>\` 블록 N개로 표현.`
        }`;

    // 라인 앵커(lines) 모드 — 파일이 슬라이싱되지 않아 라인번호가 실제와 일치할 때만 제공.
    const anchorRule = requireAnchor
      ? `각 \`<edit>\`에는 **\`anchor\` 속성**으로 기준 라인(치환=\`from\`, 삽입=\`after\`)의 **원본 텍스트 1줄을 그대로 복사**(앞의 \`NNN| \` 라인번호 prefix 제외)해 넣으세요. 확장이 이 anchor로 위치를 대조·자동 보정하므로 라인번호가 약간 어긋나도 안전합니다. anchor가 없으면 거부됩니다.`
      : `각 \`<edit>\`에 기준 라인의 원본 텍스트를 \`anchor\`로 넣으면 위치 검증 정확도가 올라갑니다(선택).`;
    const lineModeBlock = `**lines 모드 (일반 코드 수정 시 기본 권장)** — 위 파일은 각 줄 앞에 \`NNN| \` 라인 번호가 붙어 있습니다. **바뀐 줄만** \`<edit>\`로 출력하면 확장이 열린 파일에 그대로 적용합니다. 원본을 다시 복사하지 않아 출력이 가장 작습니다.
- **치환/삭제**: \`<edit from="시작라인" to="끝라인" ...>\` 안에 새 내용을 넣으세요. 내용이 비면 해당 줄 삭제. (한 줄이면 from=to)
- **삽입**: \`<edit after="기준라인" ...>\` — 기준 라인 **뒤에** 새 내용을 삽입 (최상단 삽입은 after="0").
- ${anchorRule}
- 라인 번호(\`NNN| \`)와 anchor는 **위치 지정용**입니다. \`<edit>\` 본문(실제 적용될 코드)에는 라인 번호 prefix를 절대 넣지 마세요.
- 선택 영역이 제시되어 있으면 그 범위(및 import 추가)에만 한정하세요.

<axiom-action>
{"action":"updateFile","mode":"lines","templateType":"${templateType}","domain":"${domainCtx.domainName ?? ''}","filePath":"${filePath}"}
<edit from="44" to="44" anchor="const [age, setAge] = useState(0);">
  const [age, setAge] = useState(0);
  const [phone, setPhone] = useState('');
</edit>
</axiom-action>

여러 곳을 고치면 \`<edit>\` 블록을 N개 나열하세요 (각 from/to/after·anchor는 **원본 파일 기준**, 범위 겹침 금지).`;

    const navigationHint = this._hasNavigationIntent(userQuery)
      ? `
### 화면 이동 구현 지침
react-app-scaffold의 화면 이동은 전역 \`$router\` 객체를 사용한다 (import 불필요):
- **이동 버튼**: \`<Button onClick={() => $router.push('/이동경로')}>텍스트</Button>\`
- **Button 컴포넌트**: \`import { Button } from '@axiom/components/ui';\`
- **뒤로가기**: \`<Button onClick={() => $router.back()}>뒤로가기</Button>\`
- **히스토리 교체**: \`$router.replace('/path')\`

> ⚠️ \`useNavigate()\` 및 \`react-router\` 훅 사용 **절대 금지**. 항상 \`$router\`를 사용한다.
> onClick은 인라인 화살표 함수로 작성. 별도 핸들러 함수 선언 불필요.`
      : '';

    // 데이터 필터링·검색 요청 + 현재 파일이 이미 useApi(params)로 서버 조회 중일 때만 노출한다.
    // 약한 모델이 서버 params 대신 클라이언트 파괴적 필터(setState로 원본 덮어쓰기)나 행별 Select를
    // 창작해 의미가 깨지는 실패(실측)를 막는 타깃 지침. (params가 없으면 클라 필터가 정당할 수 있어 미노출.)
    const hasServerParams = /useApi/.test(fileSection) && /\bparams\s*:/.test(fileSection);
    const filterHint = this._hasFilterIntent(userQuery) && hasServerParams
      ? `
### ⚠️ 데이터 필터링·검색 구현 지침 (서버 params 우선 — 반드시 준수)
현재 파일은 이미 \`useApi(endpoint, { params: { … } })\` 로 **서버에서** 목록을 가져옵니다. 필터/검색은 클라이언트가 아니라 **서버 params**로 처리하세요:
- ✅ 그 \`useApi\`의 \`params\` 객체에 필터 조건(예: \`department\`, \`status\`)을 **추가**하고, select 변경 시 해당 state만 바꾸세요 — useApi가 자동으로 재요청합니다(필요 시 \`refetch()\`).
- ⛔ **클라이언트 필터링 금지**: \`list.filter(...)\` 로 거른 결과를 가져온 목록 state에 \`setState\`로 **덮어쓰지 마세요** — 원본이 사라져 복구 불가(파괴적).
- ⛔ 요청이 '필터'면 **상단 필터 영역만** 건드리세요. 테이블 행(row)마다 새 입력 컴포넌트(\`<Select>\` 등)를 만들지 마세요.`
      : '';

    return `${coreRules}

## ⚠️ 현재 작업: 열린 파일 코드 수정 (시나리오 C)
현재 열린 파일에 코드 추가/수정 요청입니다. 아래 규칙을 반드시 따르세요:

${compact
  ? `1. **⚠️ axiom-action 블록을 먼저 출력**하세요. 설명을 길게 쓰다 블록을 빠뜨리면 아무것도 적용되지 않습니다 — 블록이 가장 중요합니다.
2. 블록 뒤에 변경 요약을 **1~2줄로만 짧게** 덧붙이세요 (길게 쓰지 말 것).
3. 라우터 파일(router/index.tsx) 수정 불필요 — axiom-action 블록은 **1개만** 생성
4. 아래 출력 모드 중 하나를 선택하고, JSON 메타데이터와 코드/edit 블록을 분리하세요`
  : `1. 설명 텍스트를 먼저 작성한 후, **응답 마지막에 반드시 axiom-action 블록을 출력**하세요
2. 라우터 파일(router/index.tsx) 수정 불필요 — axiom-action 블록은 **1개만** 생성
3. 수정 범위에 따라 아래 출력 모드 중 하나를 선택하세요 (출력은 작을수록 좋습니다)
4. JSON 메타데이터와 코드/edit 블록을 분리하여 작성하세요`}

### ⚠️ 훅(useApi 등) 삽입 위치 규칙 — 위반 시 런타임 즉시 크래시
새로운 \`useApi\` / \`useState\` / \`useEffect\` 등 \`use*\` 훅 호출을 추가할 때:
- **반드시** 기존 \`export default function ComponentName(): React.ReactNode { ... }\` 블록 **안쪽**, 다른 훅 선언 옆, \`return\` 문 **위**에 위치시킬 것
- **절대 금지 위치**: ① 파일 상단 import 아래, ② \`type\` / \`interface\` / 상수 선언 옆, ③ \`calculateXxx\`, \`formatXxx\` 같은 일반 유틸 함수 안, ④ \`if·for·try\` 블록 안
- 현재 파일에 \`const calculateTenure = ...\` 같은 유틸 const가 함수 컴포넌트 위에 선언되어 있어도, **그 옆에 \`useApi\` 호출을 넣지 마세요** — 함수 컴포넌트 본문 안으로 들어가야 합니다
- patch 모드 사용 시: \`<search>\`에 컴포넌트 함수 본문 안의 기존 훅 선언 라인을 포함해 그 바로 아래에 새 훅을 삽입하도록 작성

### 출력 모드 선택

> ⚠️ **모드 선택 핵심 규칙** (출력은 작을수록 좋습니다 — 바뀐 부분만 출력):
${modeSelectionRules}
> - **full 모드**: 파일 절반 이상을 재작성해야 할 때만 사용(출력이 가장 큼 — 최후의 수단).
> - 선택 영역이 위에 제시되어 있으면 그 영역과 import 추가에만 한정하세요.

${structuralModeBlock ? `${structuralModeBlock}\n` : ''}${linesAllowed && !hasSelection ? `${lineModeBlock}\n\n` : ''}${dropPatch ? '' : patchModeBlock}

**full 모드** — 전체 파일 재작성이 필요할 때만:

<axiom-action>
{"action":"updateFile","mode":"full","templateType":"${templateType}","domain":"${domainCtx.domainName ?? ''}","filePath":"${filePath}"}
\`\`\`tsx
// 기존 코드를 유지하면서 요청된 변경사항이 반영된 전체 파일 내용
\`\`\`
</axiom-action>
${navigationHint}${filterHint}

${domainSection}${scaffoldSection}${fileSection}${referencedSection}`;
  }

  /** 파일 경로에서 도메인명을 추출한다 (public 노출). */
  extractDomainFromFilePath(filePath: string): string | null {
    return this._extractDomainFromFilePath(filePath);
  }

  /** .rag/ 파일이 변경된 경우 캐시를 초기화하고 엔진을 재빌드한다. */
  invalidateAndRebuild(): void {
    this._ragDir = undefined;
    this._engine.invalidate();
    this.startIndexBuild();
  }

  /**
   * 사용자 쿼리에서 도메인명을 추출하고, 워크스페이스에서 도메인 존재 여부를 확인한다.
   * 쿼리에서 도메인을 찾지 못하면 currentFilePath(현재 열린 파일)에서 추출한다 → 시나리오 C.
   * 도메인이 존재하면 기존 도메인 라우터 파일을, 신규 도메인이면 루트 라우터 파일을 읽는다.
   */
  private _getDomainContext(userQuery: string, currentFilePath: string = ''): DomainContext {
    let domainName = this._extractDomainFromQuery(userQuery);
    let isCurrentFileContext = false;

    // 쿼리에서 도메인을 못 찾은 경우에만 현재 열린 파일 경로에서 추출 → Scenario C
    // 단, "특정 경로에 새 파일을 만들어줘" 같은 명시적 신규 생성 요청은 열린 파일로 폴백하지 않는다.
    // (열린 파일을 수정 대상(시나리오 C)으로 오인해 "어떤 파일을 수정할까요?"로 새는 것을 방지)
    if (!domainName && currentFilePath && !this._isExplicitCreateNewFile(userQuery)) {
      domainName = this._extractDomainFromFilePath(currentFilePath);
      if (domainName) {
        isCurrentFileContext = true;
      }
    }

    if (!domainName) {
      return { domainName: null, domainExists: false, domainRouterContent: null, rootRouterContent: null, isCurrentFileContext: false };
    }

    const wsRoot = this._getWorkspaceRoot();
    if (!wsRoot) {
      return { domainName, domainExists: false, domainRouterContent: null, rootRouterContent: null, isCurrentFileContext };
    }

    const domainDir = path.join(wsRoot, 'src', 'domains', domainName);
    const domainExists = fs.existsSync(domainDir);

    if (domainExists) {
      // 기존 도메인 → 도메인 라우터 파일 내용 주입
      const routerFile = path.join(domainDir, 'router', 'index.tsx');
      const domainRouterContent = fs.existsSync(routerFile)
        ? fs.readFileSync(routerFile, 'utf-8')
        : null;
      return { domainName, domainExists: true, domainRouterContent, rootRouterContent: null, isCurrentFileContext };
    } else {
      // 신규 도메인 → 루트 라우터 파일 내용 주입
      const rootRouterFile = path.join(wsRoot, 'src', 'shared', 'router', 'index.tsx');
      const rootRouterContent = fs.existsSync(rootRouterFile)
        ? fs.readFileSync(rootRouterFile, 'utf-8')
        : null;
      return { domainName, domainExists: false, domainRouterContent: null, rootRouterContent, isCurrentFileContext };
    }
  }

  /**
   * 파일 경로에서 도메인명을 추출한다.
   * 예: "src/domains/example/pages/AccountListPage.tsx" → "example"
   */
  private _extractDomainFromFilePath(filePath: string): string | null {
    const match = filePath.match(/src[/\\]domains[/\\]([^/\\]+)[/\\]/);
    return match?.[1] ?? null;
  }

  /**
   * 도메인 컨텍스트를 시스템 프롬프트 섹션 문자열로 변환한다.
   * 도메인 관련 요청이 아닌 경우 빈 문자열을 반환한다.
   */
  private _buildDomainSection(ctx: DomainContext, userQuery = ''): string {
    if (!ctx.domainName) return '';

    const lines: string[] = [];
    lines.push(`\n---\n\n## 파일 컨텍스트`);
    lines.push(`- 감지된 도메인: **${ctx.domainName}**`);

    // 시나리오 C: 도메인 정보만 표기 (axiom-action 지시문은 _buildScenarioCPrompt에서 처리)
    if (ctx.isCurrentFileContext) {
      lines.push(`- 요청 유형: **현재 파일 코드 수정 (시나리오 C)**`);
      lines.push(`- 감지 도메인: **${ctx.domainName}**`);
      lines.push('\n---\n');
      return lines.join('\n');
    }

    // 시나리오 A / B: 새 페이지 생성 요청
    lines.push(`- 도메인 존재 여부: **${ctx.domainExists ? '존재함 (시나리오 A 적용)' : '없음 (시나리오 B 적용)'}**`);

    if (ctx.domainExists && ctx.domainRouterContent) {
      lines.push(`\n### 현재 도메인 라우터 파일 (src/domains/${ctx.domainName}/router/index.tsx)`);
      lines.push('```tsx');
      lines.push(ctx.domainRouterContent);
      lines.push('```');
      lines.push('\n위 파일에 신규 페이지 loadable import와 routes 배열 항목을 추가하여 updateFile 블록의 generatedCode를 작성하세요. `loadable()`을 처음 사용하는 파일이면 `import loadable from \'@loadable/component\';`도 함께 추가하세요.');
    } else if (ctx.domainExists && !ctx.domainRouterContent) {
      lines.push(`\n도메인 폴더는 존재하지만 router/index.tsx 파일이 없습니다. createFile로 라우터도 새로 생성하세요 (시나리오 B 적용).`);
    }

    if (!ctx.domainExists && ctx.rootRouterContent) {
      lines.push(`\n### 현재 루트 라우터 파일 (src/shared/router/index.tsx)`);
      lines.push('```tsx');
      lines.push(ctx.rootRouterContent);
      lines.push('```');
      lines.push('\n위 파일에 신규 도메인 import와 routes 배열 항목을 추가하여 updateFile 블록의 generatedCode를 작성하세요.');
    } else if (!ctx.domainExists && !ctx.rootRouterContent) {
      lines.push(`\nsrc/shared/router/index.tsx 파일을 찾을 수 없습니다. 루트 라우터 파일 경로를 확인하세요.`);
    }

    lines.push('\n---\n');
    return lines.join('\n');
  }

  /**
   * 사용자 쿼리에서 도메인명을 추출한다.
   *
   * 우선순위:
   * 1. 명시적 패턴: "account 업무", "account domain", "account 도메인"
   * 2. PascalCase 페이지명 접두어: "AccountListPage" → "account"
   * 3. kebab-case 페이지명 첫 세그먼트: "account-list-page" → "account"
   */
  private _extractDomainFromQuery(query: string): string | null {
    return signalExtractDomainFromQuery(query);
  }

  /**
   * 쿼리가 "특정 경로/폴더에 새 파일을 만들어 달라"는 **명시적 신규 생성** 요청인지 판단한다.
   * 생성 동사 + 쿼리에 적힌 대상 파일명 + (쿼리의 경로로 해석한) 대상 파일이 아직 없을 때 true.
   *
   * 현재 다른 파일이 열려 있어도 이 경우는 "현재 파일 수정(시나리오 C)"이 아니라 "신규 생성"이므로,
   * _getDomainContext가 열린 파일로 폴백하지 않도록 게이트한다. 이렇게 해야 명백한 "만들어줘"가
   * 열린 파일을 수정 대상으로 오인해 "어떤 파일을 수정할까요?" QuickPick으로 새지 않는다.
   *
   * 보수적: 경로를 구체 파일로 해석할 수 없거나, 그 파일이 이미 존재하면(=덮어쓰기/수정 가능성) false로
   * 두어 기존 수정 흐름을 그대로 유지한다.
   */
  private _isExplicitCreateNewFile(userQuery: string): boolean {
    const q = userQuery.toLowerCase();
    // 신규 생성 의미의 동사만 — "추가"는 기존 파일에 추가(수정)일 수 있어 제외(오분류 방지).
    const createVerbs = ['만들', '생성', '새 파일', '새파일', 'create', 'make', 'scaffold'];
    if (!createVerbs.some((v) => q.includes(v))) return false;

    // 쿼리에 적힌 대상 파일명(.ts/.tsx/.js/.jsx). 예: "(StatusEmploymentBadge.tsx)"
    const fileM = userQuery.match(/([A-Za-z0-9_]+\.(?:tsx?|jsx?))\b/);
    if (!fileM) return false;
    const fileName = fileM[1];

    const wsRoot = this._getWorkspaceRoot();
    if (!wsRoot) return false;

    // 쿼리에서 src/... 경로(폴더 또는 파일)를 추출. \w는 한글을 포함하지 않으므로 한글 토큰 앞에서 멈춘다.
    const pathM = userQuery.match(/(?:\.[\\/])?src[\\/][\w./\\-]+/);
    if (!pathM) return false;
    const p = pathM[0].replace(/^\.[\\/]/, '').replace(/\\/g, '/');
    const candidateRel = /\.(?:tsx?|jsx?)$/.test(p)
      ? p
      : `${p.replace(/\/+$/, '')}/${fileName}`;

    // 대상 파일이 아직 없으면 신규 생성으로 본다.
    return !fs.existsSync(path.join(wsRoot, candidateRel));
  }

  /** 현재 열린 파일을 수정하는 컨텍스트(시나리오 C)인지 판단한다. */
  isFileModificationContext(userQuery: string, filePath: string): boolean {
    return this._getDomainContext(userQuery, filePath).isCurrentFileContext;
  }

  /**
   * buildSystemPrompt가 이 쿼리를 대화(Q&A·잡담)로 게이팅하는지(=axiom-action 생성 지시를 빼는지) 여부.
   * 호출자(ChatViewProvider)가 응답 후처리에서 동일한 판단을 따르게 해, 설명형 질문이나
   * 인사·잡담을 파일 수정 모드로 강제 진입시키지 않도록 한다(프롬프트 생성부·후처리부 단일 진실원).
   *
   * 보수적: 생성/수정 신호가 조금이라도 있으면(_isExplicitEditOrCreate) 무조건 게이팅하지 않는다.
   * 그 외에 ① 조회·설명형 질문이거나 ② 인사·감사·맞장구 같은 비액션 잡담이면 게이팅한다.
   * 후자가 없으면 도메인 파일이 열려 있다는 이유만으로 "안녕" 같은 입력도 시나리오 C(수정)로 빠진다.
   *
   * @param forceQnA 모델 의도 분류기(IntentClassifier)가 'qna'/'smalltalk'로 확정한 경우 true.
   *   정규식 신호가 자연어 꼬리를 못 따라가는 케이스("원인을 찾아줘"처럼 ?·신호어 없는 질문)를
   *   **모델의 의미 분류가 정규식보다 우선**하도록 덮어쓴다. (정규식은 모델 부재·null 폴백용.)
   *   단 diet.qnaGating 자체가 꺼져 있으면(사용자가 명시적으로 비활성) 종전대로 게이팅 안 함.
   */
  isQnAGated(userQuery: string, forceQnA = false): boolean {
    const diet = ExtensionConfig.getPromptDietConfig();
    if (!diet.qnaGating) return false;
    if (forceQnA) return true;
    if (this._isExplicitEditOrCreate(userQuery)) return false;
    return this._isQnAQuery(userQuery) || this._isSmalltalk(userQuery);
  }

  /** .axiom/knowledge/ 폴더가 존재하면 경로를 반환한다. */
  private _getAxiomKnowledgeDir(): string | null {
    const axiomFolder = ExtensionConfig.getSddAxiomFolder();
    if (!axiomFolder) return null;
    const wsRoot = this._getWorkspaceRoot();
    const axiomDir = wsRoot && !path.isAbsolute(axiomFolder)
      ? path.join(wsRoot, axiomFolder)
      : axiomFolder;
    const knowledgeDir = path.join(axiomDir, 'knowledge');
    return fs.existsSync(knowledgeDir) ? knowledgeDir : null;
  }

  /** 외부 corpus 폴더가 설정되어 있으면 로드한다. */
  private _loadExternalCorpora(folder: string | undefined): ExternalCorpus[] {
    if (!folder || !this._outputChannel) return [];
    const loader = new ExternalCorpusLoader(this._outputChannel);
    return [loader.load(folder)];
  }

  private _getWorkspaceRoot(): string | null {
    const folders = vscode.workspace.workspaceFolders;
    return folders && folders.length > 0 ? folders[0].uri.fsPath : null;
  }

  /** 참조 파일 1개당 주입 글자 상한 — 스펙 md가 길어도 컨텍스트 폭주를 막는다. */
  private static readonly REFERENCED_FILE_BUDGET = 12000;

  /**
   * 사용자 쿼리에 명시된 파일 경로(예: "/plan/api-spec.md")를 워크스페이스에서 읽어
   * 시스템 프롬프트 섹션으로 반환한다. 경로 멘션이 없거나 파일이 없으면 빈 문자열.
   *
   * 모델이 참조 파일에 **이미 정의된** API/스펙을 고르도록 유도하고, 적절한 항목이
   * 없을 때만 "없다"고 답하게 한다(새 엔드포인트 임의 생성 방지).
   */
  private _buildReferencedFilesSection(userQuery: string): string {
    const wsRoot = this._getWorkspaceRoot();
    if (!wsRoot) return '';

    // .md/.ts/.tsx/.json/.yaml/.css 등 확장자를 가진 경로 토큰 추출
    const re = /(?:^|[\s`'"(])(\/?(?:[\w.-]+[/\\])*[\w.-]+\.(?:md|tsx?|jsx?|json|ya?ml|css))/g;
    const found = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(userQuery)) !== null) {
      found.add(m[1].replace(/^[/\\]/, '').replace(/\\/g, '/'));
    }
    if (found.size === 0) return '';

    const blocks: string[] = [];
    for (const rel of found) {
      const abs = path.join(wsRoot, rel);
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
      let content = fs.readFileSync(abs, 'utf-8');
      if (content.length > ScaffoldContextBuilder.REFERENCED_FILE_BUDGET) {
        content = content.slice(0, ScaffoldContextBuilder.REFERENCED_FILE_BUDGET) + '\n... (이하 생략)';
      }
      blocks.push(`## 📎 참조 요청 파일: ${rel}\n\`\`\`\n${content}\n\`\`\``);
    }
    if (blocks.length === 0) return '';

    return `\n\n---\n\n> ⚠️ 사용자가 아래 파일을 **참조하라고 명시**했습니다. 이 파일에 **이미 정의된 API/스펙 중에서** 현재 화면(또는 질문 대상)에 맞는 것을 골라 제시하세요.\n> - 파일에 적절한 API/항목이 있으면 그것을 인용해 답하고, **새 엔드포인트를 임의로 만들지 마세요**.\n> - 파일을 통틀어 적절한 항목이 없을 때만 "참조 파일(${[...found].join(', ')})에 해당 항목이 없습니다"라고 명시하세요. 이 경우에도 추측한 API를 사실처럼 단정하지 마세요.\n\n${blocks.join('\n\n')}`;
  }

  /**
   * 워크스페이스 package.json에서 react-router 버전을 감지하여
   * 올바른 import 경로를 반환한다.
   *
   * React Router v7부터 react-router-dom이 react-router로 통합되었으므로
   * v7 이상이면 'react-router', 미만이면 'react-router-dom'을 반환한다.
   */
  private _getRouterImportSource(): { source: string; version: string | null } {
    const wsRoot = this._getWorkspaceRoot();
    if (!wsRoot) return { source: 'react-router-dom', version: null };

    const pkgPath = path.join(wsRoot, 'package.json');
    if (!fs.existsSync(pkgPath)) return { source: 'react-router-dom', version: null };

    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      const rrVersion = deps['react-router'];
      const rrdVersion = deps['react-router-dom'];

      // v7+: react-router-dom이 react-router로 통합됨
      if (rrVersion) {
        const major = parseInt(rrVersion.replace(/^[^0-9]*/, ''), 10);
        if (major >= 7) {
          return { source: 'react-router', version: rrVersion };
        }
      }

      // v6 이하: react-router-dom 사용
      if (rrdVersion) {
        return { source: 'react-router-dom', version: rrdVersion };
      }

      // react-router만 있고 v7 미만인 경우 (드문 케이스)
      if (rrVersion) {
        return { source: 'react-router', version: rrVersion };
      }

      return { source: 'react-router-dom', version: null };
    } catch {
      return { source: 'react-router-dom', version: null };
    }
  }

  /**
   * .rag/ 디렉터리 위치를 결정한다.
   *
   * 우선순위:
   * 1. 워크스페이스 루트의 .rag/ (프로젝트 오버라이드)
   * 2. 확장 번들 내 .rag/ (기본값)
   */
  private _getRagDir(): string | null {
    if (this._ragDir !== undefined) return this._ragDir;

    const ragPath = ExtensionConfig.getRagPath();

    // 워크스페이스 우선 탐색
    const folders = vscode.workspace.workspaceFolders;
    if (folders) {
      for (const folder of folders) {
        const candidate = path.resolve(folder.uri.fsPath, ragPath);
        if (fs.existsSync(candidate)) {
          this._ragDir = candidate;
          return candidate;
        }
      }
    }

    // 확장 번들 내 knowledge/ 폴백
    const bundled = vscode.Uri.joinPath(this.extensionUri, 'knowledge').fsPath;
    this._ragDir = fs.existsSync(bundled) ? bundled : null;
    return this._ragDir;
  }
}
