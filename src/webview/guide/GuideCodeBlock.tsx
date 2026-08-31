import React, { useState } from 'react';
import hljs from 'highlight.js';
import { stripHighlightComments } from './markdownPreprocess';

/**
 * 가이드 코드블록 — 채팅 CodeBlock과 별도 구현(채팅 경로 무접촉).
 * highlight.js 직접 사용(rehype-highlight는 tsx/jsx 미지원) + Docusaurus highlight 매직코멘트 제거.
 */
export function GuideCode({ className, children }: React.ComponentPropsWithoutRef<'code'>): React.ReactElement {
  const lang = className?.match(/^language-(.+)/)?.[1] ?? '';
  const code = stripHighlightComments(String(children).replace(/\n$/, ''));

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

/** React 노드 트리에서 순수 텍스트 재귀 추출(복사 버튼용). */
function extractText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement(node)) return extractText((node.props as { children?: React.ReactNode }).children);
  return '';
}

/** pre 래퍼 — 우상단 복사 버튼을 얹는다. */
export function GuidePre({ children }: React.ComponentPropsWithoutRef<'pre'>): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const handleCopy = (): void => {
    const text = stripHighlightComments(extractText(children).replace(/\n$/, ''));
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="guide__codeblock">
      <button type="button" className="guide__copy-btn" onClick={handleCopy} title="코드 복사">
        {copied ? '✓ 복사됨' : '복사'}
      </button>
      <pre>{children}</pre>
    </div>
  );
}
