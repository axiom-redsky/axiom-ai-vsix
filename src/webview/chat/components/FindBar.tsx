import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 채팅 인-뷰 텍스트 검색(Ctrl/Cmd+F). VSCode 에디터 find처럼 매치 하이라이트 + 이전/다음 이동.
 *
 * 하이라이트는 CSS Custom Highlight API(`CSS.highlights`)로 그린다 — DOM에 `<mark>`를 심지 않으므로
 * React가 관리하는 메시지 노드를 건드리지 않고(재렌더에도 안 깨짐) 스트리밍 중에도 안전하다.
 * 매치는 Range로만 표현하고 hue 두 종류(전체/현재)를 등록한다.
 */

const HL_ALL = 'chat-find';
const HL_CURRENT = 'chat-find-current';

interface HighlightRegistry {
  set(name: string, highlight: unknown): void;
  delete(name: string): void;
}

// TS lib에 아직 없는 API를 안전하게 접근(미지원 브라우저면 undefined → 하이라이트만 생략).
function highlightRegistry(): HighlightRegistry | undefined {
  return (CSS as unknown as { highlights?: HighlightRegistry }).highlights;
}
function HighlightCtor(): (new (...ranges: Range[]) => unknown) | undefined {
  return (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
}

function clearHighlights(): void {
  const reg = highlightRegistry();
  reg?.delete(HL_ALL);
  reg?.delete(HL_CURRENT);
}

/** 컨테이너 안의 보이는 텍스트 노드를 수집(빈 노드·숨김 요소 제외). */
function collectTextNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node): number {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = (node as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE') return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) nodes.push(n as Text);
  return nodes;
}

/** query와 일치하는 Range 목록(대소문자 무시, 노드 경계는 넘지 않음 — 렌더 마크다운에선 충분). */
function findRanges(root: HTMLElement, query: string): Range[] {
  const ranges: Range[] = [];
  const q = query.toLowerCase();
  if (!q) return ranges;
  for (const node of collectTextNodes(root)) {
    const text = node.nodeValue!.toLowerCase();
    let idx = text.indexOf(q);
    while (idx !== -1) {
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + q.length);
      ranges.push(range);
      idx = text.indexOf(q, idx + q.length);
    }
  }
  return ranges;
}

interface Props {
  /** 검색 대상 스크롤 컨테이너(메시지 목록). */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** 콘텐츠 변경 신호 — 값이 바뀌면 열려 있는 동안 매치를 다시 계산(스트리밍 대응). */
  revision: number;
}

export function FindBar({ containerRef, revision }: Props): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [total, setTotal] = useState(0);
  const [current, setCurrent] = useState(0); // 0-based
  const inputRef = useRef<HTMLInputElement>(null);
  const rangesRef = useRef<Range[]>([]);

  const paint = useCallback((ranges: Range[], curIdx: number) => {
    const reg = highlightRegistry();
    const Ctor = HighlightCtor();
    if (!reg || !Ctor) return; // 미지원 — 스크롤 이동만 동작
    if (ranges.length === 0) {
      clearHighlights();
      return;
    }
    reg.set(HL_ALL, new Ctor(...ranges));
    const cur = ranges[curIdx];
    if (cur) reg.set(HL_CURRENT, new Ctor(cur));
    else reg.delete(HL_CURRENT);
  }, []);

  const scrollToCurrent = useCallback((ranges: Range[], curIdx: number) => {
    const r = ranges[curIdx];
    if (!r) return;
    const el = r.startContainer.parentElement;
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []);

  // 검색 실행: query/열림/콘텐츠 변경 시 매치 재계산. 현재 인덱스는 가능하면 유지.
  useEffect(() => {
    if (!open) return;
    const root = containerRef.current;
    if (!root) return;
    const ranges = findRanges(root, query);
    rangesRef.current = ranges;
    setTotal(ranges.length);
    setCurrent((prev) => {
      const next = ranges.length === 0 ? 0 : Math.min(prev, ranges.length - 1);
      paint(ranges, next);
      return next;
    });
  }, [open, query, revision, containerRef, paint]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setTotal(0);
    setCurrent(0);
    rangesRef.current = [];
    clearHighlights();
  }, []);

  const go = useCallback(
    (delta: number) => {
      const ranges = rangesRef.current;
      if (ranges.length === 0) return;
      setCurrent((prev) => {
        const next = (prev + delta + ranges.length) % ranges.length;
        paint(ranges, next);
        scrollToCurrent(ranges, next);
        return next;
      });
    },
    [paint, scrollToCurrent],
  );

  // 전역 단축키: Ctrl/Cmd+F로 열기(웹뷰 기본 동작 대체).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setOpen(true);
        // 이미 열려 있으면 입력 전체 선택해 재검색을 쉽게.
        requestAnimationFrame(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 열릴 때 입력 포커스.
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  if (!open) return null;

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(e.shiftKey ? -1 : 1);
    }
  };

  const counter = total === 0 ? (query ? '결과 없음' : '') : `${current + 1} / ${total}`;

  return (
    <div className="find-bar" role="search">
      <input
        ref={inputRef}
        className="find-bar__input"
        type="text"
        placeholder="채팅에서 찾기"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onInputKey}
        spellCheck={false}
        aria-label="채팅에서 찾기"
      />
      <span className={`find-bar__count${total === 0 && query ? ' find-bar__count--empty' : ''}`}>
        {counter}
      </span>
      <button
        className="find-bar__btn"
        onClick={() => go(-1)}
        disabled={total === 0}
        title="이전 (Shift+Enter)"
        aria-label="이전 결과"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M9 8L6 4.5L3 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        className="find-bar__btn"
        onClick={() => go(1)}
        disabled={total === 0}
        title="다음 (Enter)"
        aria-label="다음 결과"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 4.5L6 8L9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        className="find-bar__btn find-bar__btn--close"
        onClick={close}
        title="닫기 (Esc)"
        aria-label="검색 닫기"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
