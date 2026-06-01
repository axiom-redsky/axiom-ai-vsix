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
import { scanLibraryVersions } from './PackageVersionScanner';

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

  async buildSystemPrompt(ctx: EditorContext, userQuery: string): Promise<string> {
    const ragDir = this._getRagDir();

    let scaffoldSection = '';

    if (ragDir) {
      const ragCtx = await this._engine.buildContext(
        userQuery,
        ctx.filePath ?? '',
        ctx.content ?? ''
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

    // TS/TSX 등 코드 파일이면 함수 단위로 슬라이싱 — 쿼리와 무관한 함수는 stub으로 대체
    let sliceNotice = '';
    if (
      ctx.available &&
      ctx.language &&
      SLICEABLE_LANGUAGES.has(ctx.language) &&
      fileContent.length > FILE_SLICE_BUDGET
    ) {
      const sliced = extractRelevantTsSlice(
        fileContent,
        tokenizeQuery(userQuery),
        FILE_SLICE_BUDGET,
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
            '4. import 추가는 별도 `<patch>` 블록으로 분리.',
            '',
            `**예시**: 위 코드에 \`u.end_date\`가 라인 ${selStart}과 다른 라인 두 곳에 있어도, \`← 선택됨\` 표시가 있는 **라인 ${selStart}만** 변경하세요.`,
          ].join('\n');
        })()
      : ctx.selectedText
        ? `\n### 선택된 텍스트\n\`\`\`\n${ctx.selectedText}\n\`\`\``
        : '';

    const fileSection = ctx.available
      ? [
          '\n\n---\n\n## 현재 열린 파일: ' + ctx.filePath,
          sliceNotice,
          '```' + ctx.language,
          fileContent,
          '```',
          selectionSection,
        ].join('\n')
      : '';

    const domainCtx = this._getDomainContext(userQuery, ctx.filePath ?? '');
    const domainSection = this._buildDomainSection(domainCtx, userQuery);

    // SDD 컨텍스트는 _handleMessage가 ctx.content에 append하므로 파일 섹션에 포함된다.
    // 별도 분리가 필요하면 EditorContext에 sddChars를 추가하는 추가 작업이 필요.
    this._lastBreakdown = {
      rulesChars: 0, // coreRules는 시나리오 분기 뒤 합산 — _buildScenarioCPrompt / 시나리오 A·B 반환 직전에 갱신
      fileChars: fileSection.length,
      ragChars: scaffoldSection.length,
      sddChars: 0,
      domainChars: domainSection.length,
    };

    const routerInfo = this._getRouterImportSource();
    const routerImportRule = routerInfo.version
      ? `- **react-router import**: 이 프로젝트는 react-router ${routerInfo.version}을 사용합니다. useParams 등 react-router 관련 훅은 반드시 \`'${routerInfo.source}'\`에서 import 하세요 (예: \`import { useParams } from '${routerInfo.source}';\`)`
      : `- **react-router import**: useParams 등 react-router 관련 훅은 \`'${routerInfo.source}'\`에서 import 하세요`;

    const coreRules = `당신은 Axiom AI입니다. react-app-scaffold 전용 코딩 어시스턴트입니다.

## 핵심 규칙
- 모든 코드는 아래 scaffold 문서의 패턴을 따라야 합니다
- createBrowserRouter 사용 금지 → 항상 createHashRouter (createAppRouter() 경유)
- useQuery/useMutation 직접 사용 금지 → 항상 @axiom/hooks의 useApi 사용
- **⚠️ React Rules of Hooks 절대 준수**: \`use\`로 시작하는 모든 훅(useApi, useState, useEffect, useMemo, useCallback, useRef, useParams 등)은 반드시 **React 함수 컴포넌트 본문 또는 커스텀 훅(\`use*\`) 함수 본문의 최상위**에서만 호출. 다음 위치에서 호출 절대 금지: ① 모듈 최상위(import 아래·\`export default function\` 위), ② 조건문/반복문/일반 \`if·for·try\` 블록 안, ③ 일반 함수(컴포넌트가 아닌 \`calculateXxx\`, \`formatXxx\` 등 유틸 함수)나 콜백 안, ④ class 컴포넌트 안. 새 \`useApi\` 호출을 추가할 때는 반드시 \`export default function ComponentName(): React.ReactNode { ... }\` 블록 **안쪽**, 다른 훅 선언 옆, \`return\` 문 위에 위치시킬 것.
- 상대경로 임포트 금지 → UI 컴포넌트는 반드시 @axiom/components/ui 단일 경로에서 named import 사용 (예: import { Button, Input, Card, CardHeader, CardTitle, CardContent, CardDescription, Label } from '@axiom/components/ui'; — @/components/ui/button 등 개별 파일 경로 절대 금지), 훅은 반드시 @axiom/hooks (예: import { useApi } from '@axiom/hooks'), 내부 타입·유틸은 @/ 앨리어스 사용 (@/hooks/useApi 형식 절대 금지)
- scaffold의 package.json에 없는 라이브러리 제안 금지
- 코드 주석은 한국어로 작성
- **화면 이동 금지 패턴**: useNavigate(), useHistory() 등 react-router 훅 사용 금지
- **화면 이동 올바른 패턴**: 전역 $router 객체 사용 (import 불필요) — $router.push('/path'), $router.replace('/path'), $router.back()
- **⚠️ 파일 생성 범위 엄수**: 사용자가 명시적으로 요청한 파일(페이지)만 생성할 것. FormPage, DetailPage, StatusPage 등 관련 페이지를 임의로 추가 생성하는 것은 절대 금지. 요청 = 1개 페이지이면 axiom-action의 createFile(page) 블록도 반드시 1개만 출력할 것.
${routerImportRule}

## TypeScript 타입 네이밍 컨벤션 (반드시 준수)
- **일반 타입**: \`type\` 키워드 + \`T\` 접두사 → \`type TUser = { ... }\`, \`type TBenchMember = { ... }\`
- **인터페이스**: \`interface\` 키워드 + \`I\` 접두사 → \`interface IApiConfig { ... }\`
- **API 응답/요청 타입**: \`type\` 키워드 + \`T\` 접두사 사용 (interface 사용 금지)
- **Props 타입**: \`type\` 키워드, 접두사 없음 → \`type UserCardProps = { ... }\`
- **접두사 없는 interface/type 선언 절대 금지** → \`interface BenchMember\`, \`type BenchMember\` 형식 금지

## 프로젝트 스택
React 19, TypeScript, Vite 8, TanStack Query v5 (v5 API만 사용), shadcn/ui, TailwindCSS 4
해시 기반 라우팅 (createHashRouter), 도메인 기반 아키텍처 (core/domains/shared)${this._libraryVersions ? `\n\n## 설치된 라이브러리 버전\n${this._libraryVersions}` : ''}`;

    // 시나리오 C: 현재 열린 파일 수정 — A/B 예시 없이 C 전용 프롬프트 사용
    if (domainCtx.isCurrentFileContext) {
      const cPrompt = this._buildScenarioCPrompt(
        coreRules, domainCtx, userQuery, domainSection, scaffoldSection, fileSection,
      );
      // rulesChars = 전체 - 다른 섹션 (rules + 시나리오 가이드 합산)
      this._lastBreakdown.rulesChars = Math.max(
        0,
        cPrompt.length - fileSection.length - scaffoldSection.length - domainSection.length,
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

${domainSection}${scaffoldSection}${fileSection}`;
    this._lastBreakdown.rulesChars = Math.max(
      0,
      abPrompt.length - fileSection.length - scaffoldSection.length - domainSection.length,
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
  ): string {
    const filePath = domainCtx.domainName
      ? `src/domains/${domainCtx.domainName}/pages/[ComponentName].tsx`
      : '[현재 열린 파일 경로]';

    const templateType = 'page';

    const mp = ExtensionConfig.getMultiPatchConfig();

    const patchModeBlock = mp.enabled
      ? `**patch 모드** — 국소 변경. \`<patch>\` 블록을 1~${mp.maxPatches}개 출력 가능. 각 \`<search>\`는 **원본 파일 기준**(이전 patch 결과 반영 금지), 라인 범위 **겹침 금지**, 전후 맥락 **${mp.minContextLines}줄 이상** 포함.

<axiom-action>
{"action":"updateFile","mode":"patch","templateType":"${templateType}","domain":"${domainCtx.domainName ?? ''}","filePath":"${filePath}"}
<patch>
<search>
원본 파일의 정확한 코드 (전후 맥락 ${mp.minContextLines}줄 포함)
</search>
<replace>
교체할 새 코드
</replace>
</patch>
</axiom-action>

여러 위치 수정 시 \`<patch>\` 블록을 N개 나열. import 추가는 별도 \`<patch>\`로 분리.`
      : `**patch 모드** — 단일 블록 수정. \`<search>\`에 원본 코드 정확히, 전후 맥락 ${mp.minContextLines}줄 포함:

<axiom-action>
{"action":"updateFile","mode":"patch","templateType":"${templateType}","domain":"${domainCtx.domainName ?? ''}","filePath":"${filePath}"}
<patch>
<search>원본 파일의 코드 (정확히 일치)</search>
<replace>교체할 새 코드</replace>
</patch>
</axiom-action>`;

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

    return `${coreRules}

## ⚠️ 현재 작업: 열린 파일 코드 수정 (시나리오 C)
현재 열린 파일에 코드 추가/수정 요청입니다. 아래 규칙을 반드시 따르세요:

1. 설명 텍스트를 먼저 작성한 후, **응답 마지막에 반드시 axiom-action 블록을 출력**하세요
2. 라우터 파일(router/index.tsx) 수정 불필요 — axiom-action 블록은 **1개만** 생성
3. 수정 범위에 따라 아래 두 모드 중 하나를 선택하세요
4. JSON 메타데이터와 코드 블록(또는 search/replace 블록)을 분리하여 작성하세요

### ⚠️ 훅(useApi 등) 삽입 위치 규칙 — 위반 시 런타임 즉시 크래시
새로운 \`useApi\` / \`useState\` / \`useEffect\` 등 \`use*\` 훅 호출을 추가할 때:
- **반드시** 기존 \`export default function ComponentName(): React.ReactNode { ... }\` 블록 **안쪽**, 다른 훅 선언 옆, \`return\` 문 **위**에 위치시킬 것
- **절대 금지 위치**: ① 파일 상단 import 아래, ② \`type\` / \`interface\` / 상수 선언 옆, ③ \`calculateXxx\`, \`formatXxx\` 같은 일반 유틸 함수 안, ④ \`if·for·try\` 블록 안
- 현재 파일에 \`const calculateTenure = ...\` 같은 유틸 const가 함수 컴포넌트 위에 선언되어 있어도, **그 옆에 \`useApi\` 호출을 넣지 마세요** — 함수 컴포넌트 본문 안으로 들어가야 합니다
- patch 모드 사용 시: \`<search>\`에 컴포넌트 함수 본문 안의 기존 훅 선언 라인을 포함해 그 바로 아래에 새 훅을 삽입하도록 작성

### 출력 모드 선택

> ⚠️ **모드 선택 핵심 규칙**:
> - **patch 모드 (기본·권장)**: 국소 변경(선택 영역 수정, import 추가, 1~여러 위치 수정)은 \`<patch>\` 블록 N개로 표현. import 추가 + 본문 1곳 같은 경우 \`<patch>\` 2개를 한 응답에 출력.
> - **full 모드**: 파일 절반 이상을 재작성하거나, ${mp.maxPatches}개를 초과하는 위치를 동시에 수정해야 할 때만 사용.
> - 선택 영역이 위에 제시되어 있으면 patch 모드를 사용하고, 수정은 그 영역과 import 추가에만 한정하세요.

${patchModeBlock}

**full 모드** — 전체 파일 재작성이 필요할 때만:

<axiom-action>
{"action":"updateFile","mode":"full","templateType":"${templateType}","domain":"${domainCtx.domainName ?? ''}","filePath":"${filePath}"}
\`\`\`tsx
// 기존 코드를 유지하면서 요청된 변경사항이 반영된 전체 파일 내용
\`\`\`
</axiom-action>
${navigationHint}

${domainSection}${scaffoldSection}${fileSection}`;
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
    if (!domainName && currentFilePath) {
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
    // 1순위: 명시적 도메인 언급 패턴
    const explicitPatterns = [
      /([a-zA-Z][a-zA-Z0-9-_]*)\s*업무/,
      /([a-zA-Z][a-zA-Z0-9-_]*)\s*domain/i,
      /([a-zA-Z][a-zA-Z0-9-_]*)\s*도메인/,
    ];

    for (const pattern of explicitPatterns) {
      const match = query.match(pattern);
      if (match?.[1]) {
        return match[1].toLowerCase();
      }
    }

    // 2순위: PascalCase 식별자(페이지명) 첫 번째 단어 → 도메인 추출
    // 예: "AccountListPage" → "account", "OrderDetailPage" → "order"
    const pascalMatch = query.match(/\b([A-Z][a-z]+)([A-Z][a-zA-Z0-9]*)*Page\b/);
    if (pascalMatch?.[1]) {
      return pascalMatch[1].toLowerCase();
    }

    // 3순위: kebab-case 페이지명 첫 세그먼트
    // 예: "account-list-page" → "account"
    const kebabMatch = query.match(/\b([a-z][a-z0-9]+)(?:-[a-z0-9]+)+-page\b/);
    if (kebabMatch?.[1]) {
      return kebabMatch[1];
    }

    return null;
  }

  /** 현재 열린 파일을 수정하는 컨텍스트(시나리오 C)인지 판단한다. */
  isFileModificationContext(userQuery: string, filePath: string): boolean {
    return this._getDomainContext(userQuery, filePath).isCurrentFileContext;
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
