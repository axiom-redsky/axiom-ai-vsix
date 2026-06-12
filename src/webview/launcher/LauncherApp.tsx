import React, { useEffect, useState, useCallback } from 'react';
import { vscode } from '../vscodeApi';
import type { HostToWebviewMessage, AxiomSettings } from '../../types/messages';

type Tab = 'home' | 'settings';

const DEFAULT_PROJECT: NonNullable<AxiomSettings['project']> = {
  axiomFolder: '',
  regionEdit: true,
  intentClassifier: true,
  pageCreationLlmMode: false,
  logSystemPrompt: false,
};

const DEFAULT_ADVANCED: NonNullable<AxiomSettings['advanced']> = {
  promptDietQnaGating: true,
  adaptiveBudgetEnabled: true,
  adaptiveBudgetFloorChars: 1800,
  adaptiveBudgetTargetRatio: 0.45,
  adaptiveBudgetCharsPerToken: 3,
  multiPatchEnabled: true,
  multiPatchMaxPatches: 3,
  multiPatchMinContextLines: 3,
  multiPatchGroundedRetry: true,
  multiPatchFuzzyLocateThreshold: 0.6,
  multiPatchRippleGuard: true,
  lineEditEnabled: true,
  lineEditRequireAnchor: true,
  lineEditAnchorSearchRadius: 3,
  scenarioCCompactModes: true,
  qnaAntiRepeatEnabled: true,
  qnaAntiRepeatRepeatPenalty: 1.3,
  qnaAntiRepeatFrequencyPenalty: 0.3,
  qnaAntiRepeatPresencePenalty: 0.3,
  injectNoThink: true,
  sendThinkingParams: true,
  offlineFallback: true,
  requireComplianceTags: false,
  userStubsFolder: '',
  externalCorpusEnabled: true,
  validateExternalCorpus: true,
};

const DEFAULT_SETTINGS: AxiomSettings = {
  llm: { endpoint: '', model: '', apiKey: '', temperature: 0.2, maxTokens: 8192, contextWindow: 32768, provider: 'ollama' },
  rag: { userRagFolder: '', additionalFiles: [] },
  project: { ...DEFAULT_PROJECT },
  advanced: { ...DEFAULT_ADVANCED },
};

export function LauncherApp(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('home');
  const [model, setModel] = useState<string>('연결 중…');
  const [settings, setSettings] = useState<AxiomSettings>(DEFAULT_SETTINGS);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [connTest, setConnTest] = useState<{ ok: boolean; detail: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    vscode.postMessage({ type: 'ready' });
    vscode.postMessage({ type: 'getSettings' });

    const handler = (event: MessageEvent<HostToWebviewMessage>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'status':
          setModel(msg.text);
          break;
        case 'settingsLoaded':
          setSettings(msg.settings);
          setDirty(false);
          break;
        case 'ragFileAdded':
          setSettings((prev) => ({
            ...prev,
            rag: {
              ...prev.rag,
              additionalFiles: prev.rag.additionalFiles.includes(msg.filePath)
                ? prev.rag.additionalFiles
                : [...prev.rag.additionalFiles, msg.filePath],
            },
          }));
          break;
        case 'ragFileRemoved':
          setSettings((prev) => ({
            ...prev,
            rag: {
              ...prev.rag,
              additionalFiles: prev.rag.additionalFiles.filter((f) => f !== msg.filePath),
            },
          }));
          break;
        case 'ragFolderSet':
          setSettings((prev) => ({
            ...prev,
            rag: { ...prev.rag, userRagFolder: msg.folderPath },
          }));
          break;
        case 'connectionTestResult':
          setTesting(false);
          setConnTest({ ok: msg.ok, detail: msg.detail });
          break;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleLlmChange = useCallback(
    (field: keyof AxiomSettings['llm'], value: string | number) => {
      setSettings((prev) => ({ ...prev, llm: { ...prev.llm, [field]: value } }));
      setDirty(true);
      setSaved(false);
    },
    [],
  );

  const handleProjectChange = useCallback(
    (field: keyof NonNullable<AxiomSettings['project']>, value: string | boolean) => {
      setSettings((prev) => ({
        ...prev,
        project: { ...(prev.project ?? DEFAULT_PROJECT), [field]: value },
      }));
      setDirty(true);
      setSaved(false);
    },
    [],
  );

  const handleAdvancedChange = useCallback(
    (field: keyof NonNullable<AxiomSettings['advanced']>, value: string | number | boolean) => {
      setSettings((prev) => ({
        ...prev,
        advanced: { ...(prev.advanced ?? DEFAULT_ADVANCED), [field]: value },
      }));
      setDirty(true);
      setSaved(false);
    },
    [],
  );

  const handleSave = useCallback(() => {
    vscode.postMessage({ type: 'updateSettings', settings });
    setDirty(false);
    setSaved(true);
    setConnTest(null);
    setTimeout(() => setSaved(false), 2000);
    setModel(settings.llm.model || '연결 중…');
  }, [settings]);

  const handleTestConnection = useCallback(() => {
    setTesting(true);
    setConnTest(null);
    vscode.postMessage({ type: 'testConnection', llm: settings.llm });
  }, [settings.llm]);

  const handlePickRagFile = () => vscode.postMessage({ type: 'pickRagFile' });
  const handlePickRagFolder = () => vscode.postMessage({ type: 'pickRagFolder' });
  const handleRemoveRagFile = (fp: string) =>
    vscode.postMessage({ type: 'removeRagFile', filePath: fp });
  const handleClearRagFolder = () => vscode.postMessage({ type: 'clearRagFolder' });

  return (
    <div className="launcher">
      {/* 탭 네비게이션 + 저장(설정 탭에서만, 항상 보이도록 상단 고정) */}
      <div className="launcher__tabs">
        <button
          className={`launcher__tab${tab === 'home' ? ' launcher__tab--active' : ''}`}
          onClick={() => setTab('home')}
        >
          홈
        </button>
        <button
          className={`launcher__tab${tab === 'settings' ? ' launcher__tab--active' : ''}`}
          onClick={() => setTab('settings')}
        >
          설정
        </button>
        {tab === 'settings' && (
          <button
            className={`launcher__save-btn${dirty ? ' launcher__save-btn--active' : ''}${saved ? ' launcher__save-btn--saved' : ''}`}
            onClick={handleSave}
            disabled={!dirty}
            title="LLM 연결 + 프로젝트 설정을 함께 저장 (RAG 파일은 추가/삭제 시 즉시 반영)"
          >
            {saved ? (
              <svg className="launcher__save-icon" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M13.5 4.5L6.5 11.5L3 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg className="launcher__save-icon" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2.5 2.5h8.3L13.5 5.2V13a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V2.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                <path d="M5 2.5v3.2h5V2.5M5 13.5v-3.8a.5.5 0 0 1 .5-.5h4.5a.5.5 0 0 1 .5.5v3.8" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
            )}
            <span>{saved ? '저장됨' : '저장'}</span>
          </button>
        )}
      </div>

      {tab === 'home' && <HomeTab model={model} />}
      {tab === 'settings' && (
        <SettingsTab
          settings={settings}
          connTest={connTest}
          testing={testing}
          onLlmChange={handleLlmChange}
          onProjectChange={handleProjectChange}
          onAdvancedChange={handleAdvancedChange}
          onTestConnection={handleTestConnection}
          onPickRagFile={handlePickRagFile}
          onPickRagFolder={handlePickRagFolder}
          onRemoveRagFile={handleRemoveRagFile}
          onClearRagFolder={handleClearRagFolder}
        />
      )}
    </div>
  );
}

/* ───────────────────────── Home Tab ───────────────────────── */

function HomeTab({ model }: { model: string }): React.ReactElement {
  const handleOpenChat = () => vscode.postMessage({ type: 'openChat' });
  const handleClearHistory = () => vscode.postMessage({ type: 'clearHistory' });

  return (
    <>
      <div className="launcher__header">
        <div className="launcher__logo">
          <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path
              fill="currentColor"
              d="M18.164,7.931V5.085c0.769-0.359,1.262-1.13,1.266-1.978V3.04c-0.003-1.21-0.983-2.189-2.193-2.193H17.17   c-1.21,0.003-2.189,0.983-2.193,2.193v0.067c0.004,0.849,0.497,1.619,1.266,1.978v2.852c-1.083,0.166-2.103,0.614-2.957,1.301   L5.458,3.142C5.814,1.81,5.023,0.441,3.69,0.085S0.989,0.521,0.633,1.853s0.436,2.701,1.768,3.057   c0.637,0.17,1.316,0.081,1.888-0.247l7.696,5.991c-1.419,2.14-1.38,4.931,0.096,7.032l-2.342,2.342   c-0.188-0.06-0.384-0.092-0.581-0.095c-1.123,0-2.033,0.91-2.033,2.033C7.125,23.09,8.035,24,9.158,24   c1.123,0,2.033-0.91,2.033-2.033l0,0c-0.003-0.197-0.035-0.393-0.095-0.581l2.317-2.317c2.742,2.094,6.662,1.569,8.756-1.172   s1.569-6.662-1.172-8.756c-0.83-0.634-1.806-1.05-2.838-1.209 M17.2,17.308c-1.77-0.004-3.202-1.443-3.198-3.213   c0.004-1.77,1.443-3.202,3.213-3.198c1.768,0.004,3.199,1.439,3.198,3.207c0,1.77-1.435,3.205-3.205,3.205"
            />
          </svg>
        </div>
        <div className="launcher__title-group">
          <h1 className="launcher__title">Axiom AI</h1>
          <p className="launcher__subtitle">Scaffold-Aware Assistant</p>
        </div>
      </div>

      <div className="launcher__model-badge">
        <span className="launcher__model-dot" />
        <span className="launcher__model-name">{model}</span>
      </div>

      <div className="launcher__actions">
        <button className="launcher__primary-btn" onClick={handleOpenChat}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M14 1H2C1.45 1 1 1.45 1 2V11C1 11.55 1.45 12 2 12H5L8 15L11 12H14C14.55 12 15 11.55 15 11V2C15 1.45 14.55 1 14 1Z"
              stroke="currentColor"
              strokeWidth="1.2"
              fill="none"
            />
          </svg>
          새 채팅 시작
        </button>
      </div>

      <div className="launcher__section">
        <p className="launcher__section-title">사용 예시</p>
        <ul className="launcher__tips">
          <li className="launcher__tip">
            <span className="launcher__tip-icon">⌨</span>
            <span>"useApi로 GET 요청하는 코드 짜줘"</span>
          </li>
          <li className="launcher__tip">
            <span className="launcher__tip-icon">🔍</span>
            <span>"이 컴포넌트에 타입 에러가 왜 나?"</span>
          </li>
          <li className="launcher__tip">
            <span className="launcher__tip-icon">✨</span>
            <span>"scaffold 폴더 구조 설명해줘"</span>
          </li>
        </ul>
      </div>

      <div className="launcher__footer">
        <button
          className="launcher__footer-btn"
          onClick={handleClearHistory}
          title="현재 채팅 기록 초기화"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M2 4H12M5 4V2.5C5 2.22 5.22 2 5.5 2H8.5C8.78 2 9 2.22 9 2.5V4M10.5 4L10 11.5C10 11.78 9.78 12 9.5 12H4.5C4.22 12 4 11.78 4 11.5L3.5 4"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
          채팅 기록 초기화
        </button>
      </div>
    </>
  );
}

/* ───────────────────────── Settings Tab ───────────────────────── */

interface SettingsTabProps {
  settings: AxiomSettings;
  connTest: { ok: boolean; detail: string } | null;
  testing: boolean;
  onLlmChange: (field: keyof AxiomSettings['llm'], value: string | number) => void;
  onProjectChange: (field: keyof NonNullable<AxiomSettings['project']>, value: string | boolean) => void;
  onAdvancedChange: (field: keyof NonNullable<AxiomSettings['advanced']>, value: string | number | boolean) => void;
  onTestConnection: () => void;
  onPickRagFile: () => void;
  onPickRagFolder: () => void;
  onRemoveRagFile: (fp: string) => void;
  onClearRagFolder: () => void;
}

function SettingsTab({
  settings,
  connTest,
  testing,
  onLlmChange,
  onProjectChange,
  onAdvancedChange,
  onTestConnection,
  onPickRagFile,
  onPickRagFolder,
  onRemoveRagFile,
  onClearRagFolder,
}: SettingsTabProps): React.ReactElement {
  const project = settings.project ?? DEFAULT_PROJECT;
  return (
    <div className="settings">
      {/* LLM 설정 */}
      <section className="settings__section">
        <h2 className="settings__section-title">LLM 서버 설정</h2>

        <label className="settings__label">
          엔드포인트 URL
          <input
            className="settings__input"
            type="text"
            value={settings.llm.endpoint}
            placeholder="https://..."
            onChange={(e) => onLlmChange('endpoint', e.target.value)}
          />
        </label>

        <label className="settings__label">
          모델명
          <input
            className="settings__input"
            type="text"
            value={settings.llm.model}
            placeholder="예: qwen2.5-coder:14b"
            onChange={(e) => onLlmChange('model', e.target.value)}
          />
        </label>

        <label className="settings__label">
          백엔드 종류 (provider)
          <select
            className="settings__input"
            value={settings.llm.provider ?? 'ollama'}
            onChange={(e) => onLlmChange('provider', e.target.value)}
          >
            <option value="ollama">ollama (네이티브 /api/chat)</option>
            <option value="openai">openai 호환 (/v1/chat/completions)</option>
          </select>
        </label>

        <label className="settings__label">
          API 키 (로컬 서버는 비워 두세요)
          <input
            className="settings__input"
            type="password"
            value={settings.llm.apiKey}
            placeholder="sk-..."
            onChange={(e) => onLlmChange('apiKey', e.target.value)}
          />
        </label>

        <div className="settings__row">
          <label className="settings__label settings__label--half">
            Temperature
            <input
              className="settings__input"
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={settings.llm.temperature}
              onChange={(e) => onLlmChange('temperature', parseFloat(e.target.value))}
            />
          </label>

          <label className="settings__label settings__label--half">
            Max Tokens
            <input
              className="settings__input"
              type="number"
              step="256"
              min="256"
              value={settings.llm.maxTokens}
              onChange={(e) => onLlmChange('maxTokens', parseInt(e.target.value, 10))}
            />
          </label>
        </div>

        <label className="settings__label">
          Context Window (토큰 메터 분모 · 모델 컨텍스트 한도)
          <input
            className="settings__input"
            type="number"
            step="1024"
            min="1024"
            value={settings.llm.contextWindow}
            onChange={(e) => onLlmChange('contextWindow', parseInt(e.target.value, 10))}
          />
        </label>

        <div className="settings__actions-row">
          <button
            className="settings__test-btn"
            onClick={onTestConnection}
            disabled={testing}
          >
            {testing ? '테스트 중…' : '연결 테스트'}
          </button>
        </div>

        {connTest && (
          <div className={`settings__conn-result settings__conn-result--${connTest.ok ? 'ok' : 'fail'}`}>
            {connTest.ok ? '✓' : '✗'} {connTest.detail}
          </div>
        )}
      </section>

      {/* RAG 파일 관리 */}
      <section className="settings__section">
        <h2 className="settings__section-title">RAG 지식 파일 관리</h2>

        {/* 폴더 지정 */}
        <div className="settings__rag-folder">
          <p className="settings__hint">
            폴더를 지정하면 내부의 모든 .md 파일이 RAG 인덱스에 포함됩니다.
          </p>
          <div className="settings__rag-folder-row">
            <span className="settings__rag-folder-path">
              {settings.rag.userRagFolder || '(지정 없음)'}
            </span>
            <div className="settings__rag-folder-actions">
              <button className="settings__rag-btn" onClick={onPickRagFolder}>
                폴더 선택
              </button>
              {settings.rag.userRagFolder && (
                <button
                  className="settings__rag-btn settings__rag-btn--danger"
                  onClick={onClearRagFolder}
                  title="폴더 지정 해제"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 개별 파일 목록 */}
        <div className="settings__rag-files">
          <div className="settings__rag-files-header">
            <span className="settings__hint">개별 MD 파일</span>
            <button className="settings__rag-btn" onClick={onPickRagFile}>
              + 파일 추가
            </button>
          </div>

          {settings.rag.additionalFiles.length === 0 ? (
            <p className="settings__empty">추가된 파일이 없습니다.</p>
          ) : (
            <ul className="settings__rag-list">
              {settings.rag.additionalFiles.map((fp) => (
                <li key={fp} className="settings__rag-item">
                  <span className="settings__rag-item-path" title={fp}>
                    {fp.replace(/\\/g, '/').split('/').pop()}
                  </span>
                  <button
                    className="settings__rag-remove"
                    onClick={() => onRemoveRagFile(fp)}
                    title={fp}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* 프로젝트 설정 — <axiomFolder>/axiom.config.json (axiomFolder만 전역) */}
      <section className="settings__section">
        <h2 className="settings__section-title">프로젝트 설정</h2>
        <p className="settings__hint">
          아래 항목은 현재 프로젝트의 <code>&lt;axiomFolder&gt;/axiom.config.json</code>에 저장됩니다(폴더가 없으면 자동 생성).
          <code>.axiom 폴더</code>만 전역 설정에 저장됩니다.
        </p>

        <label className="settings__label">
          .axiom 폴더 경로
          <input
            className="settings__input"
            type="text"
            value={project.axiomFolder}
            placeholder=".axiom"
            onChange={(e) => onProjectChange('axiomFolder', e.target.value)}
          />
        </label>

        <label className="settings__toggle">
          <input
            type="checkbox"
            checked={project.regionEdit}
            onChange={(e) => onProjectChange('regionEdit', e.target.checked)}
          />
          <span>영역(region) 편집 — experimental.regionEdit</span>
        </label>

        <label className="settings__toggle">
          <input
            type="checkbox"
            checked={project.intentClassifier}
            onChange={(e) => onProjectChange('intentClassifier', e.target.checked)}
          />
          <span>의도 분류기 — experimental.intentClassifier</span>
        </label>

        <label className="settings__toggle">
          <input
            type="checkbox"
            checked={project.pageCreationLlmMode}
            onChange={(e) => onProjectChange('pageCreationLlmMode', e.target.checked)}
          />
          <span>페이지 본문 LLM 생성 — experimental.pageCreationLlmMode</span>
        </label>

        <label className="settings__toggle">
          <input
            type="checkbox"
            checked={project.logSystemPrompt}
            onChange={(e) => onProjectChange('logSystemPrompt', e.target.checked)}
          />
          <span>시스템 프롬프트 로깅 — debug.logSystemPrompt</span>
        </label>
      </section>

      {/* 고급 설정 — 접이식. 대부분 axiom.config.json, thinking만 전역. */}
      <AdvancedSection advanced={settings.advanced ?? DEFAULT_ADVANCED} onChange={onAdvancedChange} />
    </div>
  );
}

/* ───────────────────────── 고급 설정 ───────────────────────── */

type AdvancedField = keyof NonNullable<AxiomSettings['advanced']>;

function AdvancedSection({
  advanced,
  onChange,
}: {
  advanced: NonNullable<AxiomSettings['advanced']>;
  onChange: (field: AdvancedField, value: string | number | boolean) => void;
}): React.ReactElement {
  const toggle = (field: AdvancedField, label: string) => (
    <label className="settings__toggle">
      <input
        type="checkbox"
        checked={Boolean(advanced[field])}
        onChange={(e) => onChange(field, e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );

  const num = (field: AdvancedField, label: string, step = 1) => (
    <label className="settings__label settings__label--half">
      {label}
      <input
        className="settings__input"
        type="number"
        step={step}
        value={advanced[field] as number}
        onChange={(e) => onChange(field, e.target.value === '' ? 0 : Number(e.target.value))}
      />
    </label>
  );

  const text = (field: AdvancedField, label: string, placeholder = '') => (
    <label className="settings__label">
      {label}
      <input
        className="settings__input"
        type="text"
        value={advanced[field] as string}
        placeholder={placeholder}
        onChange={(e) => onChange(field, e.target.value)}
      />
    </label>
  );

  return (
    <details className="settings__advanced">
      <summary className="settings__advanced-summary">고급 설정 (튜닝)</summary>
      <p className="settings__hint">
        대부분 현재 프로젝트의 axiom.config.json에 저장됩니다. thinking 항목만 전역(머신) 설정입니다.
        값이 헷갈리면 건드리지 말고 기본값을 두세요.
      </p>

      <div className="settings__advanced-group">
        <h3 className="settings__advanced-title">프롬프트 다이어트</h3>
        {toggle('promptDietQnaGating', 'Q&A 게이팅 — promptDiet.qnaGating')}
        {toggle('adaptiveBudgetEnabled', '적응형 RAG 예산 — adaptiveBudget.enabled')}
        <div className="settings__row">
          {num('adaptiveBudgetFloorChars', 'floorChars', 100)}
          {num('adaptiveBudgetCharsPerToken', 'charsPerToken', 0.5)}
        </div>
        <div className="settings__row">
          {num('adaptiveBudgetTargetRatio', 'targetRatio', 0.05)}
          <span className="settings__label settings__label--half" />
        </div>
      </div>

      <div className="settings__advanced-group">
        <h3 className="settings__advanced-title">다중 patch</h3>
        {toggle('multiPatchEnabled', '다중 patch 허용 — multiPatch.enabled')}
        {toggle('multiPatchGroundedRetry', 'grounded 재시도 — groundedRetry')}
        {toggle('multiPatchRippleGuard', 'ripple 가드 — rippleGuard')}
        <div className="settings__row">
          {num('multiPatchMaxPatches', 'maxPatches', 1)}
          {num('multiPatchMinContextLines', 'minContextLines', 1)}
        </div>
        <div className="settings__row">
          {num('multiPatchFuzzyLocateThreshold', 'fuzzyLocateThreshold', 0.05)}
          <span className="settings__label settings__label--half" />
        </div>
      </div>

      <div className="settings__advanced-group">
        <h3 className="settings__advanced-title">라인 편집</h3>
        {toggle('lineEditEnabled', 'lines 모드 안내 — lineEdit.enabled')}
        {toggle('lineEditRequireAnchor', 'anchor 검증 — requireAnchor')}
        <div className="settings__row">
          {num('lineEditAnchorSearchRadius', 'anchorSearchRadius', 1)}
          <span className="settings__label settings__label--half" />
        </div>
      </div>

      <div className="settings__advanced-group">
        <h3 className="settings__advanced-title">시나리오 C</h3>
        {toggle('scenarioCCompactModes', '컴팩트 모드 — scenarioC.compactModes')}
      </div>

      <div className="settings__advanced-group">
        <h3 className="settings__advanced-title">Q&amp;A 반복 억제</h3>
        {toggle('qnaAntiRepeatEnabled', '반복 억제 — qnaAntiRepeat.enabled')}
        <div className="settings__row">
          {num('qnaAntiRepeatRepeatPenalty', 'repeatPenalty (ollama)', 0.05)}
          {num('qnaAntiRepeatFrequencyPenalty', 'frequencyPenalty (openai)', 0.05)}
        </div>
        <div className="settings__row">
          {num('qnaAntiRepeatPresencePenalty', 'presencePenalty (openai)', 0.05)}
          <span className="settings__label settings__label--half" />
        </div>
      </div>

      <div className="settings__advanced-group">
        <h3 className="settings__advanced-title">thinking (전역 · 머신)</h3>
        {toggle('injectNoThink', '/no_think 주입 — thinking.injectNoThink')}
        {toggle('sendThinkingParams', 'thinking 파라미터 전송 — sendThinkingParams')}
      </div>

      <div className="settings__advanced-group">
        <h3 className="settings__advanced-title">기타</h3>
        {toggle('offlineFallback', '오프라인 폴백 — server.offlineFallback')}
        {toggle('requireComplianceTags', '컴플라이언스 태그 강제 — sdd.requireComplianceTags')}
        {toggle('externalCorpusEnabled', '외부 corpus 라우팅 — rag.externalCorpusEnabled')}
        {toggle('validateExternalCorpus', '외부 corpus 검증 — rag.validateExternalCorpus')}
        {text('userStubsFolder', '오프라인 stubs 폴더 — stubs.userStubsFolder', '(지정 없음)')}
      </div>
    </details>
  );
}
