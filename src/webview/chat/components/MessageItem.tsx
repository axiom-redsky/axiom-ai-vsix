import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import hljs from 'highlight.js';
import type { Message } from '../hooks/useChat';
import type { DiffLine } from '../../../types/messages';
import { ActionCardsView } from './ActionCardsView';

/**
 * react-markdown의 code 컴포넌트를 직접 교체한다.
 * rehype-highlight/lowlight 파이프라인은 tsx/jsx를 미지원하므로
 * highlight.js를 직접 사용해 더 넓은 언어 커버리지를 확보한다.
 */
function CodeBlock({
  className,
  children,
}: React.ComponentPropsWithoutRef<'code'>) {
  const lang = className?.match(/^language-(.+)/)?.[1] ?? '';
  const code = String(children).replace(/\n$/, '');

  if (lang) {
    const resolvedLang = hljs.getLanguage(lang) ? lang : 'plaintext';
    const highlighted = hljs.highlight(code, { language: resolvedLang });
    return (
      <code
        className={`hljs language-${resolvedLang}`}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: highlighted.value }}
      />
    );
  }

  return <code className={className}>{children}</code>;
}

/** React 노드 트리에서 순수 텍스트만 재귀 추출(마크다운 패턴 판별용). */
function extractText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement(node)) {
    return extractText((node.props as { children?: React.ReactNode }).children);
  }
  return '';
}

/**
 * 인용구(blockquote) 커스텀 렌더 — 오프라인 응답의 배지·힌트를 카드/콜아웃으로 강조한다.
 *  - "오프라인 모드" 포함 → 오프라인 배지 카드
 *  - 폴백 안내(🔎) → 약한 힌트 콜아웃
 *  - 그 외(의도 라인 등) → 기본 blockquote
 */
function Blockquote({ children }: React.ComponentPropsWithoutRef<'blockquote'>) {
  const text = extractText(children);
  if (text.includes('오프라인 모드')) {
    return <blockquote className="message__offline-banner">{children}</blockquote>;
  }
  if (text.includes('🔎') || text.includes('카탈로그를 대신 안내')) {
    return <blockquote className="message__offline-hint">{children}</blockquote>;
  }
  return <blockquote>{children}</blockquote>;
}

/** "patterns/use-api.md" → "patterns › use-api" (출처 칩 라벨). */
function prettifySource(src: string): string {
  return src.replace(/\.md$/i, '').split('/').join(' › ');
}

/**
 * h2 커스텀 렌더 — 오프라인 지식 블록의 출처 헤더(`## [patterns/use-api.md]`)를 출처 칩으로,
 * 그 외 h2는 기본 헤딩으로 렌더한다.
 */
function Heading2({ children }: React.ComponentPropsWithoutRef<'h2'>) {
  const text = extractText(children).trim();
  const m = text.match(/^\[(.+)\]$/);
  if (m) {
    return (
      <h2 className="knowledge-source">
        <span className="knowledge-source__icon" aria-hidden>📄</span>
        <span className="knowledge-source__label">{prettifySource(m[1])}</span>
      </h2>
    );
  }
  return <h2>{children}</h2>;
}

const MARKDOWN_COMPONENTS = {
  code: CodeBlock,
  blockquote: Blockquote,
  h2: Heading2,
} as const;

interface Props {
  message: Message;
  onConfirm?: (actionId: string, approved: boolean) => void;
  onPatchRecovery?: (recoveryId: string, action: 'retry' | 'cancel') => void;
  onCardChip?: (requestId: string, cardId: string, slotName: string) => void;
  onCardExecute?: (requestId: string, cardId: string) => void;
}

const ACTION_BLOCK_COMPLETE_RE = /<axiom-action>[\s\S]*?<\/axiom-action>/g;
const ACTION_BLOCK_PARTIAL_RE = /<axiom-action>[\s\S]*$/;

function DiffView({ diff }: { diff: DiffLine[] }): React.ReactElement {
  return (
    <div className="diff-view">
      {diff.map((line, i) => (
        <div key={i} className={`diff-line diff-line--${line.type}`}>
          <span className="diff-line__gutter">
            {line.type === 'add' ? '+' : line.type === 'del' ? '-' : line.type === 'sep' ? '' : ' '}
          </span>
          <span className="diff-line__no">
            {line.type === 'sep' ? '' : (line.type === 'del' ? line.oldNo : line.newNo) ?? ''}
          </span>
          <span className="diff-line__content">{line.content}</span>
        </div>
      ))}
    </div>
  );
}

function FileResultCard({
  message,
  onConfirm,
  onPatchRecovery,
}: {
  message: Message;
  onConfirm?: (actionId: string, approved: boolean) => void;
  onPatchRecovery?: (recoveryId: string, action: 'retry' | 'cancel') => void;
}): React.ReactElement {
  const { subtype, content } = message;

  if (subtype === 'file-created') {
    return (
      <div className="file-result file-result--created">
        <span className="file-result__icon">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M2 2h7l3 3v9H2V2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none" />
            <path d="M9 2v3h3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M5 9l2 2 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="file-result__label">생성됨</span>
        <span className="file-result__path">{content}</span>
      </div>
    );
  }

  if (subtype === 'file-updated') {
    const hasDiff = message.diff && message.diff.length > 0;
    return (
      <div className={`file-result file-result--updated${hasDiff ? ' file-result--has-diff' : ''}`}>
        <div className="file-result__header">
          <span className="file-result__icon">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M2 2h7l3 3v9H2V2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none" />
              <path d="M9 2v3h3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              <path d="M5 8h6M5 11h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </span>
          <span className="file-result__label">수정됨</span>
          <span className="file-result__path">{content}</span>
        </div>
        {hasDiff && <DiffView diff={message.diff!} />}
      </div>
    );
  }

  if (subtype === 'file-error') {
    return (
      <div className="file-result file-result--error">
        <span className="file-result__icon">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" fill="none" />
            <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </span>
        <span className="file-result__label">오류</span>
        <span className="file-result__path">{content}</span>
      </div>
    );
  }

  if (subtype === 'file-confirm-request') {
    const hasDiff = message.diff && message.diff.length > 0;
    return (
      <div className={`file-result file-result--confirm${hasDiff ? ' file-result--has-diff' : ''}`}>
        <div className="file-result__header">
          <span className="file-result__icon">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M2 2h7l3 3v9H2V2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none" />
              <path d="M9 2v3h3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              <path d="M5 8h4M5 11h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
              <path d="M11 12l1 1 1.5-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="file-result__label">수정 대기</span>
          <span className="file-result__path">{content}</span>
        </div>
        {hasDiff && <DiffView diff={message.diff!} />}
        {message.confirmPending && (
          <div className="file-confirm-actions">
            <button
              className="file-confirm-btn file-confirm-btn--apply"
              onClick={() => onConfirm?.(message.actionId!, true)}
            >
              적용
            </button>
            <button
              className="file-confirm-btn file-confirm-btn--discard"
              onClick={() => onConfirm?.(message.actionId!, false)}
            >
              취소
            </button>
          </div>
        )}
        {!message.confirmPending && (
          <div className="file-confirm-actions file-confirm-actions--resolved">
            결정 완료
          </div>
        )}
      </div>
    );
  }

  if (subtype === 'patch-failed') {
    const preview = (message.searchPreview ?? '').trimEnd();
    const isReactViolation = message.failureKind === 'react-violation';
    return (
      <div className="file-result file-result--patch-failed">
        <div className="file-result__header">
          <span className="file-result__icon">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" fill="none" />
              <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </span>
          <span className="file-result__label">
            {isReactViolation ? 'React 규칙 위반 — 저장 차단됨' : 'patch 매칭 실패'}
          </span>
          <span className="file-result__path">{content}</span>
        </div>
        <p className="patch-failed__hint">
          {isReactViolation
            ? '훅(useState/useApi 등)이 컴포넌트 함수 밖(모듈 최상위)에 생성되어 저장을 막았습니다. 훅을 컴포넌트 본문 안으로 옮긴 전체 파일을 다시 받을지, 입력을 직접 수정할지 선택하세요.'
            : 'AI가 제시한 search 코드가 현재 파일과 정확히 일치하지 않습니다. 전체 파일을 다시 받아 적용할지, 입력을 직접 수정할지 선택하세요.'}
        </p>
        {preview && (
          <pre className="patch-failed__preview">{preview}</pre>
        )}
        {message.recoveryPending ? (
          <div className="file-confirm-actions">
            <button
              className="file-confirm-btn file-confirm-btn--apply"
              onClick={() => onPatchRecovery?.(message.recoveryId!, 'retry')}
            >
              Full로 재시도
            </button>
            <button
              className="file-confirm-btn file-confirm-btn--discard"
              onClick={() => onPatchRecovery?.(message.recoveryId!, 'cancel')}
            >
              입력 수정
            </button>
          </div>
        ) : (
          <div className="file-confirm-actions file-confirm-actions--resolved">
            결정 완료
          </div>
        )}
      </div>
    );
  }

  if (subtype === 'file-cancelled') {
    return (
      <div className="file-result file-result--cancelled">
        <span className="file-result__icon">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" fill="none" />
            <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="file-result__label">취소됨</span>
      </div>
    );
  }

  // 일반 시스템 메시지 (fallback)
  return (
    <div className={`message message--system${message.isError ? ' message--error' : ''}`}>
      <div className="message__body">
        <div className="message__content">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

export function MessageItem({ message, onConfirm, onPatchRecovery, onCardChip, onCardExecute }: Props): React.ReactElement {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    // 오프라인 행동 카드(계획 카드/컴팩트 리스트) — 파일 결과 카드와 별도 인터랙티브 렌더.
    if (message.subtype === 'action-cards' && message.actionCards) {
      return (
        <div className="message message--system">
          <ActionCardsView
            payload={message.actionCards}
            executedCardId={message.executedCardId}
            onChip={(r, c, s) => onCardChip?.(r, c, s)}
            onExecute={(r, c) => onCardExecute?.(r, c)}
          />
        </div>
      );
    }
    return (
      <div className="message message--system">
        <FileResultCard message={message} onConfirm={onConfirm} onPatchRecovery={onPatchRecovery} />
      </div>
    );
  }

  const assistantContent = isUser
    ? message.content
    : message.content
        .replace(ACTION_BLOCK_COMPLETE_RE, '')
        .replace(ACTION_BLOCK_PARTIAL_RE, '')
        .trim();

  return (
    <div data-message-id={message.id} className={`message ${isUser ? 'message--user' : 'message--assistant'}${message.isError ? ' message--error' : ''}`}>
      {!isUser && (
        <div className="message__avatar message__avatar--ai">
          <svg width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path fill="currentColor" d="M18.164,7.931V5.085c0.769-0.359,1.262-1.13,1.266-1.978V3.04c-0.003-1.21-0.983-2.189-2.193-2.193H17.17   c-1.21,0.003-2.189,0.983-2.193,2.193v0.067c0.004,0.849,0.497,1.619,1.266,1.978v2.852c-1.083,0.166-2.103,0.614-2.957,1.301   L5.458,3.142C5.814,1.81,5.023,0.441,3.69,0.085S0.989,0.521,0.633,1.853s0.436,2.701,1.768,3.057   c0.637,0.17,1.316,0.081,1.888-0.247l7.696,5.991c-1.419,2.14-1.38,4.931,0.096,7.032l-2.342,2.342   c-0.188-0.06-0.384-0.092-0.581-0.095c-1.123,0-2.033,0.91-2.033,2.033C7.125,23.09,8.035,24,9.158,24   c1.123,0,2.033-0.91,2.033-2.033l0,0c-0.003-0.197-0.035-0.393-0.095-0.581l2.317-2.317c2.742,2.094,6.662,1.569,8.756-1.172   s1.569-6.662-1.172-8.756c-0.83-0.634-1.806-1.05-2.838-1.209 M17.2,17.308c-1.77-0.004-3.202-1.443-3.198-3.213   c0.004-1.77,1.443-3.202,3.213-3.198c1.768,0.004,3.199,1.439,3.198,3.207c0,1.77-1.435,3.205-3.205,3.205"/>
          </svg>
        </div>
      )}

      <div className="message__body">
        <div className="message__content">
          {isUser ? (
            <p>{message.content}</p>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
              {assistantContent + (message.isStreaming ? '▌' : '')}
            </ReactMarkdown>
          )}
        </div>
      </div>

      {isUser && (
        <div className="message__avatar message__avatar--user">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="5" r="2.5" fill="currentColor" />
            <path d="M2 12C2 9.8 4.24 8 7 8C9.76 8 12 9.8 12 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
          </svg>
        </div>
      )}
    </div>
  );
}
