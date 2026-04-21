# API 클라이언트 패턴

---

## 계층 구조

```
useApi (훅)
  └── callApi (함수)
        └── BaseAxiosClient (Axios 싱글턴)
              └── getApiConfig → window.__MF_APP_CONFIG__
```

일반적으로 컴포넌트에서 직접 `callApi` 또는 `BaseAxiosClient`를 사용하지 않는다.
**항상 `useApi` 훅을 통해서만 API를 호출한다.**

---

## BaseAxiosClient (내부 싱글턴)

`src/core/api/api-client.ts`

Axios 인스턴스를 싱글턴으로 관리하는 클래스. 직접 사용하지 않는다.

```typescript
// 내부 구조 (참고용)
class BaseAxiosClient {
  private static instance: BaseAxiosClient;

  static getInstance(): BaseAxiosClient { ... }

  makeRequestConfig(endpoint, config): AxiosRequestConfig { ... }
  async request<T>(config, token?): Promise<ApiResponse<T>> { ... }
}

export default BaseAxiosClient.getInstance(); // 싱글턴 export
```

### 요청 URL 결정 로직

- 절대 URL (`https://...`): 그대로 사용
- 상대 경로 + baseURL 있음: `new URL(endpoint, baseURL)`
- 상대 경로 + baseURL 없음: `new URL(endpoint, window.location.origin)`

### 에러 응답 처리

| 케이스 | 반환 메시지 |
|--------|------------|
| `ECONNABORTED` (타임아웃) | `'요청 시간이 초과되었습니다'` |
| 서버 에러 응답 | `response.data.message` 또는 `response.data.error` |
| 기타 Axios 에러 | `error.message` |
| 알 수 없는 에러 | `'알 수 없는 오류가 발생했습니다'` |

기본 타임아웃: **30초**

---

## callApi 함수

`src/core/api/api.ts`

```typescript
export async function callApi<T = unknown>(
  endpoint: string,
  config: ApiRequestConfig = {},
): Promise<ApiResponse<T>>
```

`BaseAxiosClient`를 호출하고 `ApiError`로 에러를 표준화한다.

```typescript
// 직접 사용 예시 (useApi 대신 특수한 경우에만)
import { callApi } from '@/core/api/api';

const response = await callApi<User[]>('/api/users', { method: 'GET' });
// response.data → User[]
// response.statusCode → 200
```

**토큰 추가 위치:**

```typescript
// src/core/api/api.ts 내부
const token: string | null = null;
// 인증이 필요한 경우:
// token = localStorage.getItem('access_token');
```

---

## ApiError 클래스

`src/core/api/api.ts`

```typescript
export class ApiError extends Error {
  status: number;  // HTTP 상태 코드
  data?: unknown;  // 원본 응답 데이터

  constructor(status: number, message: string, data?: unknown) { ... }
}
```

`callApi`는 실패 시 항상 `ApiError`를 throw한다.

```typescript
try {
  const response = await callApi('/api/users');
} catch (error) {
  if (error instanceof ApiError) {
    console.error(error.status, error.message);
  }
}
```

`useApi` 사용 시에는 `try/catch` 없이 `error` 필드로 접근한다.

---

## ApiResponse 타입

`src/core/types/api-types.ts`

```typescript
export type ApiResponse<T = unknown> = {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
  statusCode?: number;
};
```

---

## API 설정 초기화

`src/core/api/api-config.ts`

### initApiConfig — 앱 진입 시 baseURL 설정

```typescript
import { initApiConfig } from '@/core/api/api-config';

// main.tsx 또는 App.tsx에서 초기화
initApiConfig({
  baseURL: window.__MF_APP_CONFIG__?.baseURL ?? import.meta.env.VITE_EXTERNAL_API_BASE_URL1,
});
```

### 환경변수

`.env` 파일의 API 관련 환경변수:

```
VITE_EXTERNAL_API_BASE_URL1=https://api.internal.company.com
VITE_EXTERNAL_API_BASE_URL2=https://jsonplaceholder.typicode.com
```

컴포넌트에서 환경변수 사용:

```typescript
const apiBase = import.meta.env.VITE_EXTERNAL_API_BASE_URL2 as string | undefined;
```

### getApiConfig — 현재 설정 조회

```typescript
import { getApiConfig } from '@/core/api/api-config';

const { baseURL } = getApiConfig();
// baseURL이 없으면 window.location.origin 반환
```

---

## ApiRequestConfig 타입

```typescript
export interface ApiRequestConfig {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'; // 기본값: 'GET'
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  params?: Record<string, string | number | boolean | undefined | null>;
  timeout?: number; // ms, 기본값: 30000
}
```

---

## 인터셉터 커스터마이징

`src/core/api/api-client.ts`의 `BaseAxiosClient` 내부 인터셉터 메서드를 수정한다.

```typescript
// 요청 인터셉터 — 공통 헤더 추가
private requestInterceptor(requestConfig: InternalAxiosRequestConfig) {
  requestConfig.headers['X-Request-ID'] = crypto.randomUUID();
  return requestConfig;
}

// 응답 인터셉터 — 공통 로깅
private responseInterceptor(response: AxiosResponse) {
  console.log(`[API] ${response.config.method} ${response.config.url} → ${response.status}`);
  return response;
}
```
