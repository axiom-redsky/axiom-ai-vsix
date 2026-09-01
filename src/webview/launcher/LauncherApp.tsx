import React, { useEffect, useState, useCallback } from 'react';
import { vscode } from '../vscodeApi';
import type { HostToWebviewMessage, AxiomSettings } from '../../types/messages';
import { isValidEndpoint, resolveLlmUrls } from '../../ai/llmEndpoint';

type Tab = 'home' | 'settings';

type TPreset = { value: number; label: string };

/**
 * 프리셋 드롭다운 + 직접 입력 겸용 필드(editable combobox).
 *
 * 배경: `<input type="number" list=…>`(datalist)는 브라우저가 **현재 입력값과 매칭되는 옵션만** 필터해
 * 보여줘서(값이 16384면 16384 하나만 뜸) 프리셋 선택 UX가 깨진다. 그래서 네이티브 `<select>`로 항상 전체
 * 프리셋을 보여주고, 목록에 없는 값이 필요하면 "직접 입력…"을 골라 숫자 입력창을 노출한다.
 */
function PresetNumberField({
  label, hint, value, presets, step, min, max, halfWidth, onChange,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  value: number;
  presets: TPreset[];
  step: number;
  min: number;
  max?: number;
  halfWidth?: boolean;
  onChange: (v: number) => void;
}): React.ReactElement {
  const matchesPreset = presets.some((p) => p.value === value);
  const [custom, setCustom] = useState(!matchesPreset);
  // 값이 바뀌면(설정 로드·직접입력 타이핑) 프리셋 매칭 여부로 모드를 재동기화한다.
  // dep은 value만 — presets는 인라인 배열이라 매 렌더 새 참조가 되므로 dep에 넣으면 효과가 매 렌더 실행돼
  // 사용자가 고른 "직접 입력…"이 즉시 취소된다. presets는 정적 설정이라 dep에서 제외해도 안전하다.
  useEffect(() => {
    setCustom(!presets.some((p) => p.value === value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const showInput = custom || !matchesPreset;
  const selectValue = showInput ? '__custom__' : String(value);

  return (
    <label className={`settings__label${halfWidth ? ' settings__label--half' : ''}`}>
      {label}
      <select
        className="settings__input"
        value={selectValue}
        onChange={(e) => {
          if (e.target.value === '__custom__') setCustom(true);
          else { setCustom(false); onChange(Number(e.target.value)); }
        }}
      >
        {presets.map((p) => (
          <option key={p.value} value={String(p.value)}>{p.label}</option>
        ))}
        <option value="__custom__">직접 입력…</option>
      </select>
      {showInput && (
        <input
          className="settings__input"
          style={{ marginTop: 6 }}
          type="number"
          step={step}
          min={min}
          max={max}
          value={value}
          placeholder="숫자 직접 입력"
          onChange={(e) => onChange(step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value, 10))}
        />
      )}
      {hint && <span className="settings__hint">{hint}</span>}
    </label>
  );
}

const DEFAULT_PROJECT: NonNullable<AxiomSettings['project']> = {
  axiomFolder: '',
  regionEdit: true,
  composeBinding: true,
  regionVerify: true,
  anchorFirstEdit: true,
  patchFirstEdit: true,
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
  multiPatchAutoFullFallback: true,
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
  userStubsFolder: '',
  externalCorpusEnabled: true,
  validateExternalCorpus: true,
};

const DEFAULT_SETTINGS: AxiomSettings = {
  llm: { endpoint: '', model: '', apiKey: '', temperature: 0.2, maxTokens: 8192, contextWindow: 32768, provider: 'openai' },
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
  const handleOpenRagGuide = () => vscode.postMessage({ type: 'openRagGuide' });
  const handleCreateRagTemplate = () => vscode.postMessage({ type: 'createRagTemplate' });

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
            title="두 탭(서버 연결 · 프로젝트)의 설정을 함께 저장합니다 — 어느 탭에 있든 상관없습니다. (RAG 파일은 추가/삭제 시 즉시 반영)"
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
          onOpenRagGuide={handleOpenRagGuide}
          onCreateRagTemplate={handleCreateRagTemplate}
        />
      )}
    </div>
  );
}

/* ───────────────────────── Home Tab ───────────────────────── */

function HomeTab({ model }: { model: string }): React.ReactElement {
  const handleOpenChat = () => vscode.postMessage({ type: 'openChat' });
  const handleClearHistory = () => vscode.postMessage({ type: 'clearHistory' });
  const handleOpenGuide = () => vscode.postMessage({ type: 'openGuide' });
  const handleOpenActionCards = () => vscode.postMessage({ type: 'openActionCards' });
  const handleOpenComponentCatalog = () => vscode.postMessage({ type: 'openComponentCatalog' });
  const handleOpenDesignTokens = () => vscode.postMessage({ type: 'openDesignTokens' });
  const handleOpenRouterMap = () => vscode.postMessage({ type: 'openRouterMap' });
  const handleOpenHandoff = () => vscode.postMessage({ type: 'openPublishingHandoff' });
  const handleOpenMockData = () => vscode.postMessage({ type: 'openMockData' });

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
        <button className="launcher__secondary-btn" onClick={handleOpenGuide}>
          📖 개발 가이드
        </button>
        <button
          className="launcher__secondary-btn"
          onClick={handleOpenActionCards}
          title="오프라인 모드에서 뜨는 추천 카드의 카탈로그 — 목록·켜기끄기·새 카드·드라이런"
        >
          🃏 오프라인 행동 카드
        </button>
        <button
          className="launcher__secondary-btn"
          onClick={handleOpenComponentCatalog}
          title="scaffold 부품 목록 — prop 표·예제·스니펫 복사 (모델 호출 없음)"
        >
          🧩 컴포넌트 카탈로그
        </button>
        <button
          className="launcher__secondary-btn"
          onClick={handleOpenDesignTokens}
          title="이 프로젝트 CSS의 디자인 토큰 — 라이트·다크 실제 색 견본·복사 (모델 호출 없음)"
        >
          🎨 디자인 토큰
        </button>
        <button
          className="launcher__secondary-btn"
          onClick={handleOpenRouterMap}
          title="주소 ↔ 화면 지도 — 고아 페이지·중복 주소 찾기 (모델 호출 없음)"
        >
          🗺 라우터 맵
        </button>
        <button
          className="launcher__secondary-btn"
          onClick={handleOpenHandoff}
          title="퍼블리셔 산출물(publishing/)을 domains/로 옮기기 — import 재작성·라우터 등록까지"
        >
          📦 퍼블리싱 포팅
        </button>
        <button
          className="launcher__secondary-btn"
          onClick={handleOpenMockData}
          title="타입으로 fixture JSON 만들기 — 백엔드 없이 화면 돌리기 (모델 호출 없음)"
        >
          🧪 Mock 데이터
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
  onOpenRagGuide: () => void;
  onCreateRagTemplate: () => void;
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
  onOpenRagGuide,
  onCreateRagTemplate,
}: SettingsTabProps): React.ReactElement {
  const project = settings.project ?? DEFAULT_PROJECT;

  // 설정을 "언제 손대는 것이냐"로 갈라 놓는다 — 투입 첫날 한 번(서버 연결) vs 필요할 때(프로젝트).
  // 좁은 사이드바에서 세로로 이어 붙이면 경계가 스크롤에 묻혀 안 보인다.
  const [settingsTab, setSettingsTab] = useState<'server' | 'project'>('server');

  // 주소 미리보기는 **실제 호출과 같은 함수**(resolveLlmUrls)로 만든다 — 화면과 요청이 갈라지지 않게.
  const endpointMode = settings.llm.endpointMode ?? 'base';
  const endpointValid = isValidEndpoint(settings.llm.endpoint);
  const resolvedUrls = resolveLlmUrls(settings.llm.endpoint, endpointMode, settings.llm.provider ?? 'openai');

  // Axiom은 규약·지식을 항상 함께 보내므로 창이 작으면 '현재 파일'부터 깎인다 → 하한선을 눈에 보이게.
  const ctxLevel: 'good' | 'warn' | 'bad' =
    settings.llm.contextWindow >= 32768 ? 'good' : settings.llm.contextWindow >= 16384 ? 'warn' : 'bad';
  // 출력 자리를 크게 잡을수록 입력(파일)이 줄어든다. 1/4 초과면 알려준다.
  const maxTokensTooBig =
    settings.llm.contextWindow > 0 && settings.llm.maxTokens > settings.llm.contextWindow / 4;

  return (
    <div className="settings">
      {/* 하위 탭 — 저장 버튼은 상단에 하나뿐이며 어느 탭에 있든 양쪽을 함께 저장한다. */}
      <div className="settings__subtabs">
        <button
          className={`settings__subtab${settingsTab === 'server' ? ' settings__subtab--active' : ''}`}
          onClick={() => setSettingsTab('server')}
        >
          서버 연결
        </button>
        <button
          className={`settings__subtab${settingsTab === 'project' ? ' settings__subtab--active' : ''}`}
          onClick={() => setSettingsTab('project')}
        >
          프로젝트
        </button>
      </div>

      {settingsTab === 'server' && (
      <>
      <p className="settings__group-lead">투입 첫날 한 번 설정하면 되는 값입니다. 고객사 담당자에게 받아 적으세요.</p>

      {/* ── ① 접속 정보 — 담당자에게 "받아 적는" 값. 틀리면 연결 실패로 즉시 드러난다. ── */}
      <section className="settings__section settings__section--connect">
        <h2 className="settings__section-title">① 접속 정보</h2>
        <p className="settings__section-lead">
          고객사 AI 담당자에게 <strong>받은 값을 그대로 적는 칸</strong>입니다. 임의로 정하지 마세요.
        </p>

        <div className="settings__field">
          <div className="settings__field-head">
            <span className="settings__field-name">AI 서버 주소</span>
            <div className="settings__mode" role="radiogroup" aria-label="주소 해석 방식">
              <label className="settings__mode-opt">
                <input
                  type="radio"
                  name="endpointMode"
                  checked={endpointMode === 'base'}
                  onChange={() => onLlmChange('endpointMode', 'base')}
                />
                <span>기본 주소</span>
              </label>
              <label className="settings__mode-opt">
                <input
                  type="radio"
                  name="endpointMode"
                  checked={endpointMode === 'full'}
                  onChange={() => onLlmChange('endpointMode', 'full')}
                />
                <span>전체 주소</span>
              </label>
            </div>
          </div>
          <input
            className="settings__input"
            type="text"
            value={settings.llm.endpoint}
            placeholder={endpointMode === 'full' ? 'https://gw.co.kr/llm/v1/chat/completions' : 'http://10.10.20.31:8000'}
            onChange={(e) => onLlmChange('endpoint', e.target.value)}
          />
        </div>
        <p className="settings__hint">
          {endpointMode === 'full' ? (
            <>
              <strong>전체 주소</strong> — 받은 주소를 <strong>그대로</strong> 호출합니다. 뒤에 아무것도 붙이지 않습니다.
              경로가 특이한 게이트웨이용입니다.
            </>
          ) : (
            <>
              <strong>기본 주소</strong> — 받은 주소 뒤에 <code>/v1/chat/completions</code> 같은 경로를 붙여 호출합니다.
              대부분 이쪽입니다. 주소 끝에 <code>/v1</code>이 딸려와도 알아서 정리합니다.
            </>
          )}
        </p>

        {settings.llm.endpoint.trim().length > 0 &&
          (endpointValid ? (
            <div className="settings__url-preview">
              <div className="settings__url-preview-title">이렇게 호출합니다</div>
              <div className="settings__url-preview-row">
                <span>대화</span>
                <code>{resolvedUrls.chat || '—'}</code>
              </div>
              <div className="settings__url-preview-row">
                <span>모델 목록</span>
                <code>{resolvedUrls.models || '—'}</code>
              </div>
              {endpointMode === 'full' && (
                <p className="settings__url-preview-note">
                  전체 주소 모드에서는 모델 목록·서버 종류 감지 주소를 <strong>추정</strong>합니다.
                  빗나가도 연결 테스트는 대화 주소로 직접 확인하므로 문제되지 않습니다.
                </p>
              )}
            </div>
          ) : (
            <div className="settings__url-preview settings__url-preview--bad">
              주소 형식이 올바르지 않습니다 — <code>http://</code> 또는 <code>https://</code>로 시작해야 합니다.
            </div>
          ))}

        <label className="settings__label">
          모델명
          <input
            className="settings__input"
            type="text"
            value={settings.llm.model}
            placeholder="예: qwen3.6:35b-a3b"
            onChange={(e) => onLlmChange('model', e.target.value)}
          />
        </label>
        <p className="settings__hint">
          서버에 등록된 이름과 <strong>한 글자도 다르면 안 됩니다</strong>. 대소문자·슬래시·콜론까지 그대로 적으세요.
        </p>

        <label className="settings__label">
          백엔드 종류 (provider)
          <select
            className="settings__input"
            value={settings.llm.provider ?? 'openai'}
            onChange={(e) => onLlmChange('provider', e.target.value)}
          >
            <option value="ollama">ollama (네이티브 /api/chat)</option>
            <option value="openai">openai 호환 (/v1/chat/completions)</option>
          </select>
        </label>
        <p className="settings__hint">
          대부분의 서버는 <strong>openai 호환</strong>입니다(vLLM·LM Studio·LocalAI·LiteLLM 등). 네이티브 Ollama만 <strong>ollama</strong>를 고르세요.
          서버 구성을 모르면 아래 <strong>연결 테스트</strong>를 누르면 자동 감지해 맞춰주고, 사용 가능한 모델 목록도 알려줍니다.
        </p>

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

      {/* ── ② 모델 한계 — 서버가 정한 값. 우리에게 결정권이 없고, 틀리면 조용히 잘린다. ── */}
      <section className="settings__section settings__section--limit">
        <h2 className="settings__section-title">② 모델 한계</h2>
        <p className="settings__section-lead">
          담당자에게 <strong>확인해야 하는 값</strong>입니다. 서버가 정한 값이라 추측하면 안 됩니다.
        </p>

        <PresetNumberField
          label="Context Window (입력+출력 합산 · Ollama num_ctx로 전달)"
          value={settings.llm.contextWindow}
          step={1024}
          min={1024}
          presets={[
            { value: 8192, label: '8192 · 권장 미만' },
            { value: 16384, label: '16384 · 최소' },
            { value: 32768, label: '32768 · 권장' },
            { value: 65536, label: '65536 · 64k(VRAM 여유 시)' },
            { value: 131072, label: '131072 · 128k(고VRAM)' },
          ]}
          onChange={(v) => onLlmChange('contextWindow', v)}
        />

        <div className="settings__guide">
          <div className="settings__guide-row settings__guide-row--good">
            <b>32768 이상</b> — 권장. 파일을 통째로 보고 일합니다
          </div>
          <div className="settings__guide-row settings__guide-row--warn">
            <b>16384</b> — 최소. 200줄 이하 파일이면 그럭저럭 돌아갑니다
          </div>
          <div className="settings__guide-row settings__guide-row--bad">
            <b>8192 이하</b> — 사실상 못 씁니다. 설치는 되고 답도 하는데 제 성능이 안 나옵니다
          </div>
        </div>

        {ctxLevel !== 'good' && (
          <div className={`settings__warn settings__warn--${ctxLevel}`}>
            {ctxLevel === 'bad' ? (
              <>
                현재 <b>{settings.llm.contextWindow}</b> — Axiom은 규약·지식을 함께 보내기 때문에 이 크기에서는
                <strong> 현재 파일을 100줄 정도밖에 못 봅니다.</strong> 담당자에게 32768 이상으로 올려 달라고 요청하세요.
              </>
            ) : (
              <>
                현재 <b>{settings.llm.contextWindow}</b> — 돌아가긴 하지만 큰 파일에서는 앞부분만 보게 됩니다.
                가능하면 32768 이상을 권장합니다.
              </>
            )}
          </div>
        )}

        <p className="settings__hint">
          담당자에게 물을 때: vLLM이면 <code>--max-model-len</code>, Ollama면 <code>OLLAMA_CONTEXT_LENGTH</code> 값을 확인하세요.
          <strong> 모델 스펙상 최대치가 아니라 서버가 실제로 띄운 값</strong>이어야 합니다.
        </p>
      </section>

      {/* ── ③ 출력 설정 — 서버 제약이 아니라 "AI가 한 번에 쓸 코드 길이". 우리가 정한다. ── */}
      <section className="settings__section settings__section--output">
        <h2 className="settings__section-title">③ 출력 설정</h2>
        <p className="settings__section-lead">
          담당자에게 받는 값이 아니라 <strong>우리가 정하는 값</strong>입니다.
        </p>

        <PresetNumberField
          label="Max Tokens (출력 상한)"
          value={settings.llm.maxTokens}
          step={256}
          min={256}
          presets={[
            { value: 2048, label: '2048 · 부족할 수 있음' },
            { value: 4096, label: '4096 · 최소' },
            { value: 8192, label: '8192 · 권장' },
            { value: 16384, label: '16384 · thinking 모델·초대형 파일' },
          ]}
          onChange={(v) => onLlmChange('maxTokens', v)}
        />

        <div className="settings__guide">
          <div className="settings__guide-row settings__guide-row--good">
            <b>8192</b> — 권장. 파일 전체 재작성까지 감당합니다
          </div>
          <div className="settings__guide-row settings__guide-row--warn">
            <b>4096</b> — 최소. 부분 수정은 되지만 큰 파일을 다시 쓸 때 중간에 끊길 수 있습니다
          </div>
          <div className="settings__guide-row settings__guide-row--warn">
            <b>16384</b> — thinking(혼잣말) 모델이거나 아주 큰 파일을 다룰 때만
          </div>
        </div>

        {maxTokensTooBig && (
          <div className="settings__warn settings__warn--warn">
            출력 상한이 Context Window의 1/4을 넘습니다(<b>{settings.llm.maxTokens}</b> / {settings.llm.contextWindow}).
            출력 자리를 크게 잡을수록 <strong>AI가 볼 수 있는 파일이 줄어듭니다.</strong>
          </div>
        )}

        <p className="settings__hint">
          응답이 문장 한가운데서 멈추거나 코드 블록이 닫히지 않은 채 끝나면 이 값이 부족한 것입니다.
        </p>
      </section>

      {/* ── ④ 세부 조정 — 평소엔 손대지 않고, 증상이 있을 때만 만지는 값. ── */}
      <section className="settings__section settings__section--tune">
        <h2 className="settings__section-title">④ 세부 조정</h2>
        <p className="settings__section-lead">
          <strong>평소에는 손대지 마세요.</strong> 사이트가 바뀌어도 그대로 두면 되는 값이며, 증상이 있을 때만 조정합니다.
        </p>

        <PresetNumberField
          label="Temperature (답변의 들쭉날쭉한 정도)"
          value={settings.llm.temperature}
          step={0.1}
          min={0}
          max={2}
          presets={[
            { value: 0.1, label: '0.1 · 결정적(코드 편집)' },
            { value: 0.2, label: '0.2 · 기본(권장)' },
            { value: 0.3, label: '0.3 · 약간 다양' },
            { value: 0.7, label: '0.7 · Qwen 일반 권장' },
          ]}
          hint="코드 작업에서는 낮을수록 좋습니다. 높이면 창의적이 되는 게 아니라 규약을 안 지킵니다. 다만 일부 Qwen3 모델은 너무 낮으면 같은 문장을 반복할 수 있어, 그럴 때만 0.6~0.7로 올려 보세요."
          onChange={(v) => onLlmChange('temperature', v)}
        />
      </section>

      </>
      )}

      {settingsTab === 'project' && (
      <>
      <p className="settings__group-lead">프로젝트마다 다른 지식·동작 설정입니다. 필요할 때 다시 오면 됩니다.</p>

      {/* RAG 파일 관리 */}
      <section className="settings__section">
        <h2 className="settings__section-title">RAG 지식 파일 관리</h2>

        {/* 작성 가이드 / 템플릿 — 처음 등록하는 사용자를 위한 안내 */}
        <div className="settings__rag-guide">
          <p className="settings__hint">
            우리 프로젝트만의 지식을 .md 파일로 적어 등록하면 AI가 그 내용을 근거로 답합니다.
            처음이라면 먼저 작성 가이드를 보거나 템플릿으로 시작하세요.
          </p>
          <div className="settings__rag-folder-actions">
            <button className="settings__rag-btn" onClick={onOpenRagGuide} title="RAG 작성 규칙·예시 문서를 미리보기로 엽니다">
              📖 작성 가이드 보기
            </button>
            <button className="settings__rag-btn" onClick={onCreateRagTemplate} title="시작용 _index.md + 예시 .md 를 폴더에 생성합니다">
              ✨ 템플릿 생성
            </button>
          </div>
        </div>

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
            checked={project.composeBinding}
            onChange={(e) => onProjectChange('composeBinding', e.target.checked)}
          />
          <span>조립 바인딩(API→테이블) — experimental.composeBinding</span>
        </label>

        <label className="settings__toggle">
          <input
            type="checkbox"
            checked={project.regionVerify}
            onChange={(e) => onProjectChange('regionVerify', e.target.checked)}
          />
          <span>영역 편집 검증 루프 — experimental.regionVerify</span>
        </label>

        <label className="settings__toggle">
          <input
            type="checkbox"
            checked={project.anchorFirstEdit}
            onChange={(e) => onProjectChange('anchorFirstEdit', e.target.checked)}
          />
          <span>앵커-우선 편집 — experimental.anchorFirstEdit</span>
        </label>

        <label className="settings__toggle">
          <input
            type="checkbox"
            checked={project.patchFirstEdit}
            onChange={(e) => onProjectChange('patchFirstEdit', e.target.checked)}
          />
          <span>patch-우선 편집 — experimental.patchFirstEdit</span>
        </label>

        <label className="settings__toggle">
          <input
            type="checkbox"
            checked={project.intentClassifier}
            onChange={(e) => onProjectChange('intentClassifier', e.target.checked)}
          />
          <span>의도 분류기 (라우팅 핵심 · 기본 켜짐 권장) — experimental.intentClassifier</span>
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
      </>
      )}
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
        {toggle('externalCorpusEnabled', '외부 corpus 라우팅 — rag.externalCorpusEnabled')}
        {toggle('validateExternalCorpus', '외부 corpus 검증 — rag.validateExternalCorpus')}
        {text('userStubsFolder', '오프라인 stubs 폴더 — stubs.userStubsFolder', '(지정 없음)')}
      </div>
    </details>
  );
}
