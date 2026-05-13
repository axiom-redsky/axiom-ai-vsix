import type { ChatMessage } from './types';

const TICK3 = '```';

interface StubEntry {
  keywords: string[];
  response: string;
}

const STUBS: StubEntry[] = [
  {
    keywords: ['useapi', 'usefetch', 'api 호출', 'api hook', 'api 훅', 'fetch hook', 'fetch 훅'],
    response: [
      '> ⚠️ 오프라인 모드 — 사전 정의 응답입니다',
      '',
      '## useApi 훅 예제',
      '',
      `${TICK3}typescript`,
      "import { useState, useEffect, useCallback } from 'react';",
      '',
      'interface ApiState<T> {',
      '  data: T | null;',
      '  loading: boolean;',
      '  error: string | null;',
      '}',
      '',
      'function useApi<T>(url: string) {',
      '  const [state, setState] = useState<ApiState<T>>({',
      '    data: null,',
      '    loading: false,',
      '    error: null,',
      '  });',
      '',
      '  const fetch = useCallback(async () => {',
      '    setState(prev => ({ ...prev, loading: true, error: null }));',
      '    try {',
      '      const res = await globalThis.fetch(url);',
      '      if (!res.ok) throw new Error(`HTTP ${res.status}`);',
      '      const data: T = await res.json();',
      '      setState({ data, loading: false, error: null });',
      '    } catch (e) {',
      '      setState(prev => ({ ...prev, loading: false, error: (e as Error).message }));',
      '    }',
      '  }, [url]);',
      '',
      '  useEffect(() => { fetch(); }, [fetch]);',
      '',
      '  return { ...state, refetch: fetch };',
      '}',
      '',
      '// 사용 예시',
      'function UserList() {',
      "  const { data, loading, error } = useApi<User[]>('/api/users');",
      '  if (loading) return <p>로딩 중...</p>;',
      '  if (error) return <p>오류: {error}</p>;',
      '  return <ul>{data?.map(u => <li key={u.id}>{u.name}</li>)}</ul>;',
      '}',
      TICK3,
    ].join('\n'),
  },
  {
    keywords: ['usestate', 'useeffect', 'state', 'effect', '상태 관리', '상태관리', '사이드 이펙트'],
    response: [
      '> ⚠️ 오프라인 모드 — 사전 정의 응답입니다',
      '',
      '## useState / useEffect 예제',
      '',
      `${TICK3}typescript`,
      "import { useState, useEffect } from 'react';",
      '',
      'function Counter() {',
      '  const [count, setCount] = useState<number>(0);',
      '  const [title, setTitle] = useState<string>(\'\');',
      '',
      '  // count 변경 시 document title 업데이트',
      '  useEffect(() => {',
      '    document.title = `클릭 수: ${count}`;',
      '  }, [count]);',
      '',
      '  // 마운트 시 한 번만 실행',
      '  useEffect(() => {',
      "    setTitle('카운터 컴포넌트');",
      '    return () => {',
      '      // 언마운트 시 정리',
      '      document.title = \'앱\';',
      '    };',
      '  }, []);',
      '',
      '  return (',
      '    <div>',
      '      <h1>{title}</h1>',
      '      <p>{count}</p>',
      '      <button onClick={() => setCount(c => c + 1)}>+1</button>',
      '    </div>',
      '  );',
      '}',
      TICK3,
    ].join('\n'),
  },
  {
    keywords: ['usecallback', 'usememo', 'memo', 'callback', '메모이제이션', '최적화', 'performance'],
    response: [
      '> ⚠️ 오프라인 모드 — 사전 정의 응답입니다',
      '',
      '## useCallback / useMemo 예제',
      '',
      `${TICK3}typescript`,
      "import { useState, useCallback, useMemo } from 'react';",
      '',
      'function ExpensiveList({ items }: { items: number[] }) {',
      '  const [filter, setFilter] = useState(\'\');',
      '',
      '  // 함수 참조 고정 — 자식 컴포넌트 불필요 리렌더 방지',
      '  const handleClick = useCallback((id: number) => {',
      '    console.log(\'선택:\', id);',
      '  }, []); // 의존성 없으면 빈 배열',
      '',
      '  // 계산 비용이 큰 값 메모이제이션',
      '  const filtered = useMemo(',
      '    () => items.filter(n => String(n).includes(filter)),',
      '    [items, filter], // items 또는 filter 변경 시에만 재계산',
      '  );',
      '',
      '  return (',
      '    <div>',
      '      <input value={filter} onChange={e => setFilter(e.target.value)} />',
      '      {filtered.map(n => (',
      '        <div key={n} onClick={() => handleClick(n)}>{n}</div>',
      '      ))}',
      '    </div>',
      '  );',
      '}',
      TICK3,
    ].join('\n'),
  },
  {
    keywords: ['custom hook', '커스텀 훅', 'custom 훅', '훅 만들기', '훅 생성', 'use 훅'],
    response: [
      '> ⚠️ 오프라인 모드 — 사전 정의 응답입니다',
      '',
      '## 커스텀 훅 뼈대',
      '',
      `${TICK3}typescript`,
      "import { useState, useEffect, useRef } from 'react';",
      '',
      '// 네이밍: use + 도메인명 (Pascal case)',
      'function useMyHook(param: string) {',
      '  const [value, setValue] = useState<string | null>(null);',
      '  const prevParam = useRef(param);',
      '',
      '  useEffect(() => {',
      '    // param이 바뀔 때 실행할 로직',
      '    prevParam.current = param;',
      '    setValue(param.toUpperCase());',
      '',
      '    return () => {',
      '      // 정리(cleanup) 로직',
      '    };',
      '  }, [param]);',
      '',
      '  const reset = () => setValue(null);',
      '',
      '  // 외부에서 필요한 값/함수만 반환',
      '  return { value, reset };',
      '}',
      '',
      '// 사용 예시',
      "function MyComponent() {",
      "  const { value, reset } = useMyHook('hello');",
      '  return <button onClick={reset}>{value}</button>;',
      '}',
      TICK3,
    ].join('\n'),
  },
  {
    keywords: ['예제', '예시', 'example', '샘플', '보여줘', '보여주', '사용법', '사용 방법', 'usage', 'how to use'],
    response: [
      '> ⚠️ 오프라인 모드 — 사전 정의 응답입니다',
      '',
      '## 코드 예제',
      '',
      'AI 서버가 오프라인 상태라 요청하신 내용에 맞는 예제를 생성할 수 없습니다.',
      '',
      '다음 키워드로 다시 질문하시면 미리 정의된 예제를 볼 수 있습니다:',
      '- `useApi` / `useFetch` — API 호출 훅',
      '- `useState` / `useEffect` — 기본 훅',
      '- `useCallback` / `useMemo` — 최적화 훅',
      '- `커스텀 훅` / `custom hook` — 훅 뼈대',
      '',
      '서버 연결 후 다시 질문하시면 정확한 예제를 받을 수 있습니다.',
    ].join('\n'),
  },
  {
    keywords: ['리팩터링', '리팩토링', 'refactor'],
    response: [
      '> ⚠️ 오프라인 모드 — 사전 정의 응답입니다',
      '',
      '## 리팩터링 체크리스트',
      '',
      '- 함수를 작게 분리하세요 (단일 책임 원칙)',
      '- 변수명을 의미 있게 변경하세요',
      '- 중복 코드를 추출하세요',
      '',
      `${TICK3}typescript`,
      '// AI 서버 연결 후 실제 리팩터링 코드를 받아보세요',
      TICK3,
    ].join('\n'),
  },
  {
    keywords: ['테스트', 'test', '단위테스트'],
    response: [
      '> ⚠️ 오프라인 모드 — 사전 정의 응답입니다',
      '',
      '## 테스트 코드 템플릿',
      '',
      `${TICK3}typescript`,
      "describe('대상 함수', () => {",
      "  it('정상 동작해야 한다', () => {",
      '    // Arrange',
      '    // Act',
      '    // Assert — AI 서버 연결 후 실제 케이스를 생성받으세요',
      '  });',
      '});',
      TICK3,
    ].join('\n'),
  },
  {
    keywords: ['설명', 'explain', '어떻게', '뭐야', '무엇'],
    response: [
      '> ⚠️ 오프라인 모드 — AI 서버에 연결할 수 없어 상세 설명이 불가합니다.',
      '',
      '서버 상태를 확인 후 다시 질문해주세요.',
    ].join('\n'),
  },
];

const DEFAULT_STUB = [
  '> ⚠️ 오프라인 모드 — AI 서버에 연결할 수 없습니다.',
  '',
  '서버 엔드포인트 설정을 확인하거나 잠시 후 다시 시도해주세요.',
].join('\n');

export class FallbackStubService {
  selectStub(userText: string): string {
    const q = userText.toLowerCase();
    for (const entry of STUBS) {
      if (entry.keywords.some(kw => q.includes(kw))) {
        return entry.response;
      }
    }
    return DEFAULT_STUB;
  }

  async *stream(userText: string): AsyncGenerator<string> {
    const text = this.selectStub(userText);
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const words = lines[i].split(' ');
      for (let j = 0; j < words.length; j++) {
        yield j === 0 ? words[j] : ' ' + words[j];
        await new Promise<void>(r => setTimeout(r, 18));
      }
      if (i < lines.length - 1) {
        yield '\n';
      }
    }
  }

  /** 메시지 배열에서 마지막 사용자 텍스트를 추출한다. */
  static extractUserText(messages: ChatMessage[]): string {
    return [...messages].reverse().find(m => m.role === 'user')?.content ?? '';
  }
}
