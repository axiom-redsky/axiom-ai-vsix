import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { locateEditRegion } from '../ai/RegionEdit';
import { buildHybridPrompt } from '../ai/RegionEditService';
import { analyzeInputQuality } from '../ai/RegionInputQuality';
import { splitIntoSections, scoreSections, selectByBudget, extractApiPaths, matchedApiPaths, formatExactPathDirective, tokenizeQuery } from '../ai/SectionExtractor';
import { ExtensionConfig } from '../config/ExtensionConfig';
import { LlmService } from '../ai/LlmService';
import type { ChatMessage } from '../ai/types';
import type { WebviewToHostMessage, HostToWebviewMessage, RegionIoInput, RegionIoOutput } from '../types/messages';

/**
 * 영역(하이브리드) 편집 입·출력 점검 패널.
 *
 * 목적: "axiom이 하이브리드 방식으로 모델에 보내는 **영역별 분리 입력**과, 모델이 돌려준
 * **원시 출력**이 현시점에 얼마나 정확한가"를 적용/디스크 반영 없이 눈으로 확인한다.
 *
 * 슬라이스 실험 패널(SliceProbeProvider)의 hybrid 모드와 달리, 이 패널은 프롬프트를 재구현하지
 * 않고 **운영 경로와 동일한** `locateEditRegion` + `buildHybridPrompt`를 그대로 호출한다.
 * (재구현 미러는 본체와 갈라져 — filterSection·backingSection 누락 실측 — 점검을 거짓으로 만든다.)
 * 따라서 여기서 보는 입력은 RegionEditService.runHybridRegionEdit가 모델에 보내는 것과 1:1이다.
 *
 * 합성/게이트(splice·structural 삽입·의존성 폐쇄)는 이 패널의 관심이 아니다 — 그건 슬라이스
 * 패널의 hybrid 모드가 다룬다. 여기선 "분리 입력 ↔ 원시 출력"만 본다.
 */
export class RegionIoProbeProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'axiom-ai.regionIoPanel';

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
        case 'regionIoPickFile':
          await this._pickFile();
          break;
        case 'regionIoUseActiveFile':
          this._useActiveFile();
          break;
        case 'runRegionIo':
          await this._run(msg.filePath, msg.query);
          break;
      }
    });
  }

  private async _pickFile(): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { 'TS/TSX': ['ts', 'tsx', 'js', 'jsx'] },
      openLabel: '점검할 파일 선택',
    });
    if (picked && picked[0]) {
      this._post({ type: 'regionIoFilePicked', filePath: picked[0].fsPath });
    }
  }

  private _useActiveFile(): void {
    const active = vscode.window.activeTextEditor?.document.fileName;
    if (active) {
      this._post({ type: 'regionIoFilePicked', filePath: active });
    } else {
      this._post({ type: 'regionIoError', message: '활성 에디터에 열린 파일이 없습니다.' });
    }
  }

  private async _run(filePath: string, query: string): Promise<void> {
    if (!filePath || !query.trim()) {
      this._post({ type: 'regionIoError', message: '파일 경로와 질문을 모두 입력하세요.' });
      return;
    }
    let source: string;
    try {
      source = fs.readFileSync(filePath, 'utf-8');
    } catch (e) {
      this._post({ type: 'regionIoError', message: `파일을 읽을 수 없습니다: ${(e as Error).message}` });
      return;
    }

    // ① 위치결정 — 운영과 동일한 locateEditRegion.
    const loc = locateEditRegion(source, query);
    // ② 참조 스펙 주입(운영 region 경로와 동일하게 — 응답 타입·쿼리 파라미터 추측 방지).
    const referencedSpec = await this._loadReferencedSpec(query, filePath);

    // ③ 분리 입력 구성 — 운영 buildHybridPrompt를 그대로 호출(미러 아님).
    const systemPrompt = buildHybridPrompt(
      loc.depsHeader,
      loc.region,
      loc.startLine,
      loc.endLine,
      referencedSpec || undefined,
      loc.backingDecls,
      query,
      loc.controlInventory,
    );

    const input: RegionIoInput = {
      filePath,
      query,
      sourceChars: source.length,
      safety: { ok: loc.safety.ok, gate: loc.safety.gate, reason: loc.safety.reason },
      locate: {
        bestLine: loc.bestLine,
        bestScore: loc.bestScore,
        matched: loc.matched,
        startLine: loc.startLine,
        endLine: loc.endLine,
      },
      sections: {
        region: loc.region,
        depsHeader: loc.depsHeader,
        backingDecls: loc.backingDecls,
        referencedSpec,
        controlInventory: loc.controlInventory,
      },
      systemPrompt,
      systemPromptChars: systemPrompt.length,
      quality: (() => {
        const q = analyzeInputQuality(source, query);
        return { adequate: q.adequate, dietRatio: q.leanness.dietRatio, flags: q.flags };
      })(),
    };
    // 분리 입력을 먼저 보내 — 모델 응답을 기다리는 동안 사용자가 입력을 먼저 검토하게.
    this._post({ type: 'regionIoInput', input });

    // 안전 게이트 차단 시 운영은 모델을 부르지 않고 full로 폴백한다. 점검에서도 동일하게 모델 호출
    // 생략하고 사유만 알린다(잘못된 위치로 splice될 입력을 모델에 보내는 게 의미 없으므로).
    if (!loc.safety.ok) {
      this._post({
        type: 'regionIoOutput',
        output: {
          status: 'error',
          error: `안전 게이트 차단(${loc.safety.gate}) → 운영에선 모델 미호출, full 입력으로 폴백합니다.\n사유: ${loc.safety.reason}`,
          rawOutput: '',
          parsed: { regionFound: false, region: '', hooks: [], imports: [], replaces: [] },
        },
      });
      this._post({ type: 'regionIoDone' });
      return;
    }

    // ④ 모델 호출 — 운영과 동일한 LlmService.streamChat(provider·thinking 억제·재시도 동일).
    let rawOutput = '';
    let err = '';
    try {
      rawOutput = await this._callLlm(systemPrompt, query);
    } catch (e) {
      err = (e as Error).message;
    }

    if (err) {
      this._post({
        type: 'regionIoOutput',
        output: { status: 'error', error: err, rawOutput: '', parsed: { regionFound: false, region: '', hooks: [], imports: [], replaces: [] } },
      });
      this._post({ type: 'regionIoDone' });
      return;
    }

    // ⑤ 영역별 파싱 — RegionEditService.runHybridRegionEdit와 동일한 추출 규칙(동기화 유지).
    const output = this._parseOutput(rawOutput);
    this._post({ type: 'regionIoOutput', output });
    this._post({ type: 'regionIoDone' });
  }

  /**
   * 모델 원시 출력에서 <region>/<hook>/<import>를 파싱한다.
   * ⚠ RegionEditService.runHybridRegionEdit의 파싱 블록과 동일하게 유지해야 점검이 정확하다.
   */
  private _parseOutput(modelOut: string): RegionIoOutput {
    const stripFences = (s: string): string => {
      const m = s.match(/```[a-zA-Z]*\n([\s\S]*?)\n```/);
      return (m ? m[1] : s).replace(/\s+$/, '');
    };
    const regionMatch = modelOut.match(/<region>([\s\S]*?)<\/region>/);
    const hookMatches = [...modelOut.matchAll(/<hook>([\s\S]*?)<\/hook>/g)].map((m) => m[1].trim());
    const importMatches = [...modelOut.matchAll(/<import\s+([^>]*?)\/?>/g)].map((m) => m[1]);
    const replaces = [...modelOut.matchAll(/<replace\s+anchor\s*=\s*"([^"]*)"\s*>([\s\S]*?)<\/replace>/g)]
      .map((m) => ({ anchor: m[1].trim(), replacement: stripFences(m[2]).replace(/^\n+/, '').replace(/\s+$/, '') }))
      .filter((b) => b.anchor && b.replacement.trim());

    const region = regionMatch ? stripFences(regionMatch[1]).replace(/^\n+/, '').replace(/\s+$/, '') : '';
    const imports = importMatches
      .map((attrs) => {
        const mod = attrs.match(/module\s*=\s*"([^"]*)"/)?.[1] ?? '';
        const named = attrs.match(/named\s*=\s*"([^"]*)"/)?.[1];
        const def = attrs.match(/def\s*=\s*"([^"]*)"/)?.[1];
        const req: { module: string; named?: string[]; def?: string } = { module: mod };
        if (named) req.named = named.split(',').map((s) => s.trim()).filter(Boolean);
        if (def) req.def = def;
        return req;
      })
      .filter((r) => r.module);

    return {
      status: 'ok',
      rawOutput: modelOut,
      parsed: { regionFound: !!regionMatch, region, hooks: hookMatches, imports, replaces },
    };
  }

  /**
   * 운영과 동일한 LlmService.streamChat을 재사용한다(설정 100% 동일 적용).
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

  /**
   * 쿼리에 명시된 참조 파일(예: `/plan/api-spec.md`)을 읽어 region 프롬프트 주입 블록으로 만든다.
   * ⚠ SliceProbeProvider._loadReferencedSpec / ChatViewProvider._loadReferencedFiles의 경량 미러 —
   * region 경로의 스펙 주입을 점검에서도 동일하게 재현하기 위함이다.
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
  <title>영역편집 입출력 점검</title>
</head>
<body data-mode="region-io">
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
