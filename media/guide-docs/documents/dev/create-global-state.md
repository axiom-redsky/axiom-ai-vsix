---
sidebar_position: 1
displayed_sidebar: "documentDocSidebar"
title: "업무 스토어(Store) 만들기"
---


# 업무 스토어(Store) 만들기

:::info 작업 내용
* 각 업무(domain)에서 **여러 화면이 함께 쓰는 클라이언트 상태**를 **react-app-scaffold**가 제공하는 **defineStore()** 팩토리로 만들고, 화면 컴포넌트에서 사용하는 방법을 설명합니다.
* 스토어는 **Zustand** 기반이며, 팩토리가 immer · persist · devtools를 미리 붙여둔 표준 형태로 제공합니다.
:::

:::tip <span class="admonition-title">immer · persist · devtools</span> 가 뭔가요?
* **immer**: 상태를 **직접 바꾸는 것처럼 써도** 알아서 불변 업데이트로 처리해 주는 도구입니다. 덕분에 `{ ...state }` 같은 불변 스프레드 없이 `state.items.push(x)`처럼 편하게 쓸 수 있습니다.
* **persist**: 상태를 **브라우저 저장소**(localStorage/sessionStorage)에 저장해, **새로고침 후에도 유지**되게 해 줍니다.
* **devtools**: **Redux DevTools** 브라우저 확장에 상태 변화를 흘려보내, 어떤 액션으로 상태가 어떻게 바뀌는지 **눈으로 추적**할 수 있게 해 줍니다. (개발 환경에서만 자동 부착)
* 셋 다 **Zustand의 미들웨어**로, 팩토리가 미리 붙여두므로 **직접 설정할 필요는 없습니다.**
:::

:::tip 서버 상태 vs 클라이언트 상태 — 역할이 다릅니다
* **서버에서 가져온 데이터**(목록, 상세 등)는 스토어에 넣지 않습니다. 그건 **useApi()** (TanStack Query)의 몫입니다. → [REST API 데이터 활용하기](./use-rest-api)
* **스토어(Zustand)** 는 서버와 무관하게 **클라이언트에서 여러 화면이 공유하는 상태**(선택한 회사, 담아둔 즐겨찾기, 열려 있는 다이얼로그 등)를 담습니다.
* 한 컴포넌트 안에서만 쓰는 값이라면 스토어가 아니라 그냥 `useState`를 씁니다.
:::




## 1. 어디에 둘까 — "누가 공유하는가"로 결정
---

스토어를 만들기 전에 **공유 범위**부터 정합니다. 범위에 따라 파일 위치가 달라집니다.

| 공유 범위 | 위치 | 도구 |
|---|---|---|
| 한 컴포넌트 안 | 스토어 불필요 | `useState` |
| **같은 도메인 안**의 여러 화면 | `src/domains/<도메인>/store/` | `defineStore` |
| **서로 다른 도메인**이 함께 | `src/shared/store/` | `defineStore` |
| 팩토리(도구) 자체 | `src/core/store/` | — (**불가침 인프라, 업무 상태 금지**) |

:::info 처음엔 도메인, 필요해지면 승격
* 대부분은 **`domains/<도메인>/store/` 에서 시작**하면 됩니다. 처음부터 `shared`로 올리지 마세요.
* 나중에 **다른 도메인에서도 같은 상태가 필요해지면**, 그때 파일을 `shared/store/` 로 옮기고 import 경로만 바꿉니다. 코드는 그대로라 이동 비용이 거의 없습니다.
* `src/core/` 는 팩토리(도구)만 두는 **불가침 영역**입니다. 여기에 업무 상태를 넣지 않습니다.
:::




## 2. 스토어 만들기 — `defineStore`
---

`defineStore()` 하나에 **`state`(초기 상태)** 와 **`actions`(상태를 바꾸는 함수들)** 를 객체로 선언하면, 화면에서 바로 쓸 수 있는 스토어 훅을 반환합니다.

아래는 example 도메인의 **즐겨찾기 스토어** 실제 코드입니다.
📄 `src/domains/example/store/favoritesStore.ts`

```ts
// highlight-start
import { defineStore } from '@axiom/store';
// highlight-end

/** 즐겨찾기 한 항목의 스냅샷 (담는 순간의 표시 정보를 그대로 저장) */
export interface IFavoriteItem {
	id: string;
	name: string;
	emoji: string;
	price: number;
}

// highlight-start
export const useFavoritesStore = defineStore({
	name: 'example-favorites',                 // 스토어마다 고유한 이름 (필수)
	persist: true,                             // 새로고침해도 유지
	state: { items: [] as IFavoriteItem[] },   // 초기 상태
	actions: {
		// 첫 인자 state = 현재 상태(immer draft). 직접 변경하면 된다.
		toggle: (state, item: IFavoriteItem) => {
			const i = state.items.findIndex((x) => x.id === item.id);
			if (i >= 0) state.items.splice(i, 1);   // 이미 있으면 제거
			else state.items.push(item);            // 없으면 추가
		},
		remove: (state, id: string) => {
			state.items = state.items.filter((x) => x.id !== id);
		},
		clear: (state) => {
			state.items = [];
		},
	},
});
// highlight-end
```

:::info 각 옵션 설명
* **`name`** (필수): devtools · persist를 식별하는 이름. **스토어마다 고유**해야 합니다.
* **`state`**: 초기 상태. 여기에 선언한 키가 곧 **persist 저장 대상**이 됩니다.
* **`actions`**: 상태를 바꾸는 함수 모음. 팩토리가 **immer**로 감싸므로, 첫 인자 `state`를 **직접 변경**하면 됩니다.
  - `state.items.push(x)`, `state.items = state.items.filter(...)` 처럼 그냥 바꾸면 됩니다. **불변 스프레드(`{ ...state }`)가 필요 없습니다.**
  - `this`를 쓰지 않으므로 화살표 함수/메서드 어느 쪽으로 써도 됩니다.
* **`persist`**: `true`면 새로고침 후에도 상태 유지(기본 localStorage). **액션(함수)은 저장에서 자동 제외**됩니다.
:::

:::tip persist 세부 설정
* `persist: true` → localStorage에 `state`의 필드 전체 저장.
* 세션 스토리지로 바꾸려면 객체로: `persist: { storage: 'session' }`
* 일부 필드만 저장하려면: `persist: { partialize: (s) => ({ items: s.items }) }`
* devtools는 개발 환경(`import.meta.env.DEV`)에서 **자동 부착**되므로 별도 설정이 필요 없습니다.
:::

:::tip devtools로 무엇을 볼 수 있나
* devtools 미들웨어는 브라우저의 **Redux DevTools 확장**에 상태 변화를 흘려보냅니다. (확장을 설치하면 바로 보입니다)
* **액션 로그(타임라인)**: 어떤 액션이 언제 실행됐는지 시간순으로 확인 — 가장 많이 봅니다.
* **State diff**: 액션 실행 전/후로 **어떤 필드가 어떻게 바뀌었는지** 차이를 확인합니다.
* **타임 트래블**: 이전 시점으로 **상태를 되돌려** 버그를 재현할 수 있습니다.
* **스토어 구분**: `name`(예: `example-favorites`)이 DevTools 인스턴스 이름이 됩니다. 그래서 `name`을 **스토어마다 고유하게** 두면 여러 스토어를 이름으로 골라 볼 수 있습니다.
* 실무 흐름은 보통 **"액션 로그를 보며 state diff 확인 → 필요하면 타임 트래블로 되돌려 재현"** 입니다.
:::




## 3. 화면에서 사용하기 — 구조분해 한 줄
---

사용법은 **항상 같습니다.** 필요한 상태와 액션을 **구조분해 한 줄**로 꺼내 씁니다.

```tsx
// highlight-start
const { items, toggle } = useFavoritesStore();
// highlight-end
```

아래는 **담기 페이지**(`FavoriteCatalog.tsx`)에서 스토어에 저장하는 실제 코드입니다.
📄 `src/domains/example/pages/store/FavoriteCatalog.tsx`

```tsx
import { useFavoritesStore, type IFavoriteItem } from '@/domains/example/store/favoritesStore';

export default function FavoriteCatalog(): React.ReactNode {
	// 필요한 상태·액션을 한 줄로 구조분해
	// highlight-start
	const { items, toggle } = useFavoritesStore();
	// highlight-end

	return (
		// ...
		<Button onClick={() => toggle(product)}>   {/* 하트 클릭 → 담기/빼기 */}
			<Heart />
		</Button>
		// ...
	);
}
```

그리고 **사용 페이지**(`FavoriteList.tsx`)는 같은 스토어에서 **읽기만** 합니다.
📄 `src/domains/example/pages/store/FavoriteList.tsx`

```tsx
import { useFavoritesStore } from '@/domains/example/store/favoritesStore';

export default function FavoriteList(): React.ReactNode {
	// highlight-start
	const { items, remove, clear } = useFavoritesStore();
	// highlight-end

	// items 를 그대로 렌더 → 담기 페이지에서 저장한 값이 여기서 보인다
	return <>{items.map((item) => /* ... */)}</>;
}
```

:::info 두 페이지가 하나의 스토어를 공유
* 담기 페이지(`toggle`)로 저장한 값을 사용 페이지(`items`)가 그대로 읽습니다.
* **라우트를 이동해도 유지**되고, `persist: true`라서 **새로고침해도 유지**됩니다.
* 사용 페이지는 상품 마스터를 몰라도 되고, 오직 `useFavoritesStore`만 구독합니다.
:::

:::tip 왜 셀렉터가 아니라 구조분해 한 줄인가
* `useStore((s) => s.x)` 같은 셀렉터로 이랬다저랬다 하지 않습니다. **호출부는 스토어 크기와 무관하게 항상 구조분해 한 줄**로 고정합니다.
* 불필요한 리렌더는 호출부가 아니라 **스토어 설계로 막습니다**: "한 관심사 = 작은 스토어" 원칙을 지키면 값들이 항상 같이 바뀌므로, 낭비 리렌더가 생길 구조 자체가 만들어지지 않습니다.
* 그러니 **거대한 만능 스토어를 만들지 마세요.** 관심사별로 작은 스토어를 여러 개 두는 편이 낫습니다.
:::




## 4. ⚠️ 꼭 알아둘 점 — `state` 인자는 "정의부에만" 있습니다
---

액션을 **정의할 때는** 첫 인자 `state`가 있는데, 컴포넌트에서 **부를 때는 없습니다.** 이게 정상입니다.

```ts
// 정의 (스토어 파일)              // 호출 (컴포넌트)
toggle: (state, item) => { ... }   →   toggle(item)   // state 없음!
```

:::info 왜 이렇게 동작하나요
* `state`(현재 상태 = immer draft)는 **`defineStore`가 실행 시점에 자동으로 앞에 끼워 넣습니다.** 개발자가 넘기는 게 아닙니다.
* 흐름: `컴포넌트에서 toggle(item)` → 팩토리가 현재 상태를 자동 주입 → `정의부 toggle(state, item)` 실행 → `state` 직접 변경 → 스토어 갱신.
* 타입도 맞춰져 있어서, 컴포넌트에서 실수로 `toggle(state, item)`처럼 부르면 **타입 에러**가 납니다. `toggle(item)`이 정답입니다.
* 즉, **`state`는 "작성자만 보는 인자"** 라고 생각하면 됩니다.
:::

:::tip 액션 안에서 다른 액션을 부르고 싶다면
* 액션 내부에서 같은 스토어의 다른 액션이 필요하면 `useFavoritesStore.getState().다른액션()` 으로 호출합니다.
:::




## 5. import 경로 규칙
---

```ts
// ✅ 팩토리(도구)는 @axiom/store 로 import
// highlight-start
import { defineStore, createStore } from '@axiom/store';
// highlight-end

// ✅ 도메인 스토어(인스턴스)는 도메인 경로로 import
import { useFavoritesStore } from '@/domains/example/store/favoritesStore';

// ❌ core 내부 경로를 직접 import 하지 않는다
// import { defineStore } from '@/core/store/defineStore';
```

:::info 두 가지만 기억하세요
* **팩토리(도구)** `defineStore` · `createStore` 는 항상 **`@axiom/store`** 에서 가져옵니다. (`useApi`가 `@axiom/hooks`에서 나오는 것과 같은 구조)
* **도메인 스토어(인스턴스)** `useFavoritesStore` 등은 여전히 `@/domains/<도메인>/store/...` 로 가져옵니다. → core와 domain의 경계를 유지합니다.
:::




## 6. (참고) 저수준 대안 — `createStore`
---

`defineStore`로 대부분 충분하지만, immer 없이 **순정 Zustand의 `set`/`get`을 직접 다루고 싶을 때**는 `createStore`를 씁니다. (초기상태, 액션, 옵션을 각각 인자로 받습니다). 하지만 이 방법은 특별한 상황이 아니면 사용하지 않습니다.

```ts
import { createStore } from '@axiom/store';

export const useSessionStore = createStore(
	{ selectedCompany: null as Company | null },   // ① 초기 상태
	(set) => ({                                     // ② 액션 (set/get 직접 사용)
		setSelectedCompany: (c: Company | null) => set({ selectedCompany: c }),
		reset: () => set({ selectedCompany: null }),
	}),
	{ name: 'session', persist: true },             // ③ 옵션
);

// 소비는 defineStore 와 동일 — 구조분해 한 줄
const { selectedCompany, setSelectedCompany } = useSessionStore();
```

:::tip defineStore vs createStore
* **`defineStore`(표준)**: immer 내장 → 액션에서 상태를 **직접 변경**. `set`/`get`을 몰라도 됩니다. **기본으로 이걸 쓰세요.**
* **`createStore`(저수준)**: immer 없이 `set`/`get`으로 **불변 업데이트**를 직접 작성. 순정 Zustand 방식이 필요한 특수한 경우에만 씁니다.
* 두 팩토리 모두 반환값이 순정 Zustand 훅과 동일하므로, **소비 코드(구조분해 한 줄)는 완전히 똑같습니다.**
:::




## 정리
---

1. **위치**: 같은 도메인이 쓰면 `domains/<도메인>/store/`, 여러 도메인이 쓰면 `shared/store/`.
2. **생성**: `defineStore({ name, persist, state, actions })` — 액션은 첫 인자 `state`를 직접 변경.
3. **사용**: `const { 값, 액션 } = useXxxStore();` 구조분해 한 줄로 고정.
4. **주의**: 액션 정의엔 `state`가 있지만 호출할 땐 넘기지 않는다.
5. **import**: 팩토리는 `@axiom/store`, 도메인 스토어는 `@/domains/...`.
