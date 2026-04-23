// WebView → Extension Host
export type WebviewToHostMessage =
  | { type: 'sendMessage'; text: string }
  | { type: 'stopMessage' }
  | { type: 'clearHistory' }
  | { type: 'ready' }
  | { type: 'openChat' };

// Extension Host → WebView
export type HostToWebviewMessage =
  | { type: 'token'; content: string }
  | { type: 'done' }
  | { type: 'error'; message: string }
  | { type: 'status'; text: string }
  | { type: 'fileCreated'; filePath: string }
  | { type: 'fileError'; message: string }
  | { type: 'fileCancelled' };
