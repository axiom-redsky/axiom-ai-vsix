import React, { useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { GuideCode, GuidePre } from './GuideCodeBlock';
import {
  headingSlug,
  resolveDocRelPath,
  segmentAdmonitions,
  splitDocLink,
  stripFrontmatter,
} from './markdownPreprocess';

const ADMONITION_META: Record<string, { icon: string; label: string }> = {
  info: { icon: 'ℹ️', label: '정보' },
  tip: { icon: '💡', label: '팁' },
  note: { icon: '📝', label: '노트' },
  warning: { icon: '⚠️', label: '주의' },
  caution: { icon: '⚠️', label: '주의' },
  danger: { icon: '🚨', label: '위험' },
};

function extractText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement(node)) return extractText((node.props as { children?: React.ReactNode }).children);
  return '';
}

interface IGuideDocViewProps {
  docId: string;
  markdown: string;
  /** 이미지 상대경로 해석 베이스(asWebviewUri 문자열, 가이드 루트) */
  rootUri: string;
  anchor: string | null;
  onNavigate: (docId: string, anchor?: string) => void;
  onOpenExternal: (url: string) => void;
}

export function GuideDocView({
  docId,
  markdown,
  rootUri,
  anchor,
  onNavigate,
  onOpenExternal,
}: IGuideDocViewProps): React.ReactElement {
  const { body } = useMemo(() => stripFrontmatter(markdown), [markdown]);

  // 문서·앵커가 바뀌면 해당 헤딩으로 스크롤 (렌더 완료 후)
  useEffect(() => {
    if (!anchor) return;
    const t = setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ block: 'start' }), 50);
    return () => clearTimeout(t);
  }, [docId, markdown, anchor]);

  const components = useMemo(() => {
    const heading =
      (Tag: 'h1' | 'h2' | 'h3' | 'h4') =>
      ({ children }: React.ComponentPropsWithoutRef<typeof Tag>): React.ReactElement => (
        <Tag id={headingSlug(extractText(children))}>{children}</Tag>
      );
    return {
      code: GuideCode,
      pre: GuidePre,
      h1: heading('h1'),
      h2: heading('h2'),
      h3: heading('h3'),
      h4: heading('h4'),
      img: ({ src, alt, ...rest }: React.ComponentPropsWithoutRef<'img'>) => {
        const raw = typeof src === 'string' ? src : '';
        const resolved =
          /^(https?:|data:|vscode-)/i.test(raw) ? raw : `${rootUri}/${resolveDocRelPath(docId, raw)}`;
        return <img src={resolved} alt={alt ?? ''} loading="lazy" {...rest} />;
      },
      a: ({ href, children }: React.ComponentPropsWithoutRef<'a'>) => {
        const url = href ?? '';
        const handleClick = (e: React.MouseEvent): void => {
          e.preventDefault();
          if (/^https?:\/\//i.test(url)) {
            onOpenExternal(url);
          } else if (url.startsWith('#')) {
            document.getElementById(url.slice(1))?.scrollIntoView({ block: 'start' });
          } else if (url) {
            const { docPath, anchor: a } = splitDocLink(url);
            onNavigate(resolveDocRelPath(docId, docPath), a ?? undefined);
          }
        };
        return (
          <a href={url} onClick={handleClick}>
            {children}
          </a>
        );
      },
    };
  }, [docId, rootUri, onNavigate, onOpenExternal]);

  /** admonition을 분리해 렌더 — body는 재귀 세그먼트(콜론 수가 다른 중첩 지원). */
  const renderSegments = (text: string, keyPrefix: string): React.ReactNode =>
    segmentAdmonitions(text).map((seg, i) => {
      if (seg.kind === 'md') {
        return (
          <ReactMarkdown
            key={`${keyPrefix}${i}`}
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
            components={components}
          >
            {seg.text}
          </ReactMarkdown>
        );
      }
      const meta = ADMONITION_META[seg.variant] ?? ADMONITION_META.note;
      return (
        <div key={`${keyPrefix}${i}`} className={`guide__admonition guide__admonition--${seg.variant}`}>
          <div className="guide__admonition-title">
            <span aria-hidden>{meta.icon}</span> {seg.title || meta.label}
          </div>
          <div className="guide__admonition-body">{renderSegments(seg.body, `${keyPrefix}${i}-`)}</div>
        </div>
      );
    });

  return <article className="guide__doc">{renderSegments(body, 's')}</article>;
}
