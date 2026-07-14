import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { extractRelevantTsSlice, splitTsSections } from '../ai/decompose/CodeSectionExtractor';
import {
  tokenizeQuery,
  splitIntoSections,
  scoreSections,
  selectByBudget,
  extractApiPaths,
  matchedApiPaths,
  formatExactPathDirective,
} from '../ai/decompose/SectionExtractor';
import { applyStructuralEdit, type StructuralEdit, type ImportRequest } from '../ai/apply/StructuralAnchor';
import { locateEditRegion, firstJsxTag } from '../ai/locate/RegionEdit';
import { ExtensionConfig } from '../config/ExtensionConfig';
import { LlmService } from '../ai/pipeline/LlmService';
import type { ChatMessage } from '../ai/types';
import type { WebviewToHostMessage, HostToWebviewMessage, ProbeMode } from '../types/messages';

/**
 * 슬라이싱(부분 파일) 출력 실험 패널.
 *
 * "현재 파일을 통째로 보내는 대신 잘라 보낼 때 약한 모델이 얼마나 정확한 출력을 내는가"를
 * 배치/적용 로직 없이 눈으로 확인하기 위한 도구. 같은 질문을 FULL/SLICED 두 가지 뷰로
 * 모델에 던지고 원시 출력을 그대로 보여준다.
 *
 * scripts/probe-sliced-output.ts 의 CLI 버전을 패널 UI로 옮긴 것.
 */
export class SliceProbeProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'axiom-ai.sliceProbePanel';

  private _view?: vscode.WebviewView;
  private readonly _llm: LlmService;

  constructor(private readonly _extensionUri: vscode.Uri) {
    this._llm = new LlmService(_extensionUri);
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _ctx: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'dist')],
    };
    webviewView.webview.html = this._buildHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg: WebviewToHostMessage) => {
      switch (msg.type) {
        case 'probePickFile':
          await this._pickFile();
          break;
        case 'probeUseActiveFile':
          this._useActiveFile();
          break;
        case 'runProbe':
          await this._runProbe(msg.filePath, msg.query, msg.budget, msg.mode);
          break;
      }
    });
  }

  private async _pickFile(): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { 'TS/TSX': ['ts', 'tsx', 'js', 'jsx'] },
      openLabel: '실험할 파일 선택',
    });
    if (picked && picked[0]) {
      this._post({ type: 'probeFilePicked', filePath: picked[0].fsPath });
    }
  }

  private _useActiveFile(): void {
    const active = vscode.window.activeTextEditor?.document.fileName;
    if (active) {
      this._post({ type: 'probeFilePicked', filePath: active });
    } else {
      this._post({ type: 'probeError', message: '활성 에디터에 열린 파일이 없습니다.' });
    }
  }

  private async _runProbe(filePath: string, query: string, budget: number, mode: ProbeMode): Promise<void> {
    if (!filePath || !query.trim()) {
      this._post({ type: 'probeError', message: '파일 경로와 질문을 모두 입력하세요.' });
      return;
    }
    let source: string;
    try {
      source = fs.readFileSync(filePath, 'utf-8');
    } catch (e) {
      this._post({ type: 'probeError', message: `파일을 읽을 수 없습니다: ${(e as Error).message}` });
      return;
    }

    const sliced = extractRelevantTsSlice(source, tokenizeQuery(query), budget);

    // 1) 슬라이싱 뷰를 즉시 전송(LLM 무관) — 모델이 무엇을 보는지 먼저 확인
    this._post({
      type: 'probeViews',
      filePath,
      query,
      original: { chars: source.length, lines: source.split('\n').length },
      sliced: {
        chars: sliced.totalChars,
        includedCount: sliced.includedCount,
        skippedCount: sliced.skippedCount,
        text: sliced.text,
      },
      fullText: source,
    });

    // 도구 호출(CC식): 파일을 프롬프트에 안 박고 read_file 도구로 모델이 당겨오게 한다.
    if (mode === 'tool') {
      await this._runToolLoop(filePath, source, query);
      this._post({ type: 'probeDone' });
      return;
    }

    // 영역 편집: grep으로 위치 찾고 → 그 영역 + 의존성 헤더(+ 참조 스펙)만 보내고 → 모델이 블록만
    // 재작성 → 확장이 위치로 교체(str_replace 없이). 화면 반영은 안 하고 합성 결과만 보여준다.
    if (mode === 'region') {
      const referencedSpec = await this._loadReferencedSpec(query, filePath);
      await this._runRegionEdit(source, query, referencedSpec);
      this._post({ type: 'probeDone' });
      return;
    }

    // 하이브리드: JSX는 영역 재작성 + 훅/타입/import는 structural 삽입(확장이 위치 결정).
    if (mode === 'hybrid') {
      const referencedSpec = await this._loadReferencedSpec(query, filePath);
      await this._runHybridEdit(source, query, referencedSpec);
      this._post({ type: 'probeDone' });
      return;
    }

    // 2) 모드별로 모델 호출
    const variants: { variant: 'full' | 'sliced'; view: string; isSliced: boolean }[] = [];
    if (mode === 'full' || mode === 'both') variants.push({ variant: 'full', view: source, isSliced: false });
    if (mode === 'sliced' || mode === 'both') variants.push({ variant: 'sliced', view: sliced.text, isSliced: true });

    const fileLabel = filePath.replace(/\\/g, '/');
    for (const v of variants) {
      const { system, user } = this._buildPrompt(fileLabel, v.view, v.isSliced, query);
      try {
        const content = await this._callLlm(system, user);
        this._post({ type: 'probeOutput', variant: v.variant, status: 'ok', content, promptChars: system.length });
      } catch (e) {
        this._post({ type: 'probeOutput', variant: v.variant, status: 'error', content: (e as Error).message, promptChars: system.length });
      }
    }

    this._post({ type: 'probeDone' });
  }

  /**
   * 실험용 최소 프롬프트. 실제 Scenario C 전체 지시문을 다 넣지 않고
   * "부분 파일 뷰에서 모델이 정확한 편집을 만드는가"라는 변수만 isolate 한다.
   */
  private _buildPrompt(fileLabel: string, fileView: string, sliced: boolean, query: string): { system: string; user: string } {
    const stubNote = sliced
      ? `\n> ⚠️ 이 파일은 커서 질문과 무관한 선언은 \`// ... [kind name] 원본 NN줄 보존 (자리 표시자)\` 형식의 stub으로 대체했습니다.\n> stub은 자리 표시자일 뿐 실제 코드는 디스크에 그대로 있습니다. stub에 적힌 이름을 이미 선언된 변수처럼 참조하지 마세요.\n`
      : '';
    const system = `당신은 Axiom AI, react-app-scaffold 전용 코딩 어시스턴트입니다.

## 핵심 규칙
- useQuery/useMutation 직접 사용 금지 → 항상 @axiom/hooks의 useApi 사용
- UI는 @axiom/components/ui 에서 named import
- 화면 이동은 전역 $router 사용 (import 불필요)
- 코드 주석은 한국어

## 작업
현재 열린 파일에 대한 수정 요청입니다. 변경에 필요한 코드를 제시하세요.
${stubNote}
---
## 현재 열린 파일: ${fileLabel}
\`\`\`tsx
${fileView}
\`\`\``;
    return { system, user: query };
  }

  /**
   * 실제 확장과 동일한 LlmService.streamChat을 재사용한다.
   * → provider(ollama/openai), thinking 억제(injectNoThink/sendThinkingParams/think:false),
   *   재시도까지 설정이 100% 동일하게 적용된다(프로브 전용 호출 경로의 설정 누락 버그 방지).
   */
  private async _callLlm(system: string, user: string): Promise<string> {
    const cfg = ExtensionConfig.getLlmConfig();
    if (!cfg.endpoint || !cfg.model) {
      throw new Error('LLM 엔드포인트/모델이 설정되지 않았습니다. 설정 패널을 확인하세요.');
    }
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
    let out = '';
    let fellBack = '';
    for await (const chunk of this._llm.streamChat(messages, cfg, undefined, (reason) => { fellBack = reason; })) {
      out += chunk;
    }
    if (fellBack) return `(⚠️ 서버 연결 실패 → 스텁 폴백: ${fellBack})\n${out}`;
    return out || '(빈 응답)';
  }

  /** 모델 출력에서 ```lang … ``` 코드펜스를 벗긴다(위치 교체용 순수 코드 확보). */
  private _stripFences(s: string): string {
    const m = s.match(/```[a-zA-Z]*\n([\s\S]*?)\n```/);
    return (m ? m[1] : s).replace(/\s+$/, '');
  }

  /**
   * 영역 편집 파이프라인(테스트용, 디스크 미반영):
   *  ① grep — 질문 토큰으로 라인 점수화해 편집 위치(영역) 결정
   *  ② 추출 — 편집 영역 + 의존성 헤더(import·타입·컴포넌트 훅 선언부)
   *  ③ 모델 — 의존성 헤더는 읽기 전용 참고, "편집 영역만" 재작성
   *  ④ 위치 교체 — 확장이 영역 라인을 모델 출력으로 splice (str_replace 없음)
   * 각 단계와 합성 결과를 한 출력으로 보여준다.
   */
  /**
   * region/hybrid가 막혔을 때 full 입력으로 폴백한다(파일 파손 대신 안전하게 통째 입력).
   * `head`에는 왜 폴백했는지(전제조건 게이트 차단 or 후처리 거부) 진단을 담아 함께 보여 준다.
   */
  private async _runFullFallback(source: string, query: string, variant: 'region' | 'hybrid', head: string): Promise<void> {
    const { system, user } = this._buildPrompt('(현재 파일)', source, false, query);
    try {
      const content = await this._callLlm(system, user);
      this._post({ type: 'probeOutput', variant, status: 'ok', content: `${head}\n\n■ full 입력 모델 출력:\n\`\`\`tsx\n${content}\n\`\`\``, promptChars: system.length });
    } catch (e) {
      this._post({ type: 'probeOutput', variant, status: 'error', content: `${head}\n\n■ full 호출 실패: ${(e as Error).message}`, promptChars: system.length });
    }
  }

  /** 전제조건 게이트(`safety`) 차단 시 보여 줄 진단 머리글. */
  private _gateHead(loc: ReturnType<typeof locateEditRegion>): string {
    return (
      `■ 🛡️ 안전 게이트 차단(${loc.safety.gate}) → full 입력 폴백\n` +
      `  사유: ${loc.safety.reason}\n` +
      `  (① grep ${loc.bestLine}줄·점수 ${loc.bestScore} / 매칭 [${loc.matched.join(', ') || '없음'}] — region/hybrid splice 금지)`
    );
  }

  /**
   * 쿼리에 명시된 참조 파일(예: `api-spec.md`, `/plan/api-spec.md`)을 픽스처/워크스페이스에서 읽어
   * region/hybrid 프롬프트에 주입할 블록으로 만든다. 본체 `_loadReferencedFiles`의 경량 미러 —
   * 패널에서 "스펙 주입 시 모델이 응답 타입·쿼리 파라미터를 정확히 쓰는가"를 실측하기 위함이다.
   *
   * 해석 순서: ① 픽스처(=선택 파일) 디렉터리 기준 결합/basename, ② 워크스페이스 basename glob.
   * 큰 마크다운은 본체와 동일하게 질문 키워드로 관련 섹션만 추출한다.
   */
  private async _loadReferencedSpec(query: string, baseFilePath: string): Promise<string> {
    const EXT = 'md|markdown|json|ya?ml|txt';
    const candidates = new Set<string>();
    for (const m of query.matchAll(new RegExp(`@?\\/?(?:[\\w.\\-]+\\/)*[\\w.\\-]+\\.(?:${EXT})\\b`, 'gi'))) {
      candidates.add(m[0]);
    }
    if (candidates.size === 0) return '';

    const baseDir = path.dirname(baseFilePath);
    const PER_FILE_CAP = 8000;
    const queryTokens = tokenizeQuery(query);
    const apiPaths = extractApiPaths(query);
    const matchedPaths = new Set<string>();
    const blocks: string[] = [];

    for (const raw of candidates) {
      const rel = raw.replace(/^@/, '').replace(/^\.\//, '').replace(/^\/+/, '').trim();
      if (!rel) continue;
      const base = rel.split('/').pop() ?? rel;
      let abs = '';
      for (const cand of [path.join(baseDir, rel), path.join(baseDir, base)]) {
        if (fs.existsSync(cand)) { abs = cand; break; }
      }
      if (!abs) {
        const found = await vscode.workspace.findFiles(`**/${base}`, '**/node_modules/**', 2);
        if (found.length === 1) abs = found[0].fsPath;
      }
      if (!abs) continue;

      let content: string;
      try { content = fs.readFileSync(abs, 'utf-8'); } catch { continue; }

      let injected: string;
      if (content.length <= PER_FILE_CAP) {
        injected = content;
      } else if (/\.(md|markdown)$/i.test(abs)) {
        const sections = splitIntoSections(base, content);
        scoreSections(sections, queryTokens, apiPaths);
        for (const p of matchedApiPaths(sections, apiPaths)) matchedPaths.add(p);
        const picked = selectByBudget(sections, PER_FILE_CAP, 1);
        injected = picked.length > 0
          ? `(질문 관련 섹션 추출)\n\n${picked.map((s) => s.body).join('\n\n')}`
          : content.slice(0, PER_FILE_CAP) + `\n\n... (이하 생략)`;
      } else {
        injected = content.slice(0, PER_FILE_CAP) + `\n\n... (이하 생략)`;
      }
      blocks.push(`## 참조: ${base}\n\n${injected}`);
    }

    if (blocks.length === 0) return '';
    return (
      formatExactPathDirective([...matchedPaths]) +
      `> ⚠️ 아래는 사용자가 참조하라고 지정한 파일의 실제 내용입니다. ` +
      `타입·필드명·스키마·API 응답 구조는 추측하지 말고 **반드시 아래 내용을 그대로 근거로** 작성하세요.\n` +
      `> ❗ **API 응답 타입의 필드명과 쿼리 파라미터 이름은 반드시 이 스펙에서만** 가져오세요. ` +
      `스펙에 없는 필드·파라미터(예: code_type, category 등)를 추측해 쓰지 마세요.\n\n` +
      blocks.join('\n\n---\n\n')
    );
  }

  private async _runRegionEdit(source: string, query: string, referencedSpec = ''): Promise<void> {
    const loc = locateEditRegion(source, query);
    if (!loc.safety.ok) {
      await this._runFullFallback(source, query, 'region', this._gateHead(loc));
      return;
    }
    const { lines, bestLine, bestScore, matched, startLine, endLine, region, depsHeader } = loc;

    // 참조 스펙(예: api-spec.md)이 있으면 의존성 헤더 위에 주입 — 응답 타입·쿼리 파라미터 추측 방지.
    const specSection = referencedSpec.trim() ? `${referencedSpec.trim()}\n\n` : '';

    // ③ 모델: 편집 영역만 재작성
    const system =
      `당신은 Axiom AI, react-app-scaffold 전용 코딩 어시스턴트입니다.\n` +
      `아래 "의존성 헤더"는 같은 파일의 다른 부분(읽기 전용 참고)입니다. 기존 훅/state/타입/import와 충돌·중복되지 않게 하세요.\n` +
      `"편집 영역"만 요청대로 수정해 **편집 영역 전체를 다시 출력**하세요. 영역 밖 코드는 출력하지 마세요. 코드 블록(\`\`\`tsx) 하나로만 답하세요.\n` +
      `규칙: useApi는 @axiom/hooks, UI는 @axiom/components/ui, 화면이동은 $router, 주석은 한국어.\n\n` +
      specSection +
      `## 의존성 헤더 (읽기 전용)\n\`\`\`tsx\n${depsHeader}\n\`\`\`\n\n` +
      `## 편집 영역 (원본 ${startLine}~${endLine}줄 — 이 부분만 다시 쓰기)\n\`\`\`tsx\n${region}\n\`\`\``;

    let modelOut = '';
    let err = '';
    try {
      modelOut = await this._callLlm(system, query);
    } catch (e) {
      err = (e as Error).message;
    }

    // ④ 위치 교체(splice) — 합성 결과
    const out: string[] = [];
    out.push(`■ ① grep 위치: 최고 매칭 ${bestLine}줄 (점수 ${bestScore}, 매칭 토큰: ${[...matched].join(', ') || '없음'})`);
    out.push(`■ ② 추출 편집 영역 (${startLine}~${endLine}줄, ${region.length}자):`);
    out.push('```tsx\n' + region + '\n```');
    out.push(`■ ② 함께 보낸 의존성 헤더 (${depsHeader.length}자):`);
    out.push('```tsx\n' + depsHeader + '\n```');
    if (specSection) out.push(`■ ② 📎 참조 스펙 주입 (${specSection.length}자) — 응답 타입·쿼리 파라미터 근거`);
    out.push(`■ 프롬프트 총 ${system.length}자 (full 입력 ${source.length}자 대비)`);
    if (err) {
      out.push(`■ ③ 모델 호출 실패: ${err}`);
      this._post({ type: 'probeOutput', variant: 'region', status: 'error', content: out.join('\n\n'), promptChars: system.length });
      return;
    }
    out.push(`■ ③ 모델 출력 (편집 영역 재작성):`);
    out.push('```tsx\n' + modelOut + '\n```');

    const newRegion = this._stripFences(modelOut);
    // 안전장치: 빈/비정상 출력으로 splice하면 해당 라인이 통째로 사라져 파일이 깨진다 → 교체 생략.
    if (newRegion.trim().length === 0) {
      out.push(`■ ④ 위치 교체 생략 — 모델이 빈 출력을 냈습니다(locate가 빗나갔거나 모델이 응답 못함). 원본 유지.`);
      this._post({ type: 'probeOutput', variant: 'region', status: 'error', content: out.join('\n\n'), promptChars: system.length });
      return;
    }
    // 후처리 게이트(Fix 2): 모델 출력의 루트 JSX 태그가 원본 영역과 다르면 = 모델이 편집 영역 밖을
    // 재작성한 것(예: <SelectTrigger> 영역을 통짜 <Select>로). 그대로 splice하면 중첩/고아 요소로
    // 프랑켄 머지가 난다 → splice 거부하고 full 폴백.
    const origTag = firstJsxTag(region);
    const outTag = firstJsxTag(newRegion);
    if (origTag && outTag && origTag !== outTag) {
      out.push(`■ ④ 🛡️ 후처리 게이트: 모델이 편집 영역 밖을 재작성(원본 루트 <${origTag}> ≠ 출력 루트 <${outTag}>) → splice 거부, full 폴백.`);
      await this._runFullFallback(source, query, 'region', out.join('\n\n'));
      return;
    }
    const spliced = [...lines.slice(0, startLine - 1), newRegion, ...lines.slice(endLine)].join('\n');
    out.push(`■ ④ 위치 교체 결과 (${startLine}~${endLine}줄을 모델 출력으로 splice — str_replace 없음, 디스크 미반영):`);
    out.push('```tsx\n' + spliced + '\n```');

    this._post({ type: 'probeOutput', variant: 'region', status: 'ok', content: out.join('\n\n'), promptChars: system.length });
  }

  /**
   * 하이브리드 편집(테스트용, 디스크 미반영):
   *  - JSX 편집 영역 = 모델이 <region>…</region>로 재작성 → 확장이 위치 교체(splice)
   *  - 새 훅/타입/import = 모델이 <hook>…</hook> / <import …/>로 출력 → 확장이 실제 applyStructuralEdit로 결정론 삽입
   * "전체 안 보냄 + 1왕복"이면서 멀티영역(JSX+선언)을 한 번에 처리하는지, 그리고 모델이
   * 두 출력을 한 응답에 정확히 내는지(통제된 franken-merge)를 검증한다.
   */
  private async _runHybridEdit(source: string, query: string, referencedSpec = ''): Promise<void> {
    const loc = locateEditRegion(source, query);
    if (!loc.safety.ok) {
      await this._runFullFallback(source, query, 'hybrid', this._gateHead(loc));
      return;
    }
    const { lines, bestLine, bestScore, matched, startLine, endLine, region, depsHeader } = loc;

    // 참조 스펙(예: api-spec.md)이 있으면 의존성 헤더 위에 주입 — 본체 buildHybridPrompt와 동일.
    const specSection = referencedSpec.trim()
      ? `${referencedSpec.trim()}\n\n` +
        `> ❗ useApi의 타입 인자로 쓸 \`type\`은 <hook> 안에 스펙 기준으로 함께 선언하세요(미선언 시 적용이 거부됩니다).\n\n`
      : '';

    const system =
      `당신은 Axiom AI, react-app-scaffold 전용 코딩 어시스턴트입니다.\n` +
      `아래 "의존성 헤더"는 같은 파일의 다른 부분(읽기 전용 참고)입니다. 기존 훅/state/타입/import와 충돌·중복 금지.\n\n` +
      `요청을 두 종류 출력으로 나누어 답하세요(둘 다 필요하면 둘 다 출력):\n` +
      `1) "편집 영역"의 JSX 수정 → <region>…</region> 안에 편집 영역 **전체를 다시** 쓰기.\n` +
      `2) 새로 필요한 훅/state/타입 → <hook>…</hook> 안에 줄 단위로(들여쓰기 없이). import → <import module="모듈" named="A, B" /> 로. ` +
      `이것들의 위치는 신경 쓰지 마세요 — 확장이 컴포넌트 본문/모듈 스코프의 올바른 위치에 자동 삽입합니다.\n` +
      `예: <hook>type TDepartmentListResponse = { success: boolean; data: TDepartment[] };\n` +
      `const { data: deptResponse } = useApi<TDepartmentListResponse>('/api/departments');\n` +
      `const departments = deptResponse?.data ?? [];</hook>\n` +
      `\n**훅 작성 규칙(위반 시 적용 거부됨):**\n` +
      `- ⛔ 모든 훅(useApi·useState·useEffect)은 **컴포넌트 최상위에서만** 호출. effect/콜백/조건문 안에서 훅 호출 금지(Rules of Hooks 위반).\n` +
      `- ⛔ 서버 데이터를 useState+useEffect로 **복사(미러링)하지 말고** useApi 결과를 **파생 const**로 바로 쓰기(예: \`const items = resp?.data?.GROUP ?? [];\`).\n` +
      `- ⛔ **요청한 컨트롤에 필요한 것만** 출력. 무관한 검색/페이지네이션 핸들러·상수(handleSearch, PAGE_LIMIT 등)를 새로 만들거나 옮기지 마세요.\n` +
      `규칙: useApi는 @axiom/hooks, UI는 @axiom/components/ui, 화면이동은 $router, 주석은 한국어.\n\n` +
      specSection +
      `## 의존성 헤더 (읽기 전용)\n\`\`\`tsx\n${depsHeader}\n\`\`\`\n\n` +
      `## 편집 영역 (원본 ${startLine}~${endLine}줄)\n\`\`\`tsx\n${region}\n\`\`\``;

    let modelOut = '';
    let err = '';
    try {
      modelOut = await this._callLlm(system, query);
    } catch (e) {
      err = (e as Error).message;
    }

    const out: string[] = [];
    out.push(`■ ① grep 위치: 최고 매칭 ${bestLine}줄 (점수 ${bestScore}, 매칭 토큰: ${matched.join(', ') || '없음'})`);
    out.push(`■ ② 편집 영역 ${startLine}~${endLine}줄 + 의존성 헤더 ${depsHeader.length}자 전송`);
    if (specSection) out.push(`■ ② 📎 참조 스펙 주입 (${specSection.length}자) — 응답 타입·쿼리 파라미터 근거`);
    out.push(`■ 프롬프트 총 ${system.length}자 (full 입력 ${source.length}자 대비)`);
    if (err) {
      out.push(`■ ③ 모델 호출 실패: ${err}`);
      this._post({ type: 'probeOutput', variant: 'hybrid', status: 'error', content: out.join('\n\n'), promptChars: system.length });
      return;
    }
    out.push(`■ ③ 모델 원시 출력:`);
    out.push('```\n' + modelOut + '\n```');

    // 파싱: <region> + <hook>(여러 개 가능) + <import …/>
    const regionMatch = modelOut.match(/<region>([\s\S]*?)<\/region>/);
    const hookMatches = [...modelOut.matchAll(/<hook>([\s\S]*?)<\/hook>/g)].map((m) => m[1].trim());
    const importMatches = [...modelOut.matchAll(/<import\s+([^>]*?)\/?>/g)].map((m) => m[1]);

    // 앞 빈 줄만 제거하고 첫 줄 들여쓰기는 보존한다(.trim()은 첫 줄 탭까지 깎아 splice가 flush-left됨).
    const newRegion = regionMatch ? this._stripFences(regionMatch[1]).replace(/^\n+/, '').replace(/\s+$/, '') : '';
    const hookCode = hookMatches.join('\n');
    const imports: ImportRequest[] = importMatches.map((attrs) => {
      const mod = attrs.match(/module\s*=\s*"([^"]*)"/)?.[1] ?? '';
      const named = attrs.match(/named\s*=\s*"([^"]*)"/)?.[1];
      const def = attrs.match(/def\s*=\s*"([^"]*)"/)?.[1];
      const req: ImportRequest = { module: mod };
      if (named) req.named = named.split(',').map((s) => s.trim()).filter(Boolean);
      if (def) req.def = def;
      return req;
    }).filter((r) => r.module);

    out.push(`■ 파싱 결과: <region> ${regionMatch ? '있음' : '없음'}, <hook> ${hookMatches.length}개, <import> ${imports.length}개`);

    // 후처리 게이트(Fix 2): <region> 루트 태그가 원본 영역과 다르면 모델이 영역 밖을 재작성한 것 →
    // splice 시 프랑켄 머지. JSX/훅 전부 거부하고 full 폴백(보수적).
    const origTag = firstJsxTag(region);
    const outTag = newRegion.trim() ? firstJsxTag(newRegion) : null;
    if (origTag && outTag && origTag !== outTag) {
      out.push(`■ ④ 🛡️ 후처리 게이트: <region> 루트가 원본과 다름(<${origTag}> ≠ <${outTag}>) → 합성 거부, full 폴백.`);
      await this._runFullFallback(source, query, 'hybrid', out.join('\n\n'));
      return;
    }

    // ④ 합성: 먼저 JSX 영역 splice → 그 결과에 structural(훅/타입/import) 결정론 삽입
    let composed = source;
    if (newRegion.trim().length > 0) {
      composed = [...lines.slice(0, startLine - 1), newRegion, ...lines.slice(endLine)].join('\n');
      out.push(`■ ④-a JSX 영역 위치 교체 완료 (${startLine}~${endLine}줄)`);
    } else {
      out.push(`■ ④-a <region> 비어 JSX 교체 생략(원본 유지)`);
    }

    const edit: StructuralEdit = {};
    if (hookCode.trim()) edit.hookCode = hookCode;
    if (imports.length) edit.imports = imports;
    if (edit.hookCode || edit.imports) {
      const applied = applyStructuralEdit(composed, edit);
      composed = applied.text;
      out.push(`■ ④-b structural 삽입(실제 applyStructuralEdit):\n  ${applied.changes.join('\n  ') || '(변경 없음)'}`);
    } else {
      out.push(`■ ④-b 추가할 훅/import 없음`);
    }

    out.push(`■ 최종 합성 결과 (디스크 미반영):`);
    out.push('```tsx\n' + composed + '\n```');

    this._post({ type: 'probeOutput', variant: 'hybrid', status: 'ok', content: out.join('\n\n'), promptChars: system.length });
  }

  /**
   * CC식 load-on-demand 테스트. 파일 내용을 프롬프트에 넣지 않고 read_file 도구만 제공한다.
   * 모델이 도구를 호출하면 확장이 파일(또는 요청한 라인 범위)을 돌려주고, 모델이 최종 답을 낼
   * 때까지 반복한다. 핵심 검증: 약한 모델이 이 엔드포인트에서 function calling을 구사하는가.
   *
   * 전체 transcript(각 턴의 도구 호출·텍스트)를 한 문자열로 만들어 probeOutput으로 보낸다.
   */
  private async _runToolLoop(filePath: string, source: string, query: string): Promise<void> {
    const cfg = ExtensionConfig.getLlmConfig();
    if (!cfg.endpoint || !cfg.model) {
      this._post({ type: 'probeOutput', variant: 'tool', status: 'error', content: 'LLM 엔드포인트/모델 미설정', promptChars: 0 });
      return;
    }
    const url = new URL('/v1/chat/completions', cfg.endpoint).toString();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const apiKey = (cfg.apiKey ?? '').trim();
    if (apiKey) headers['Authorization'] = /^(Bearer|Basic)\s+/i.test(apiKey) ? apiKey : `Bearer ${apiKey}`;

    const fileLabel = filePath.replace(/\\/g, '/');
    const lines = source.split('\n');
    const tools = [
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: '현재 작업 대상 파일의 내용을 읽는다. start_line/end_line(1-based)을 주면 그 구간만, 생략하면 전체를 반환한다.',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: '파일 경로' },
              start_line: { type: 'number', description: '시작 줄(1-based, 선택)' },
              end_line: { type: 'number', description: '끝 줄(1-based, 선택)' },
            },
            required: ['path'],
          },
        },
      },
    ];

    // 파일 목차(섹션 kind/name + 라인 범위) — CC의 grep/outline 단계에 해당. 가볍다.
    const outline = splitTsSections(source)
      .map((s) => `  - [${s.kind}] ${s.name}: ${s.startLine}~${s.endLine}줄`)
      .join('\n');

    const system =
      `당신은 Axiom AI, react-app-scaffold 전용 코딩 어시스턴트입니다.\n` +
      `파일 내용은 프롬프트에 없습니다. 수정에 필요한 부분만 read_file 도구로 읽으세요.\n` +
      `⚠️ 파일이 클 수 있으니 전체를 한 번에 읽지 말고, 아래 목차를 보고 **필요한 라인 범위만** read_file(path, start_line, end_line)으로 읽으세요. 여러 구간이 필요하면 여러 번 호출하세요.\n` +
      `현재 열린 파일 경로: ${fileLabel} (총 ${lines.length}줄).\n\n` +
      `## 파일 목차 (라인 범위)\n${outline}\n\n` +
      `규칙: useApi는 @axiom/hooks, UI는 @axiom/components/ui, 화면이동은 $router, 주석은 한국어.` +
      (cfg.injectNoThink ? '\n\n/no_think' : ''); // qwen 계열 추론 억제 소프트 스위치(설정 반영)

    // OpenAI tools 스키마. 모델 메시지/도구 결과를 누적한다.
    const messages: any[] = [
      { role: 'system', content: system },
      { role: 'user', content: query },
    ];

    const transcript: string[] = [];
    const promptCharsFirst = system.length + query.length;
    const MAX_TURNS = 6;

    // 부분 읽기 테스트: 여러 구간을 골라 읽도록 허용하되, 호스트가 종료를 통제한다.
    // - 같은 구간을 또 읽으면(루프) 즉시 답변 강제
    // - 누적 읽기 MAX_READS회를 넘으면 답변 강제
    const MAX_READS = 4;
    const servedSignatures = new Set<string>();
    let readCount = 0;
    let forceAnswer = false;

    for (let turn = 1; turn <= MAX_TURNS; turn++) {
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: cfg.model,
            messages,
            tools,
            tool_choice: forceAnswer ? 'none' : 'auto',
            temperature: cfg.temperature,
            max_tokens: cfg.maxTokens,
            stream: false,
            // thinking 억제(느림 방지) — /v1 호환 게이트웨이용 플래그. 미지원 서버는 무시.
            enable_thinking: false,
            chat_template_kwargs: { enable_thinking: false },
          }),
        });
      } catch (e) {
        transcript.push(`❌ 네트워크 오류: ${(e as Error).message}`);
        break;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        transcript.push(`❌ ${res.status} ${res.statusText} — ${body}\n(이 엔드포인트가 tools 파라미터를 거부했을 수 있음 = function calling 미지원)`);
        break;
      }
      const json = (await res.json()) as any;
      const msg = json?.choices?.[0]?.message ?? {};
      const toolCalls = msg.tool_calls as { id?: string; function?: { name?: string; arguments?: string } }[] | undefined;

      if (toolCalls && toolCalls.length > 0) {
        transcript.push(`— 턴 ${turn}: 🔧 도구 호출 ${toolCalls.length}건`);
        if (msg.content) transcript.push(`  (동반 텍스트) ${msg.content}`);
        // assistant 턴(도구 호출 포함)을 그대로 누적
        messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: toolCalls });
        for (const tc of toolCalls) {
          const name = tc.function?.name ?? '?';
          let args: any = {};
          try { args = JSON.parse(tc.function?.arguments ?? '{}'); } catch { /* 인자 파싱 실패 */ }
          transcript.push(`  → ${name}(${JSON.stringify(args)})`);
          let result: string;
          if (name === 'read_file') {
            const s = Number.isFinite(args.start_line) ? Math.max(1, args.start_line) : 1;
            const e = Number.isFinite(args.end_line) ? Math.min(lines.length, args.end_line) : lines.length;
            const sig = `${s}-${e}`;
            const whole = s === 1 && e === lines.length;
            const slice = lines.slice(s - 1, e).join('\n');
            result = slice;
            transcript.push(`     ↩ ${s}~${e}줄 반환 (${slice.length}자${whole ? ', 전체' : ', 부분'})`);
            if (servedSignatures.has(sig)) {
              forceAnswer = true; // 같은 구간 재요청 = 루프 → 종료
              transcript.push(`     ⚠️ 같은 구간 재요청 감지 → 답변 강제`);
            }
            servedSignatures.add(sig);
            readCount += 1;
            if (readCount >= MAX_READS) {
              forceAnswer = true;
              transcript.push(`     ⚠️ 누적 읽기 ${readCount}회(상한 ${MAX_READS}) → 답변 강제`);
            }
          } else {
            result = `알 수 없는 도구: ${name}`;
          }
          messages.push({ role: 'tool', tool_call_id: tc.id ?? '', content: result });
        }
        if (forceAnswer) {
          transcript.push(`  ⓘ 다음 턴은 답변 강제(tool_choice:none)`);
          messages.push({
            role: 'user',
            content: '이제 추가로 read_file을 호출하지 말고, 읽은 내용을 바탕으로 요청한 수정이 반영된 전체 코드를 출력하세요.',
          });
        }
        continue;
      }

      // 도구 호출 없음 → 최종 답
      transcript.push(`— 턴 ${turn}: ✅ 최종 응답 (도구 호출 없음)`);
      transcript.push(msg.content ?? '(빈 응답)');
      this._post({ type: 'probeOutput', variant: 'tool', status: 'ok', content: transcript.join('\n'), promptChars: promptCharsFirst });
      return;
    }

    // 루프 종료(도구만 반복하다 끝났거나 오류)
    this._post({
      type: 'probeOutput',
      variant: 'tool',
      status: transcript.some((t) => t.startsWith('❌')) ? 'error' : 'ok',
      content: transcript.join('\n') || '(응답 없음)',
      promptChars: promptCharsFirst,
    });
  }

  private _post(msg: HostToWebviewMessage): void {
    this._view?.webview.postMessage(msg);
  }

  private _buildHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js'));
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.css'));
    const nonce = Array.from(
      { length: 32 },
      () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)],
    ).join('');

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             script-src 'nonce-${nonce}';
             style-src ${webview.cspSource} 'unsafe-inline';
             font-src ${webview.cspSource};" />
  <link rel="stylesheet" href="${cssUri}" />
  <title>슬라이싱 실험</title>
</head>
<body data-mode="slice-probe">
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
