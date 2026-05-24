// 프로젝트 설정 (SI 프로젝트 투입 시 작성, .axiom/knowledge/project-config.md 로 저장)
export interface ProjectConfig {
  projectName: string;
  designGuideUrl: string;
  publisherConventions: string;
  layoutPatterns: {
    listPage: string;
    detailPage: string;
    formPage: string;
  };
  notes: string;
}

// 설정 데이터 구조 (웹뷰 ↔ extension host 공유)
export interface AxiomSettings {
  llm: {
    endpoint: string;
    model: string;
    apiKey: string;
    temperature: number;
    maxTokens: number;
  };
  rag: {
    userRagFolder: string;
    additionalFiles: string[];
  };
}

// 페이지 생성 대화 상태 머신 (ChatViewProvider 내부)
export interface PageCreationState {
  /** 생성할 페이지명 (PascalCase + Page) */
  pageName: string;
  /** 도메인 후보 목록 (탐색기 스캔 결과) */
  domainCandidates: string[];
  /** 사용자 도메인 선택 대기 중 여부 */
  waitingForDomain: boolean;
  /** 확정된 도메인 */
  resolvedDomain: string | null;
}

// /spec wizard 상태 머신 (ChatViewProvider 내부 + 웹뷰 상태 표시용)
export interface SpecWizardState {
  step: 'intent' | 'domain' | 'acceptance' | 'api' | 'exceptions' | 'review';
  partial: {
    domain?: string;
    screen?: string;
    intent?: string;
  };
  collectedSections: Record<string, string>;
}

// WebView → Extension Host
export type WebviewToHostMessage =
  | { type: 'sendMessage'; text: string }
  | { type: 'stopMessage' }
  | { type: 'clearHistory' }
  | { type: 'ready' }
  | { type: 'openChat' }
  | { type: 'getSettings' }
  | { type: 'updateSettings'; settings: Partial<AxiomSettings> }
  | { type: 'pickRagFile' }
  | { type: 'pickRagFolder' }
  | { type: 'removeRagFile'; filePath: string }
  | { type: 'clearRagFolder' }
  | { type: 'loadProjectConfig' }
  | { type: 'saveProjectConfig'; config: ProjectConfig };

// Extension Host → WebView
export type HostToWebviewMessage =
  | { type: 'token'; content: string }
  | { type: 'done' }
  | { type: 'error'; message: string }
  | { type: 'status'; text: string }
  | { type: 'fileCreated'; filePath: string }
  | { type: 'fileUpdated'; filePath: string }
  | { type: 'fileError'; message: string }
  | { type: 'fileCancelled' }
  | { type: 'settingsLoaded'; settings: AxiomSettings }
  | { type: 'ragFileAdded'; filePath: string }
  | { type: 'ragFileRemoved'; filePath: string }
  | { type: 'ragFolderSet'; folderPath: string }
  | { type: 'projectConfigLoaded'; config: ProjectConfig | null }
  | { type: 'projectConfigSaved' }
  | { type: 'wizardStep'; step: SpecWizardState['step']; prompt: string };
