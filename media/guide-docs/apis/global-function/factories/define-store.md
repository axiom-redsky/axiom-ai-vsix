---
sidebar_position: 1
displayed_sidebar: 'apiDocSidebar'
title: '⋮ defineStore'
---

# defineStore


## defineStore()
---

`defineStore()` 는 업무(도메인)별로 **개별 전역 상태 스토어를 정의**하는 **팩토리 함수**입니다. 내부적으로 **Zustand** 와 **immer** 를 기반으로 하며, `state`(초기 상태)와 `actions`(상태 변경 함수)를 하나의 객체로 선언하면 컴포넌트가 곧바로 소비할 수 있는 **커스텀 훅(`useXxxStore`)** 을 만들어 돌려줍니다.

* `defineStore()` **자체는 훅이 아닙니다.** 모듈 최상단에서 한 번 호출되어 훅을 **생성**하는 팩토리 함수이며, 그 반환값인 `useXxxStore` 가 컴포넌트에서 사용하는 훅입니다.
* `set` / `get` 을 직접 다루지 않습니다. 각 액션의 **첫 인자 `state` 로 현재 상태**를 받아 **직접 변경**하면 됩니다. immer 로 감싸므로 불변 스프레드(`{ ...state }`)가 필요 없습니다.
* **devtools** 는 개발 환경(`import.meta.env.DEV`)에서만 자동 부착되고, **persist** 는 `persist: true` 한 줄로 새로고침 후에도 상태가 유지됩니다. (액션 함수는 저장에서 자동 제외)
* 반환값은 **순정 Zustand 훅과 동일**하므로, 소비하는 화면 코드는 팩토리 사용 여부와 무관하게 동작합니다. (셀렉터 구독 / `getState()` 명령형 접근 모두 그대로)

:::info <span class="text-blue-normal admonition-title">defineStore</span> 와 <span class="text-blue-normal admonition-title">createStore</span> 의 차이
같은 `@axiom/store` 안에는 두 개의 스토어 팩토리가 있습니다. **기본은 `defineStore` 를 사용**하세요.

| 팩토리 | 상태 변경 방식 | 특징 |
|--------|---------------|------|
| **`defineStore`** (표준) | 액션 첫 인자 `state`(immer draft)를 **직접 변경** | 작성 편의 우선, `this`·불변 스프레드 불필요 (Pinia 스타일) |
| `createStore` (저수준) | `(set, get) => ({ ... })` 로 **`set` 직접 호출** | immer 없이 순정 불변 업데이트. 세밀한 제어가 필요할 때만 |
:::


## 스토어를 어디에 둘까
---

스토어 파일의 **위치**로 공유 범위를 표현합니다.

| 배치 | 위치 | 사용 시점 |
|------|------|-----------|
| **도메인 전용** | `src/domains/<도메인>/store/` | 해당 도메인 안에서만 공유하는 상태 |
| **공유** | `src/shared/store/` | 여러 도메인이 함께 쓰는 상태 (도메인 전용에서 필요해지면 승격) |

> `src/core/store/` 는 `defineStore` · `createStore` 팩토리가 있는 **불가침 인프라 영역**입니다. 업무 상태를 이곳에 두지 마세요.


## 기본 사용 예제
---
* `defineStore` 를 `@axiom/store` 에서 import 합니다.
```ts
import { defineStore } from '@axiom/store';
```

* 스토어 파일에서 `state` 와 `actions` 를 선언해 스토어 훅을 만듭니다.
```ts
// src/domains/example/store/favoritesStore.ts
import { defineStore } from '@axiom/store';

export interface IFavoriteItem {
    id: string;
    name: string;
    emoji: string;
    price: number;
}

// highlight-start
export const useFavoritesStore = defineStore({
    name: 'example-favorites',
    persist: true,
    state: { items: [] as IFavoriteItem[] },
    actions: {
        // 첫 인자 state 는 현재 상태(immer draft) — 직접 변경하면 된다.
        toggle: (state, item: IFavoriteItem) => {
            const i = state.items.findIndex((x) => x.id === item.id);
            if (i >= 0) state.items.splice(i, 1);
            else state.items.push(item);
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

* 컴포넌트에서는 만들어진 훅을 호출해 소비합니다. **액션의 첫 인자 `state` 는 자동 주입**되므로 **나머지 인자만** 넘깁니다.
```tsx
// FavoriteCatalog.tsx
import { useFavoritesStore, type IFavoriteItem } from '@/domains/example/store/favoritesStore';

export default function FavoriteCatalog(): React.ReactNode {
    // highlight-start
    const { items, toggle } = useFavoritesStore();
    // highlight-end

    const handleClick = (item: IFavoriteItem) => {
        // 정의는 toggle(state, item) 이지만, 호출은 state 없이 item 만 넘긴다.
        // highlight-start
        toggle(item);
        // highlight-end
    };

    return (
        <div>{items.length} 개 담김</div>
    );
}
```

:::info 설명
* `persist: true` 로 설정했으므로 새로고침 후에도 `items` 목록이 유지됩니다. (액션 함수는 저장에서 자동 제외)
* `toggle` 은 정의할 때 `(state, item)` 두 인자지만, 컴포넌트에서 부를 때는 `state` 가 자동 주입되어 `toggle(item)` 으로 호출합니다.
:::


## API 참조
---


### 타입 정의
```ts
export interface IDefineStoreConfig<TState, TActions> {
    /** devtools / persist 를 식별하는 이름 (필수). 스토어마다 고유해야 한다. */
    name: string;
    /** 초기 상태. 여기에 있는 키가 persist 시 저장 대상이 된다. */
    state: TState;
    /** 액션 모음. 각 액션의 첫 인자 state 로 현재 상태(immer draft)를 받아 직접 변경한다. */
    actions: TActions;
    /**
     * 새로고침 후에도 상태를 유지할지 여부. 기본은 미유지.
     * - true : localStorage 에 상태 전체(액션 제외) 저장
     * - 객체 : storage 선택 및 저장 필드 세부 지정
     */
    persist?:
        | boolean
        | {
              storage?: 'local' | 'session';
              partialize?: (state: TState) => Partial<TState>;
          };
}

// highlight-start
function defineStore<TState extends object, TActions>(
    config: IDefineStoreConfig<TState, TActions>,
): UseBoundStore   // → 컴포넌트가 소비하는 useXxxStore 훅
// highlight-end
```


### 매개변수
* **defineStore(<span class="text-blue-big">config</span>)**
    - **config**: 스토어 설정 객체 *(필수)*

      | 옵션 | 타입 | 기본값 | 설명 |
      |------|------|--------|------|
      | `name` | `string` | — | *(필수)* devtools / persist 식별용 이름. **스토어마다 고유**해야 합니다. |
      | `state` | `object` | — | *(필수)* 초기 상태. 여기에 선언된 키가 persist 저장 대상이 됩니다. |
      | `actions` | `Record<string, Function>` | — | *(필수)* 상태 변경 함수 모음. 각 액션의 **첫 인자 `state`** 로 현재 상태(immer draft)를 받아 직접 변경합니다. |
      | `persist` | `boolean \| object` | `false` | 새로고침 후 상태 유지 여부. `true` 면 상태 전체를 저장합니다. |

      **`persist` 를 객체로 줄 때** — 저장소와 저장 필드를 세부 지정합니다.

      | 옵션 | 타입 | 기본값 | 설명 |
      |------|------|--------|------|
      | `storage` | `'local' \| 'session'` | `'local'` | 저장소 선택 (localStorage / sessionStorage) |
      | `partialize` | `(state) => Partial<state>` | 액션 제외 전체 | 저장할 필드를 선별하는 함수 |


### 반환값
* **defineStore()** 는 **순정 Zustand 훅(`useXxxStore`)** 을 반환합니다. `state` 의 각 필드와 `actions` 의 각 함수가 합쳐진 형태입니다.

    | 소비 방식 | 예시 | 설명 |
    |-----------|------|------|
    | **구조분해** | `const { items, toggle } = useFavoritesStore();` | 필요한 상태·액션을 한 번에 꺼냅니다. |
    | **셀렉터 구독** | `const items = useFavoritesStore((s) => s.items);` | 특정 값만 구독해 **불필요한 리렌더링을 최소화**합니다. |
    | **명령형 접근** | `useFavoritesStore.getState().clear();` | 컴포넌트 밖(이벤트 핸들러·다른 액션 등)에서 훅 규칙 없이 접근합니다. |

    :::tip 액션 안에서 다른 액션을 호출하려면
    액션 내부에서 다른 액션이 필요하면 `state` 가 아니라 스토어 훅의 `getState()` 로 접근합니다.
    ```ts
    actions: {
        reset: (state) => { state.items = []; },
        clearAndLog: (state) => {
            useFavoritesStore.getState().reset();  // 다른 액션 호출
        },
    }
    ```
    :::


## 다양한 예제
---

### persist 없이 (새로고침 시 초기화)
```ts
import { defineStore } from '@axiom/store';

export const useCounterStore = defineStore({
    name: 'counter',
    // persist 생략 → 새로고침하면 초기값으로 돌아간다.
    state: { count: 0 },
    actions: {
        increment: (state) => { state.count += 1; },
        decrement: (state) => { state.count -= 1; },
        add: (state, amount: number) => { state.count += amount; },
    },
});
```
:::info 설명
* `persist` 를 생략하면 상태가 메모리에만 존재하며, 새로고침 시 `state` 의 초기값으로 리셋됩니다.
* `add` 처럼 추가 인자가 있는 액션은 컴포넌트에서 `add(10)` 으로 호출합니다. (첫 인자 `state` 는 자동 주입)
:::


### sessionStorage 에 일부 필드만 저장
```ts
import { defineStore } from '@axiom/store';

export const useWizardStore = defineStore({
    name: 'signup-wizard',
    // highlight-start
    persist: {
        storage: 'session',                       // 탭을 닫으면 사라진다
        partialize: (state) => ({ step: state.step }),  // step 만 저장 (draft 는 저장 제외)
    },
    // highlight-end
    state: { step: 1, draft: {} as Record<string, unknown> },
    actions: {
        next: (state) => { state.step += 1; },
        prev: (state) => { state.step -= 1; },
        setDraft: (state, patch: Record<string, unknown>) => {
            state.draft = { ...state.draft, ...patch };
        },
    },
});
```
:::info 설명
* `storage: 'session'` 으로 지정하면 **sessionStorage** 에 저장되어, 탭을 닫으면 상태가 사라집니다.
* `partialize` 로 저장할 필드를 선별합니다. 여기서는 `step` 만 저장하고 `draft` 는 저장에서 제외했습니다.
:::


### 셀렉터로 리렌더링 최적화
```tsx
import { useFavoritesStore } from '@/domains/example/store/favoritesStore';

export default function FavoriteBadge(): React.ReactNode {
    // highlight-start
    // items 배열 전체가 아니라 개수만 구독 → count 가 바뀔 때만 리렌더링
    const count = useFavoritesStore((s) => s.items.length);
    // highlight-end

    return <span>즐겨찾기 {count}</span>;
}
```
:::info 설명
* 구조분해(`const { items } = useFavoritesStore()`) 대신 **셀렉터**를 넘기면, 구독한 값이 바뀔 때만 컴포넌트가 리렌더링됩니다.
* 리스트가 크거나 자주 갱신되는 상태일수록 셀렉터 구독이 성능에 유리합니다.
:::
