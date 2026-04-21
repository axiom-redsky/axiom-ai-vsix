import type { WebviewToHostMessage } from '../types/messages';

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewToHostMessage): void;
};

// acquireVsCodeApi()는 페이지 생명주기 동안 딱 한 번만 호출 가능.
// 모듈 싱글턴으로 공유해 launcher / chat 양쪽에서 재사용한다.
export const vscode = acquireVsCodeApi();
