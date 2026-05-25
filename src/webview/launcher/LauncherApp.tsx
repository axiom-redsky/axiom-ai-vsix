import React, { useEffect, useState, useCallback } from 'react';
import { vscode } from '../vscodeApi';
import type { HostToWebviewMessage, AxiomSettings } from '../../types/messages';

type Tab = 'home' | 'settings';

const DEFAULT_SETTINGS: AxiomSettings = {
  llm: { endpoint: '', model: '', apiKey: '', temperature: 0.2, maxTokens: 4096 },
  rag: { userRagFolder: '', additionalFiles: [] },
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
      {/* 탭 네비게이션 */}
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
      </div>

      {tab === 'home' && <HomeTab model={model} />}
      {tab === 'settings' && (
        <SettingsTab
          settings={settings}
          dirty={dirty}
          saved={saved}
          connTest={connTest}
          testing={testing}
          onLlmChange={handleLlmChange}
          onSave={handleSave}
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
  dirty: boolean;
  saved: boolean;
  connTest: { ok: boolean; detail: string } | null;
  testing: boolean;
  onLlmChange: (field: keyof AxiomSettings['llm'], value: string | number) => void;
  onSave: () => void;
  onTestConnection: () => void;
  onPickRagFile: () => void;
  onPickRagFolder: () => void;
  onRemoveRagFile: (fp: string) => void;
  onClearRagFolder: () => void;
}

function SettingsTab({
  settings,
  dirty,
  saved,
  connTest,
  testing,
  onLlmChange,
  onSave,
  onTestConnection,
  onPickRagFile,
  onPickRagFolder,
  onRemoveRagFile,
  onClearRagFolder,
}: SettingsTabProps): React.ReactElement {
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

        <div className="settings__actions-row">
          <button
            className={`settings__save-btn${dirty ? ' settings__save-btn--active' : ''}`}
            onClick={onSave}
            disabled={!dirty}
          >
            {saved ? '저장 완료 ✓' : '저장'}
          </button>
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
    </div>
  );
}
