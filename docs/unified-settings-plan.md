# Axiom AI 설정 통합 (Unified Settings)

## Context (왜 하는가)

현재 Axiom AI의 설정이 **세 군데**로 흩어져 있어, 특히 **신규 사용자 온보딩**(VSCode 설치 → 확장 설치 → axiom 관련 파일이 전혀 없는 빈 프로젝트)에서 "무엇을 어디에 설정해야 하는지" 알기 어렵다.

분산 현황:
- **VSCode `settings.json`** (`axiom-ai.*` 약 43개 키, [package.json](../package.json) `contributes.configuration` 정의) — 읽기는 전부 [ExtensionConfig.ts](../src/config/ExtensionConfig.ts) 한 길목, 기본값은 [config.ts](../src/ai/config.ts) `AI_DEFAULTS`.
- **채팅 패널의 부분 설정 폼** ([ChatPanelProvider.ts](../src/providers/ChatPanelProvider.ts)) — `llm.*` + `rag.*`만 노출, `ConfigurationTarget.Global`로 settings.json에 씀. 별도 저장소가 아니라 settings.json의 부분 편집기.
- **"프로젝트 설정" 패널** ([ProjectConfigProvider.ts](../src/providers/ProjectConfigProvider.ts)) — `.axiom/knowledge/.project-config.json` + `project-config.md`에 저장. 런타임 설정이 아니라 AI가 읽는 **RAG 마크다운 지식**.

목표: 사용자에게는 **설정 패널 하나(한 곳)**, 뒤에서는 설정 성격에 맞는 위치로 라우팅해 저장. JSON 직접 편집·`.vscode/settings.json` 존재 여부 걱정 없이 폼만 채우면 확장이 파일/폴더를 자동 생성.

## 확정된 설계 결정

1. **"한 곳" = UI 패널** (파일이 아님). Axiom 사이드바 상단에 전용 **"설정" 웹뷰 패널** 신설. 사용자는 폼만 채우고 저장.
2. **저장 위치는 성격별로 라우팅** (UI는 하나, 물리 저장소는 분리):
   - **SecretStorage(OS 키체인)** ← `llm.apiKey` 한 개. (다른 AI 확장 관행. 평문·Settings Sync 유출 차단)
   - **전역 settings.json (`ConfigurationTarget.Global`, 머신 단위)** ← LLM 연결·신원: `llm.endpoint/provider/model/temperature/maxTokens/contextWindow`, `llm.thinking.*`, `user.name`. 한 번 설정 → 모든 프로젝트 재사용.
   - **워크스페이스 파일 `.axiom/axiom.config.json` (프로젝트 단위, 자동 생성)** ← 나머지 전부: `experimental.*`, `promptDiet.*`, `multiPatch.*`, `lineEdit.*`, `scenarioC.compactModes`, `rag.*`, `stubs.*`, `server.offlineFallback`, `llm.qnaAntiRepeat.*`, `sdd.requireComplianceTags`, `debug.logSystemPrompt`. git 커밋 시 팀 공유.
   - **부트스트랩(라우팅 제외, settings.json/기본값 유지)**: `sdd.axiomFolder` — `.axiom` 폴더 **위치 자체**를 정하므로 그 안의 파일에 넣을 수 없음(닭-달걀). 미설정 시 `.axiom` 컨벤션으로 기본.
3. **하위 호환**: 파일·시크릿이 없으면 오늘과 100% 동일 동작(`AI_DEFAULTS` → settings.json). 회귀 0.
4. **폐쇄망 하드닝 키**(`update.mode`, `telemetry.*`, `extensions.autoUpdate` 등 VSCode 네이티브)는 **제외**. axiom-ai 소유가 아니므로 별도 가이드 문서로만 안내.
5. **프로젝트 지식(.axiom/knowledge)**: 저장은 분리 유지(RAG 마크다운, 생명주기 다름), UI만 통합 패널의 **탭**으로 진입점 합침.

## 구현

### 1. 읽기 계층 — [ExtensionConfig.ts](../src/config/ExtensionConfig.ts)

핵심: 모든 getter가 이미 이 클래스를 통과하므로 **해상도 순서만 한 겹 추가**한다.

- `KEY_ROUTING` 맵 신설(머신 | 프로젝트 | 시크릿 | 부트스트랩). **읽기·쓰기 양쪽의 단일 진실원**.
- `private static _resolve<T>(key, default)`: 프로젝트-라우팅 키면 `_projectCfg()[key] ?? cfg.get(key, default)`, 그 외엔 기존대로 `cfg.get(key, default)`. 기존 `cfg.get(...)` 호출들을 `_resolve(...)`로 치환.
- `private static _projectCfg()`: 워크스페이스 루트 + (`getSddAxiomFolder() || '.axiom'`) 로 `.axiom/axiom.config.json` 경로 계산 → 파싱 결과 캐시(없으면 `{}`). `FileSystemWatcher`로 파일 변경 시 캐시 무효화. 설정 패널 저장 시에도 `reload()` 호출.
- **apiKey(async 문제 해결)**: `getLlmConfig()`는 sync 시그니처 유지(다수 호출자). 활성화 시 `context.secrets.get('axiom-ai.llm.apiKey')`를 정적 캐시 `_apiKeyCache`에 1회 로드 → getter는 캐시 동기 반환. 패널이 `secrets.store` 후 캐시 갱신. (settings.json `llm.apiKey`는 1회 마이그레이션 후 deprecated 주석.)

### 2. 활성화 배선 — [extension.ts](../src/extension.ts)

- `ExtensionConfig.init(context)` 추가: SecretStorage 핸들 보관 + `_apiKeyCache` 선로딩 + `.axiom/axiom.config.json` FileSystemWatcher 등록.
- 신설 `SettingsPanelProvider` 등록(아래).

### 3. 쓰기 + 패널 — `SettingsPanelProvider` (신규, [ProjectConfigProvider.ts](../src/providers/ProjectConfigProvider.ts) 패턴 복제)

- 새 뷰 `axiom-ai.settingsPanel`을 [package.json](../package.json) `contributes.views`의 `axiom-ai-container` **최상단(visible)** 에 추가.
- 메시지 핸들러(`saveSettings`): `KEY_ROUTING`에 따라 라우팅 — apiKey→`secrets.store`, 머신키→`cfg.update(..., Global)`, 프로젝트키→`.axiom/axiom.config.json`에 머지 기록(`fs.mkdirSync(recursive)` + 자동 생성). 저장 후 `ExtensionConfig` 캐시 reload + 최신값 회신.
- 연결 테스트는 [ChatPanelProvider.ts](../src/providers/ChatPanelProvider.ts)의 `_handleTestConnection` 로직 **재사용**(공용 유틸로 추출).
- 프로젝트 지식 탭: [ProjectConfigProvider.ts](../src/providers/ProjectConfigProvider.ts)의 `loadProjectConfig`/`saveProjectConfig` + `_generateMarkdown`을 공용 모듈로 추출해 그대로 위임(저장 위치 불변).

### 4. 웹뷰 UI — `src/webview/settings/SettingsApp.tsx` (신규)

- [index.tsx](../src/webview/index.tsx)에 `mode === 'settings' ? <SettingsApp />` 분기 추가(`data-mode="settings"`).
- 탭 3개: **LLM 연결**(endpoint·provider·model·apiKey·temperature·maxTokens·contextWindow + [연결 테스트]) / **프로젝트 설정**(experimental·튜닝 그룹, 토글·숫자) / **프로젝트 지식**([ProjectConfigApp.tsx](../src/webview/projectConfig/ProjectConfigApp.tsx) 폼 재사용).
- 메시지 타입은 [messages.ts](../src/types/messages.ts)에 확장(전 항목 `AxiomSettings`로 확대).

### 5. 정리

- 채팅 패널의 기존 설정 폼은 신 패널로 안내(중복 제거) 또는 유지하되 저장 경로를 공용 라우터로 통일.
- 기존 별도 "프로젝트 설정" 뷰는 통합 패널 탭으로 흡수(뷰 정의 제거 또는 collapsed 유지는 구현 시 택1).

## 핵심 파일

- 읽기 계층: [src/config/ExtensionConfig.ts](../src/config/ExtensionConfig.ts), 기본값 [src/ai/config.ts](../src/ai/config.ts)
- 배선: [src/extension.ts](../src/extension.ts)
- 패널: 신규 `src/providers/SettingsPanelProvider.ts` (참조 [src/providers/ProjectConfigProvider.ts](../src/providers/ProjectConfigProvider.ts), [src/providers/ChatPanelProvider.ts](../src/providers/ChatPanelProvider.ts))
- 웹뷰: 신규 `src/webview/settings/SettingsApp.tsx`, [src/webview/index.tsx](../src/webview/index.tsx), 재사용 [src/webview/projectConfig/ProjectConfigApp.tsx](../src/webview/projectConfig/ProjectConfigApp.tsx)
- 타입/매니페스트: [src/types/messages.ts](../src/types/messages.ts), [package.json](../package.json)

## 검증

1. `npm run typecheck` 통과.
2. `npm run compile` 후 F5(Extension Dev Host)로 **axiom 파일이 전혀 없는 빈 프로젝트** 열기.
3. Axiom 사이드바 → "설정" 패널 → LLM 연결 입력 → [연결 테스트] OK → 저장. 확인:
   - `.axiom/axiom.config.json`이 **자동 생성**되고 프로젝트 키만 들어있음.
   - 전역 settings.json에 `llm.endpoint` 등 머신 키가 기록됨(apiKey는 **없음**).
   - apiKey는 OS 자격증명 관리자(키체인)에 저장됨.
4. 창 새로고침 → 설정 유지. 다른 프로젝트 열기 → LLM 연결은 재입력 불필요(머신), 프로젝트 키는 빈 프로젝트라 기본값.
5. **회귀 확인**: `.axiom/axiom.config.json`·시크릿 없는 상태에서 동작이 오늘과 동일(기존 settings.json만으로). 기존 스위트 영향 없음 확인: `npm run test:region-edit`, `npm run test:react-rules`, `npm run test:line-edits`.
