---
title: TypeScript 타입 작성 규칙
tags: [typescript, 타입, type, interface, generic, 제네릭, 타입스크립트, 타입정의]
scope: convention
---

# TypeScript 타입 작성 규칙

## 기본 원칙

- `any` 사용 금지 → `unknown` 또는 구체적 타입 사용
- 타입 단언(`as`) 최소화 → 타입 가드 또는 제네릭 활용
- `interface`보다 `type`을 선호 (확장성 필요시 `interface` 사용)
- 코드 주석은 한국어로 작성

## 타입 네이밍 컨벤션

```typescript
// 일반 타입 — T 접두사
type TUser = {
  id: number;
  name: string;
  email: string;
};

// 인터페이스 — I 접두사 (옵션 객체, 설정 등)
interface IApiConfig {
  baseURL?: string;
  timeout?: number;
}

// 라우터 관련 — T 접두사
type TAppRoute = RouteObject & { name?: string };

// DTO (API 요청/응답)
type CreateUserDto = Pick<TUser, 'name' | 'email'>;
type UpdateUserDto = Partial<Omit<TUser, 'id'>>;
```

## API 타입 패턴

```typescript
// 도메인 타입 파일: src/domains/{name}/types/{name}.type.ts (또는 @/types 내)

// 기본 엔티티 타입
type TUser = {
  id: number;
  name: string;
  email: string;
  status: 'active' | 'inactive';
  createdAt: string;
};

// API 요청 DTO
type TCreateUserRequest = {
  name: string;
  email: string;
};

type TUpdateUserRequest = Partial<TCreateUserRequest>;

// API 응답 (ApiResponse로 래핑됨)
// useApi<TUser[]>('/api/users') → data는 TUser[] | undefined
```

## useApi 제네릭 사용

```typescript
import { useApi } from '@axiom/hooks';

// GET: 응답 데이터 타입 지정
const { data } = useApi<TUser[]>('/api/users');
// data: TUser[] | undefined

// POST: 응답 타입 + 요청 변수 타입
const { mutate } = useApi<TUser, TCreateUserRequest>('/api/users', {
  method: 'POST',
});
// mutate(variables: TCreateUserRequest)

// DELETE: 응답 없음
const { mutate } = useApi<void, { id: number }>(`/api/users/${id}`, {
  method: 'DELETE',
});
```

## 컴포넌트 Props 타입

```typescript
// type 사용 (권장)
type UserCardProps = {
  user: TUser;
  onDelete?: (id: number) => void;
  className?: string;
};

function UserCard({ user, onDelete, className }: UserCardProps) {
  return <div className={className}>{user.name}</div>;
}

// children이 있는 경우
type LayoutProps = {
  children: React.ReactNode;
  title?: string;
};
```

## 유틸리티 타입 활용

```typescript
// Pick — 일부 필드만 선택
type TUserSummary = Pick<TUser, 'id' | 'name'>;

// Omit — 일부 필드 제외
type TUserWithoutId = Omit<TUser, 'id'>;

// Partial — 모두 선택적으로
type TUserPatch = Partial<TUser>;

// Required — 모두 필수로
type TUserRequired = Required<TUser>;

// Record — 키-값 맵
type TStatusMap = Record<TUser['status'], string>;
// { active: string; inactive: string }
```

## 타입 가드 패턴

```typescript
function isApiError(error: unknown): error is ApiError {
  return error instanceof Error && 'status' in error;
}

// 사용
try {
  await someApiCall();
} catch (error) {
  if (isApiError(error)) {
    console.error(error.status, error.message);
  }
}
```

## React 컴포넌트 반환 타입

```typescript
// 페이지/컴포넌트는 React.ReactNode 반환 타입 명시
export default function UserListPage(): React.ReactNode {
  return <div>...</div>;
}

// 화살표 함수 컴포넌트 (선택)
const UserCard: React.FC<UserCardProps> = ({ user }) => {
  return <div>{user.name}</div>;
};
```

## Enum 대신 as const 사용

```typescript
// INCORRECT
enum UserStatus {
  Active = 'active',
  Inactive = 'inactive',
}

// CORRECT — as const 사용
const USER_STATUS = {
  Active: 'active',
  Inactive: 'inactive',
} as const;

type TUserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];
// type TUserStatus = 'active' | 'inactive'
```
