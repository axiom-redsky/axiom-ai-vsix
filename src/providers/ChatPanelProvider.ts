import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ExtensionConfig } from '../config/ExtensionConfig';
import { LlmService } from '../ai/LlmService';
import type { WebviewToHostMessage, HostToWebviewMessage, AxiomSettings } from '../types/messages';

export class ChatPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'axiom-ai.chatPanel';

  private _view?: vscode.WebviewView;

  /**
   * 연결 테스트가 성공(온라인 확인)했을 때 호출된다. 채팅 패널(ChatViewProvider)의 토큰 메터를
   * 오프라인 → 온라인으로 즉시 되돌리는 데 쓰인다. extension.ts에서 배선한다.
   */
  public onConnectionOnline?: () => void;

  constructor(private readonly _extensionUri: vscode.Uri) {}

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
        case 'ready':
          this._postStatus(ExtensionConfig.getLlmConfig().model);
          break;
        case 'openChat':
          vscode.commands.executeCommand('axiom-ai.openChat');
          break;
        case 'clearHistory':
          vscode.commands.executeCommand('axiom-ai.clearHistory');
          break;
        case 'getSettings':
          this._handleGetSettings();
          break;
        case 'updateSettings':
          await this._handleUpdateSettings(msg.settings);
          break;
        case 'pickRagFile':
          await this._handlePickRagFile();
          break;
        case 'pickRagFolder':
          await this._handlePickRagFolder();
          break;
        case 'removeRagFile':
          await this._handleRemoveRagFile(msg.filePath);
          break;
        case 'clearRagFolder':
          await this._handleClearRagFolder();
          break;
        case 'openRagGuide':
          await this._handleOpenRagGuide();
          break;
        case 'createRagTemplate':
          await this._handleCreateRagTemplate();
          break;
        case 'testConnection':
          await this._handleTestConnection(msg.llm);
          break;
      }
    });
  }

  clearHistory(): void {}

  // ─── Settings 핸들러 ────────────────────────────────────────────

  private _handleGetSettings(): void {
    const llm = ExtensionConfig.getLlmConfig();
    const rag = ExtensionConfig.getUserRagSources();
    const settings: AxiomSettings = {
      llm: {
        endpoint:    llm.endpoint,
        model:       llm.model,
        apiKey:      llm.apiKey,
        temperature: llm.temperature,
        maxTokens:   llm.maxTokens,
        contextWindow: llm.contextWindow,
        provider:    llm.provider,
      },
      rag: {
        userRagFolder:   rag.folder,
        additionalFiles: rag.files,
      },
      project: {
        axiomFolder:         ExtensionConfig.getSddAxiomFolder(),
        regionEdit:          ExtensionConfig.isRegionEditEnabled(),
        composeBinding:      ExtensionConfig.isComposeBindingEnabled(),
        regionVerify:        ExtensionConfig.isRegionVerifyEnabled(),
        anchorFirstEdit:     ExtensionConfig.isAnchorFirstEditEnabled(),
        patchFirstEdit:      ExtensionConfig.isPatchFirstEditEnabled(),
        intentClassifier:    ExtensionConfig.isIntentClassifierEnabled(),
        pageCreationLlmMode: ExtensionConfig.isPageCreationLlmMode(),
        logSystemPrompt:     ExtensionConfig.isLogSystemPromptEnabled(),
      },
      advanced: ExtensionConfig.getAdvancedSettings(),
    };
    this._post({ type: 'settingsLoaded', settings });
  }

  /**
   * 설정값을 Global에 쓰되, 더 높은 우선순위 스코프(Workspace/WorkspaceFolder)에 같은 키의 override가
   * 남아 있으면 그 스코프도 같은 값으로 덮어쓴다. VSCode 설정 우선순위는 Folder > Workspace > Global 이라,
   * Global에만 저장하면 프로젝트 `.vscode/settings.json` 등에 옛 값(예: maxTokens 16384)이 있을 때
   * 읽기 시점에 그게 이겨 UI가 "저장했는데 옛 값으로 되돌아감"을 겪는다(실측 버그). 저장을 authoritative하게 만든다.
   */
  private async _updateCfgSticky(
    cfg: vscode.WorkspaceConfiguration,
    key: string,
    value: unknown,
  ): Promise<void> {
    await cfg.update(key, value, vscode.ConfigurationTarget.Global);
    const ins = cfg.inspect(key);
    if (ins?.workspaceValue !== undefined) {
      await cfg.update(key, value, vscode.ConfigurationTarget.Workspace);
    }
    if (ins?.workspaceFolderValue !== undefined) {
      await cfg.update(key, value, vscode.ConfigurationTarget.WorkspaceFolder);
    }
  }

  private async _handleUpdateSettings(partial: Partial<AxiomSettings>): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('axiom-ai');

    if (partial.llm) {
      const llm = partial.llm;
      // 머신(전역) 단위 — LLM 연결·신원. 한 번 설정하면 모든 프로젝트 재사용.
      // (상위 스코프 override가 있으면 함께 갱신 — _updateCfgSticky 참고.)
      if (llm.endpoint   !== undefined) {
        await this._updateCfgSticky(cfg, 'llm.endpoint',    llm.endpoint);
        await cfg.update('server.endpoint', '',              vscode.ConfigurationTarget.Global);
      }
      if (llm.model      !== undefined) await this._updateCfgSticky(cfg, 'llm.model',        llm.model);
      if (llm.provider   !== undefined) await this._updateCfgSticky(cfg, 'llm.provider',     llm.provider);
      if (llm.temperature !== undefined) await this._updateCfgSticky(cfg, 'llm.temperature', llm.temperature);
      if (llm.maxTokens  !== undefined) await this._updateCfgSticky(cfg, 'llm.maxTokens',    llm.maxTokens);
      if (llm.contextWindow !== undefined) await this._updateCfgSticky(cfg, 'llm.contextWindow', llm.contextWindow);
      // apiKey만 SecretStorage(키체인) — 평문·Settings Sync 유출 차단.
      if (llm.apiKey     !== undefined) await ExtensionConfig.setApiKey(llm.apiKey);
    }

    if (partial.rag) {
      const rag = partial.rag;
      if (rag.userRagFolder   !== undefined) await cfg.update('rag.userRagFolder',  rag.userRagFolder,   vscode.ConfigurationTarget.Global);
      if (rag.additionalFiles !== undefined) await cfg.update('rag.additionalFiles', rag.additionalFiles, vscode.ConfigurationTarget.Global);
    }

    if (partial.project) {
      const proj = partial.project;
      // axiomFolder는 부트스트랩(파일 위치 자체를 정함) → 전역 settings.json.
      if (proj.axiomFolder !== undefined) await cfg.update('sdd.axiomFolder', proj.axiomFolder, vscode.ConfigurationTarget.Global);
      // 나머지 프로젝트 키 → <axiomFolder>/axiom.config.json (자동 생성). 빈 객체는 기록하지 않는다.
      const fileValues: Record<string, unknown> = {};
      if (proj.regionEdit          !== undefined) fileValues['experimental.regionEdit']          = proj.regionEdit;
      if (proj.composeBinding      !== undefined) fileValues['experimental.composeBinding']      = proj.composeBinding;
      if (proj.regionVerify        !== undefined) fileValues['experimental.regionVerify']        = proj.regionVerify;
      if (proj.anchorFirstEdit     !== undefined) fileValues['experimental.anchorFirstEdit']     = proj.anchorFirstEdit;
      if (proj.patchFirstEdit      !== undefined) fileValues['experimental.patchFirstEdit']      = proj.patchFirstEdit;
      if (proj.intentClassifier    !== undefined) fileValues['experimental.intentClassifier']    = proj.intentClassifier;
      if (proj.pageCreationLlmMode !== undefined) fileValues['experimental.pageCreationLlmMode'] = proj.pageCreationLlmMode;
      if (proj.logSystemPrompt     !== undefined) fileValues['debug.logSystemPrompt']            = proj.logSystemPrompt;
      if (Object.keys(fileValues).length > 0) {
        const ok = await ExtensionConfig.setProjectConfigValues(fileValues);
        if (!ok) vscode.window.showWarningMessage('프로젝트 설정을 저장할 워크스페이스가 없습니다. 폴더를 연 뒤 다시 저장해주세요.');
      }
    }

    if (partial.advanced) {
      const a = partial.advanced;
      // thinking은 머신(전역) 단위 — 모델/게이트웨이 호환 설정.
      if (a.injectNoThink      !== undefined) await cfg.update('llm.thinking.injectNoThink',      a.injectNoThink,      vscode.ConfigurationTarget.Global);
      if (a.sendThinkingParams !== undefined) await cfg.update('llm.thinking.sendThinkingParams', a.sendThinkingParams, vscode.ConfigurationTarget.Global);

      // 나머지 고급 튜닝 → 프로젝트 파일(axiom.config.json). 평탄화 필드 ↔ dotted 설정 키 매핑.
      const ADVANCED_KEY_MAP: [keyof typeof a, string][] = [
        ['promptDietQnaGating',          'promptDiet.qnaGating'],
        ['adaptiveBudgetEnabled',        'promptDiet.adaptiveBudget.enabled'],
        ['adaptiveBudgetFloorChars',     'promptDiet.adaptiveBudget.floorChars'],
        ['adaptiveBudgetTargetRatio',    'promptDiet.adaptiveBudget.targetRatio'],
        ['adaptiveBudgetCharsPerToken',  'promptDiet.adaptiveBudget.charsPerToken'],
        ['multiPatchEnabled',            'multiPatch.enabled'],
        ['multiPatchMaxPatches',         'multiPatch.maxPatches'],
        ['multiPatchMinContextLines',    'multiPatch.minContextLines'],
        ['multiPatchGroundedRetry',      'multiPatch.groundedRetry'],
        ['multiPatchFuzzyLocateThreshold', 'multiPatch.fuzzyLocateThreshold'],
        ['multiPatchRippleGuard',        'multiPatch.rippleGuard'],
        ['multiPatchAutoFullFallback',   'multiPatch.autoFullFallback'],
        ['lineEditEnabled',              'lineEdit.enabled'],
        ['lineEditRequireAnchor',        'lineEdit.requireAnchor'],
        ['lineEditAnchorSearchRadius',   'lineEdit.anchorSearchRadius'],
        ['scenarioCCompactModes',        'scenarioC.compactModes'],
        ['qnaAntiRepeatEnabled',         'llm.qnaAntiRepeat.enabled'],
        ['qnaAntiRepeatRepeatPenalty',   'llm.qnaAntiRepeat.repeatPenalty'],
        ['qnaAntiRepeatFrequencyPenalty', 'llm.qnaAntiRepeat.frequencyPenalty'],
        ['qnaAntiRepeatPresencePenalty', 'llm.qnaAntiRepeat.presencePenalty'],
        ['offlineFallback',              'server.offlineFallback'],
        ['requireComplianceTags',        'sdd.requireComplianceTags'],
        ['userStubsFolder',              'stubs.userStubsFolder'],
        ['externalCorpusEnabled',        'rag.externalCorpusEnabled'],
        ['validateExternalCorpus',       'rag.validateExternalCorpus'],
      ];
      const advValues: Record<string, unknown> = {};
      for (const [field, key] of ADVANCED_KEY_MAP) {
        if (a[field] !== undefined) advValues[key] = a[field];
      }
      if (Object.keys(advValues).length > 0) {
        const ok = await ExtensionConfig.setProjectConfigValues(advValues);
        if (!ok) vscode.window.showWarningMessage('고급 설정을 저장할 워크스페이스가 없습니다. 폴더를 연 뒤 다시 저장해주세요.');
      }
    }

    // 저장 후 최신값을 웹뷰에 다시 전송
    this._handleGetSettings();

    // 상태 배지 모델명 업데이트
    this._postStatus(ExtensionConfig.getLlmConfig().model);
  }

  private async _handlePickRagFile(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: true,
      canSelectFolders: false,
      filters: { 'Markdown 파일': ['md'] },
      title: 'RAG 지식 파일 선택',
    });
    if (!uris || uris.length === 0) return;

    const cfg = vscode.workspace.getConfiguration('axiom-ai');
    const current = cfg.get<string[]>('rag.additionalFiles', []);
    const toAdd = uris.map((u) => u.fsPath).filter((p) => !current.includes(p));
    if (toAdd.length === 0) return;

    await cfg.update('rag.additionalFiles', [...current, ...toAdd], vscode.ConfigurationTarget.Global);

    for (const p of toAdd) {
      this._post({ type: 'ragFileAdded', filePath: p });
    }
  }

  private async _handlePickRagFolder(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      canSelectFolders: true,
      canSelectFiles: false,
      title: 'RAG 지식 폴더 선택',
    });
    if (!uris || uris.length === 0) return;

    const folderPath = uris[0].fsPath;
    const cfg = vscode.workspace.getConfiguration('axiom-ai');
    await cfg.update('rag.userRagFolder', folderPath, vscode.ConfigurationTarget.Global);
    this._post({ type: 'ragFolderSet', folderPath });
  }

  private async _handleRemoveRagFile(filePath: string): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('axiom-ai');
    const current = cfg.get<string[]>('rag.additionalFiles', []);
    const updated = current.filter((p) => p !== filePath);
    await cfg.update('rag.additionalFiles', updated, vscode.ConfigurationTarget.Global);
    this._post({ type: 'ragFileRemoved', filePath });
  }

  private async _handleClearRagFolder(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('axiom-ai');
    await cfg.update('rag.userRagFolder', '', vscode.ConfigurationTarget.Global);
    this._post({ type: 'ragFolderSet', folderPath: '' });
  }

  /** RAG 작성 가이드(번들 마크다운)를 VSCode 내장 마크다운 미리보기로 연다. */
  private async _handleOpenRagGuide(): Promise<void> {
    const guideUri = vscode.Uri.joinPath(this._extensionUri, 'media', 'guide', 'rag-authoring-guide.md');
    try {
      // 렌더링된 미리보기로 열어 "눈으로 보는 문서" 경험을 준다. 미리보기 실패 시 일반 에디터로 폴백.
      await vscode.commands.executeCommand('markdown.showPreview', guideUri);
    } catch {
      await vscode.window.showTextDocument(guideUri);
    }
  }

  /**
   * RAG 폴더에 시작용 템플릿(_index.md + example-knowledge.md)을 생성한다.
   * - userRagFolder가 이미 지정돼 있으면 그 폴더에, 없으면 폴더 선택을 받아 지정까지 한다.
   * - 기존 파일은 덮어쓰지 않는다(이미 있으면 건너뛴다).
   */
  private async _handleCreateRagTemplate(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('axiom-ai');
    let folder = cfg.get<string>('rag.userRagFolder', '').trim();

    if (!folder) {
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        canSelectFolders: true,
        canSelectFiles: false,
        title: 'RAG 템플릿을 생성할 폴더 선택',
        openLabel: '이 폴더에 생성',
      });
      if (!picked || picked.length === 0) return;
      folder = picked[0].fsPath;
    }

    try {
      fs.mkdirSync(folder, { recursive: true });

      const created: string[] = [];
      const skipped: string[] = [];
      const writeIfAbsent = (name: string, content: string): void => {
        const target = path.join(folder, name);
        if (fs.existsSync(target)) {
          skipped.push(name);
        } else {
          fs.writeFileSync(target, content, 'utf-8');
          created.push(name);
        }
      };

      writeIfAbsent('_index.md', ChatPanelProvider._RAG_INDEX_TEMPLATE);
      writeIfAbsent('example-knowledge.md', ChatPanelProvider._RAG_EXAMPLE_TEMPLATE);

      // 폴더가 아직 등록 안 됐으면 이 폴더를 RAG 폴더로 지정한다.
      if (cfg.get<string>('rag.userRagFolder', '').trim() !== folder) {
        await cfg.update('rag.userRagFolder', folder, vscode.ConfigurationTarget.Global);
        this._post({ type: 'ragFolderSet', folderPath: folder });
      }

      // 생성한 예시 파일을 열어 바로 편집할 수 있게 한다.
      const examplePath = path.join(folder, 'example-knowledge.md');
      if (fs.existsSync(examplePath)) {
        await vscode.window.showTextDocument(vscode.Uri.file(examplePath));
      }

      const parts: string[] = [];
      if (created.length) parts.push(`생성: ${created.join(', ')}`);
      if (skipped.length) parts.push(`이미 있어 건너뜀: ${skipped.join(', ')}`);
      vscode.window.showInformationMessage(`RAG 템플릿 — ${parts.join(' · ')}`);
    } catch (err) {
      vscode.window.showErrorMessage(`RAG 템플릿 생성 실패: ${(err as Error).message}`);
    }
  }

  private static readonly _RAG_INDEX_TEMPLATE = `# 지식 인덱스
#
# (선택) 키워드 라우팅을 한곳에서 관리하고 싶을 때만 사용합니다.
# 이 파일이 있으면 각 문서의 frontmatter tags 대신 아래 keywords가 라우팅 기준이 됩니다.
# 필요 없으면 이 파일을 지워도 됩니다(각 .md의 tags로 자동 동작).

- keywords: [예시키워드, example, 샘플]
  files: [example-knowledge.md]
`;

  private static readonly _RAG_EXAMPLE_TEMPLATE = `---
title: 예시 지식 문서
category: example
tags: [예시키워드, example, 샘플, 작성예시]
---

# 예시 지식 문서

이 파일을 복사해 우리 프로젝트만의 지식을 채워 넣으세요.
(작성 규칙은 설정 화면의 "작성 가이드 보기" 버튼에서 확인할 수 있습니다.)

## 작성 요령
- 맨 위 frontmatter의 title / category / tags 를 모두 채웁니다.
- tags 에는 사용자가 질문할 때 쓸 단어를 한글·영어·동의어로 충분히 넣습니다.
- 본문은 ## 제목으로 주제별로 나눕니다(검색이 섹션 단위로 이뤄집니다).

## 예시 규칙
- 여기에 "해야 할 것 / 하지 말 것"을 명확히 적으면 AI가 더 잘 지킵니다.
`;

  private async _handleTestConnection(llm: AxiomSettings['llm']): Promise<void> {
    const modelsUrl = new URL('/v1/models', llm.endpoint).toString();
    const chatUrl = new URL('/v1/chat/completions', llm.endpoint).toString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const apiKey = llm.apiKey.trim();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = /^(Bearer|Basic)\s+/i.test(apiKey) ? apiKey : `Bearer ${apiKey}`;
    }

    try {
      // 1단계: GET /v1/models 로 서버 생존 + 모델명 등록 여부 확인 (인증 없이 동작하는 서버 포함)
      const modelsRes = await fetch(modelsUrl, { method: 'GET', headers, signal: controller.signal });
      if (modelsRes.ok) {
        const ids = await this._extractModelIds(modelsRes);
        // Ollama는 태그를 생략하면 :latest로 해석한다. /v1/models는 'name:latest'로 보고하지만
        // 설정엔 'name'만 넣는 경우가 많으므로 :latest를 정규화해 비교한다(채팅은 정상 동작).
        const stripLatest = (s: string) => s.replace(/:latest$/, '');
        const want = stripLatest(llm.model);
        if (ids.some((id) => stripLatest(id) === want)) {
          const note = await this._autoAlignProvider(llm, headers, controller.signal);
          this._post({ type: 'connectionTestResult', ok: true, endpoint: llm.endpoint, detail: `${llm.model} 연결 성공${note}` });
          this.onConnectionOnline?.();
          return;
        }
        if (ids.length > 0) {
          // 서버는 살아있으나 설정한 모델명이 목록에 없음 → 채팅 시 404가 날 상황을 미리 알려준다.
          const preview = ids.slice(0, 8).join(', ');
          this._post({ type: 'connectionTestResult', ok: false, endpoint: llm.endpoint,
            detail: `서버 연결됨 — '${llm.model}' 모델이 서버에 없습니다. 모델명을 확인해주세요. 사용 가능: ${preview}${ids.length > 8 ? ` 외 ${ids.length - 8}개` : ''}` });
          return;
        }
        // 목록을 못 읽은 경우(빈 응답·비표준 스키마)만 2단계 추론 호출로 확인한다.
      }
      if (modelsRes.status === 401 || modelsRes.status === 403) {
        const wwwAuth = modelsRes.headers.get('www-authenticate') ?? '';
        const authType = wwwAuth.includes('Basic') ? 'Basic Auth' : wwwAuth.includes('Bearer') ? 'Bearer Token' : '인증';
        this._post({ type: 'connectionTestResult', ok: false, endpoint: llm.endpoint,
          detail: `서버 연결됨 — ${authType} 필요 (${modelsRes.status}). API 키 칸에 인증 값을 입력하거나, 서버 인증 설정을 확인해주세요.` });
        return;
      }

      // 2단계: POST /v1/chat/completions 로 실제 추론 가능 여부 확인
      const chatRes = await fetch(chatUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: llm.model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1, stream: false }),
        signal: controller.signal,
      });

      if (chatRes.ok || chatRes.status === 200) {
        const note = await this._autoAlignProvider(llm, headers, controller.signal);
        this._post({ type: 'connectionTestResult', ok: true, endpoint: llm.endpoint, detail: `${llm.model} 연결 성공${note}` });
        this.onConnectionOnline?.();
        return;
      }
      if (chatRes.status === 401 || chatRes.status === 403) {
        const wwwAuth = chatRes.headers.get('www-authenticate') ?? '';
        const authType = wwwAuth.includes('Basic') ? 'Basic Auth' : wwwAuth.includes('Bearer') ? 'Bearer Token' : '인증';
        this._post({ type: 'connectionTestResult', ok: false, endpoint: llm.endpoint,
          detail: `서버 연결됨 — ${authType} 필요 (${chatRes.status}). API 키 칸에 인증 값을 입력하거나, 서버 인증 설정을 확인해주세요.` });
        return;
      }

      this._post({ type: 'connectionTestResult', ok: false, endpoint: llm.endpoint,
        detail: `서버 응답 오류: ${chatRes.status} ${chatRes.statusText}` });

    } catch (err) {
      const msg = (err as Error).name === 'AbortError'
        ? `연결 시간 초과 (5초) — 엔드포인트 URL과 네트워크를 확인해주세요`
        : `연결 실패: ${(err as Error).message}`;
      this._post({ type: 'connectionTestResult', ok: false, endpoint: llm.endpoint, detail: msg });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 연결 테스트 성공 시 서버 방언을 감지해 axiom-ai.llm.provider를 자동 정렬한다.
   *
   * 동기: 연결 테스트(/v1/*)와 실제 chat(provider별 경로)이 분리돼 있어, provider가 어긋나면
   * "연결 성공인데 chat 404"가 난다(예: 서버는 OpenAI 호환인데 provider=ollama → POST /api/chat 404).
   * 판별 신호는 /api/tags다 — Ollama는 /v1/*·/api/* 둘 다 열지만 vLLM·LM Studio는 /api/tags가 없다.
   * 따라서 /api/tags가 있으면 ollama(/api/chat+think:false가 thinking을 확실히 끔), 없으면 openai로 본다.
   *
   * @returns 사용자에게 덧붙일 안내 문자열(변경 없으면 빈 문자열)
   */
  private async _autoAlignProvider(
    llm: AxiomSettings['llm'],
    headers: Record<string, string>,
    signal: AbortSignal,
  ): Promise<string> {
    let detected: 'openai' | 'ollama';
    try {
      const tagsRes = await fetch(new URL('/api/tags', llm.endpoint).toString(), { method: 'GET', headers, signal });
      // /api/tags 200 = Ollama 네이티브 존재 → ollama. 404 등(res.ok=false) = 비-Ollama → openai.
      detected = tagsRes.ok ? 'ollama' : 'openai';
    } catch {
      // 네트워크/abort 등 감지 불가 → 현재 설정 유지(섣불리 바꾸지 않음).
      return '';
    }

    const cfg = vscode.workspace.getConfiguration('axiom-ai');
    const current = cfg.get<'openai' | 'ollama'>('llm.provider', 'ollama');
    if (current === detected) return '';

    await cfg.update('llm.provider', detected, vscode.ConfigurationTarget.Global);
    return ` · 서버 방언을 '${detected}'로 감지해 provider를 자동 설정했습니다(이전: '${current}'). 이제 채팅도 같은 경로를 씁니다.`;
  }

  /**
   * /v1/models(OpenAI 호환: data[].id) 또는 /api/tags(Ollama: models[].name) 응답에서
   * 모델 식별자 목록을 추출한다. 파싱 불가 시 빈 배열을 반환해 호출부가 추론 호출로 폴백하게 한다.
   */
  private async _extractModelIds(res: Response): Promise<string[]> {
    try {
      const json = (await res.json()) as any;
      const arr = Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json?.models)
          ? json.models
          : [];
      return arr
        .map((m: any) => (typeof m === 'string' ? m : m?.id ?? m?.name))
        .filter((s: any): s is string => typeof s === 'string' && s.length > 0);
    } catch {
      return [];
    }
  }

  // ─── 내부 유틸 ──────────────────────────────────────────────────

  private _postStatus(text: string): void {
    this._post({ type: 'status', text });
  }

  private _post(msg: HostToWebviewMessage): void {
    this._view?.webview.postMessage(msg);
  }

  private _buildHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js'),
    );
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.css'),
    );
    const nonce = Array.from(
      { length: 32 },
      () =>
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[
          Math.floor(Math.random() * 62)
        ],
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
  <title>Axiom AI</title>
</head>
<body data-mode="launcher">
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
