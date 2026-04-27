---
title: React 컴포넌트 코드 패턴
tags: [react, component, 컴포넌트, props, 타입, memoization, usecallback, usememo, react.memo, 최적화, useeffect, 의존성배열, 이벤트핸들러, 컴포넌트분리, 훅추출, 커스텀훅, 조건부렌더링, classname, cn, extract, refactor, 리팩토링, typescript오류, ts오류]
scope: react
---

# React 컴포넌트 코드 패턴

> 모든 예시는 react-app-scaffold 컨벤션을 따른다.
> - 타입 네이밍: `T` 접두사 (`TUserCardProps`, `TUser`)
> - import: 앨리어스 경로 사용 (`@axiom/components/ui`, `@axiom/hooks`, `@/`)
> - API 통신: `useApi` 훅 사용 (`fetch` 직접 호출 금지)
> - className 조건부 처리: `cn()` 사용 (`@/lib/utils`)

---

## 1. Props 타입 정의

```typescript
// type 사용 (권장), T 접두사 필수
type TUserCardProps = {
  user: TUser;
  onDelete?: (id: number) => void;
  className?: string;
};

function UserCard({ user, onDelete, className }: TUserCardProps) {
  return <div className={className}>{user.name}</div>;
}

// children이 있는 경우
type TLayoutProps = {
  children: React.ReactNode;
  title?: string;
};

// 일부 필드만 받는 경우
type TUserSummaryCardProps = {
  user: Pick<TUser, 'id' | 'name' | 'email'>;
};
```

---

## 2. 이벤트 핸들러 타입

```typescript
// Input 이벤트
const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  setValue(e.target.value);
};

// Select 이벤트
const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
  setSelected(e.target.value);
};

// Form submit
const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
};

// 마우스 이벤트
const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.stopPropagation();
};

// 키보드 이벤트
const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') { ... }
};
```

이벤트 핸들러 타입 매핑:

```
onClick      → React.MouseEventHandler<HTMLElement>
onChange     → React.ChangeEventHandler<HTMLInputElement | HTMLSelectElement>
onSubmit     → React.FormEventHandler<HTMLFormElement>
onKeyDown    → React.KeyboardEventHandler<HTMLElement>
onFocus/Blur → React.FocusEventHandler<HTMLElement>
```

---

## 3. useState 타입 보완

```typescript
// 초기값이 null이거나 나중에 다른 타입으로 설정되는 경우
const [user, setUser] = useState<TUser | null>(null);

// 배열 상태
const [items, setItems] = useState<TItem[]>([]);

// 유니온 상태 (탭, 상태 머신)
const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

// 객체 상태 (부분 초기화)
const [form, setForm] = useState<Partial<TFormData>>({});
```

---

## 4. 컴포넌트 분리 (Extract Component)

선택한 JSX 블록에서 사용하는 변수를 식별하고 Props로 정의한다.

```typescript
// 분리 전 (JSX 블록)
<div className="user-card">
  <img src={user.avatarUrl} alt={user.name} />
  <h3>{user.name}</h3>
  <p>{user.email}</p>
</div>

// 분리 후
type TUserCardProps = {
  user: Pick<TUser, 'avatarUrl' | 'name' | 'email'>;
};

function UserCard({ user }: TUserCardProps) {
  return (
    <div className="user-card">
      <img src={user.avatarUrl} alt={user.name} />
      <h3>{user.name}</h3>
      <p>{user.email}</p>
    </div>
  );
}
```

규칙:
- 새 컴포넌트는 named export
- 페이지 컴포넌트만 default export

---

## 5. 커스텀 훅 추출 (Extract Custom Hook)

```typescript
// 추출 전 (컴포넌트 내부에 흩어진 로직)
const { data: users, isLoading, error } = useApi<TUser[]>('/api/users');

// 재사용 가능한 훅으로 추출
type TUseUserListResult = {
  users: TUser[] | undefined;
  isLoading: boolean;
  error: Error | null;
};

export function useUserList(): TUseUserListResult {
  const { data: users, isLoading, error } = useApi<TUser[]>('/api/users');
  return { users, isLoading, error: error ?? null };
}
```

규칙:
- 훅 이름은 반드시 `use`로 시작
- 반환값 타입 명시 (`TUseXxxResult`)
- API 통신은 `useApi` 사용 — `fetch`/`useQuery`/`useMutation` 직접 사용 금지

---

## 6. useEffect 의존성 배열 수정

1. useEffect 콜백 내부에서 참조하는 모든 외부 변수를 식별한다.
2. `useState`의 setter 함수는 의존성에서 제외한다 (안정적 참조).
3. 무한 루프 원인(객체/배열 리터럴, 매 렌더마다 재생성되는 값)을 수정한다.

```typescript
// 무한 루프 패턴 — options가 매 렌더마다 새 객체면 무한루프
useEffect(() => {
  refetch(options);
}, [options]); // ← 문제

// 수정 A: 원시값으로 의존성 분해
useEffect(() => {
  refetch({ page: options.page, limit: options.limit });
}, [options.page, options.limit]);

// 수정 B: useMemo로 안정적 참조 확보
const stableOptions = useMemo(
  () => ({ page: options.page, limit: options.limit }),
  [options.page, options.limit]
);
useEffect(() => {
  refetch(stableOptions);
}, [stableOptions]);
```

---

## 7. Memoization

```
useCallback 적용 대상:
  - 자식 컴포넌트의 prop으로 전달되는 함수
  - useEffect 의존성에 포함된 함수

useMemo 적용 대상:
  - 무거운 계산 (배열 필터링, 정렬, 집계)
  - 자식 컴포넌트에 전달되는 객체/배열
  - 매 렌더마다 새 참조가 생성되어 의존성 문제를 일으키는 객체

React.memo 적용 대상:
  - 부모가 자주 리렌더되지만 해당 컴포넌트의 props는 변하지 않는 경우
```

```typescript
// Before
function MyComponent({ items, onItemClick }: TMyComponentProps) {
  const sortedItems = items.sort((a, b) => a.name.localeCompare(b.name));
  const handleClick = (id: number) => onItemClick(id);
  return <ItemList items={sortedItems} onClick={handleClick} />;
}

// After
const MyComponent = React.memo(function MyComponent({
  items,
  onItemClick,
}: TMyComponentProps) {
  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.name.localeCompare(b.name)),
    [items]
  );

  const handleClick = useCallback(
    (id: number) => onItemClick(id),
    [onItemClick]
  );

  return <ItemList items={sortedItems} onClick={handleClick} />;
});
```

---

## 8. 조건부 렌더링 패턴

```typescript
// 안티패턴: 중첩 삼항
return isLoading ? <Spinner /> : error ? <ErrorMessage /> : data ? <Content /> : null;

// 권장: early return
if (isLoading) return <Spinner />;
if (error) return <ErrorMessage error={error} />;
if (!data) return null;
return <Content data={data} />;

// 짧은 조건부: && 연산자
{isVisible && <Tooltip>{text}</Tooltip>}

// 숫자 0 falsy 함정 방지
{count > 0 && <Badge count={count} />}
```

---

## 9. className 조건부 처리

shadcn/ui 내장 `cn()` 유틸을 사용한다. 별도 clsx 설치 불필요.

```typescript
import { cn } from '@/lib/utils';

// 조건부 className
<div className={cn('card', {
  'card--active': isActive,
  'card--disabled': isDisabled,
})}>

// 외부에서 className을 받아 병합하는 컴포넌트 (shadcn 패턴)
type TCardProps = {
  className?: string;
  children: React.ReactNode;
};

function Card({ className, children }: TCardProps) {
  return (
    <div className={cn('rounded-lg border bg-card p-4', className)}>
      {children}
    </div>
  );
}
```

---

## 10. 타입 단언(as) 제거 → 타입 가드 적용

```typescript
// 안티패턴: as 단언
const user = data as TUser;

// 권장: 타입 가드 함수
function isApiError(error: unknown): error is ApiError {
  return error instanceof Error && 'status' in error;
}

// Non-null assertion 제거
const el = document.getElementById('root');
if (!el) throw new Error('Root element not found');
// 이후 el은 HTMLElement로 좁혀짐
```

---

## 11. 주요 TypeScript 오류 수정 전략

```
TS2322 (Type 'X' is not assignable to type 'Y'):
  → 타입 선언을 실제 값에 맞게 수정하거나, 값을 타입에 맞게 변환.

TS2345 (Argument of type 'X' is not assignable to parameter of type 'Y'):
  → 함수 파라미터 타입 또는 호출부의 인수 타입 수정.

TS2531 (Object is possibly 'null'):
  → optional chaining(?.) 또는 조건 분기로 처리.

TS2532 (Object is possibly 'undefined'):
  → undefined 체크 추가 또는 기본값(??) 설정.

TS2339 (Property 'X' does not exist on type 'Y'):
  → 타입에 프로퍼티 추가, 또는 타입 가드 사용.

TS7006 (Parameter 'X' implicitly has an 'any' type):
  → 파라미터에 명시적 타입 추가.

TS2741 (Property 'X' is missing in type 'Y'):
  → 누락된 필드 추가 또는 optional(?)로 변경.
```

---

## 부록: 자주 쓰이는 유틸리티 타입

```typescript
Partial<T>       // 모든 프로퍼티를 optional로
Required<T>      // 모든 프로퍼티를 required로
Readonly<T>      // 모든 프로퍼티를 readonly로
Pick<T, K>       // T에서 K 프로퍼티만 선택
Omit<T, K>       // T에서 K 프로퍼티 제외
Record<K, V>     // K를 키, V를 값으로 하는 객체
NonNullable<T>   // null과 undefined 제거
ReturnType<T>    // 함수 반환 타입 추출
Parameters<T>    // 함수 파라미터 타입을 튜플로 추출
Awaited<T>       // Promise<T>에서 T 추출 (TypeScript 4.5+)
```