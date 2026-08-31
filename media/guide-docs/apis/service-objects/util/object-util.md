---
sidebar_position: 1
displayed_sidebar: 'apiDocSidebar'
title: '⋮ $util.object'
---

# $util.object

`react-app-scaffold`에서 전역으로 제공하는 **객체(Object) 유틸리티**입니다.
빈 값 검사, 깊은 복사·비교, 키 추리기(pick/omit), 점 표기 경로 접근(get/set), 빈 속성 정리, 깊은 병합 등 업무 로직에서 자주 쓰이는 객체 처리 기능을 제공합니다.

* 외부 라이브러리 의존 없이 순수 함수로 동작합니다. (내부 깊은 복사는 표준 `structuredClone` 사용)
* 별도의 `import` 없이 전역 객체 `$util.object`로 바로 사용합니다.

```ts
// 사용 형태
$util.object.isEmpty({});                       // true
$util.object.pick({ a: 1, b: 2, c: 3 }, ['a', 'c']); // { a: 1, c: 3 }
$util.object.get({ user: { name: 'Tom' } }, 'user.name'); // 'Tom'
```

:::info 원본 불변(immutable)
`set`, `cleanEmpty`, `merge`, `deepClone`, `pick`, `omit` 은 모두 **새 객체를 반환**하며 인자로 받은 원본을 변경하지 않습니다.
:::

---

## isEmpty()

값이 **비어 있는지** 검사합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `value` | `unknown` | ✓ | | 검사할 값 |

* **반환** : `boolean` — 비어 있으면 `true`, 아니면 `false`
* 판정 기준:
  * `null` · `undefined` → `true`
  * 문자열 → **앞뒤 공백 제거(trim) 후** 길이가 `0`이면 `true`
  * 배열 → 요소가 없으면 `true`
  * 객체 → 키가 하나도 없으면 `true`
  * 그 외(숫자·불리언 등) → 항상 `false`

```ts
$util.object.isEmpty(null);        // true
$util.object.isEmpty('   ');       // true (공백만)
$util.object.isEmpty([]);          // true
$util.object.isEmpty({});          // true
$util.object.isEmpty({ a: 1 });    // false
$util.object.isEmpty(0);           // false (숫자)
$util.object.isEmpty(false);       // false
```

:::note $util.string.isEmpty 와의 차이
`$util.string.isEmpty`는 문자열 중심으로 검사하지만, `$util.object.isEmpty`는 **배열·객체의 비어있음**까지 함께 판정합니다.
:::

---

## deepClone()

값의 **깊은 복사본**을 반환합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `value` | `unknown` | ✓ | | 복사할 값 |

* **반환** : `unknown` — 중첩 객체·배열까지 완전히 복사된 새 값
* 내부적으로 표준 [`structuredClone`](https://developer.mozilla.org/docs/Web/API/structuredClone)을 사용합니다. 중첩된 객체도 참조를 공유하지 않습니다.

```ts
const original = { a: 1, b: { c: 2 } };
const copy = $util.object.deepClone(original);

copy.b.c = 99;
original.b.c; // 2 (원본은 영향 없음)
```

:::warning 복사 불가 값
함수, DOM 노드, 클래스 인스턴스 등 `structuredClone`이 지원하지 않는 값이 포함되면 오류가 발생합니다. 순수 데이터 객체(JSON 형태)에 사용하세요.
:::

---

## deepEqual()

두 값을 **깊은 비교**합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `a` | `unknown` | ✓ | | 비교할 값 1 |
| `b` | `unknown` | ✓ | | 비교할 값 2 |

* **반환** : `boolean` — 구조와 값이 모두 같으면 `true`
* 중첩된 객체·배열의 모든 키와 값을 재귀적으로 비교합니다.
* 배열과 객체는 서로 다른 것으로 취급하며, 키 개수가 다르면 `false`입니다.

```ts
$util.object.deepEqual({ x: 1 }, { x: 1 });               // true
$util.object.deepEqual({ a: { b: 2 } }, { a: { b: 2 } }); // true
$util.object.deepEqual({ x: 1 }, { x: 2 });               // false
$util.object.deepEqual([1, 2], [1, 2]);                   // true
$util.object.deepEqual({ x: 1 }, { x: 1, y: 2 });         // false (키 개수 다름)
```

---

## pick()

객체에서 **지정한 키들만 추린** 새 객체를 반환합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `obj` | `Record<string, unknown>` | ✓ | | 대상 객체 |
| `keys` | `string[]` | ✓ | | 남길 키 목록 |

* **반환** : `Record<string, unknown>` — `keys`에 해당하는 속성만 담은 새 객체
* 원본에 **존재하는 키만** 결과에 포함됩니다. (없는 키는 무시)

```ts
$util.object.pick({ a: 1, b: 2, c: 3 }, ['a', 'c']);  // { a: 1, c: 3 }
$util.object.pick({ a: 1, b: 2 }, ['a', 'z']);        // { a: 1 } (없는 키 무시)
```

---

## omit()

객체에서 **지정한 키들을 제외한** 새 객체를 반환합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `obj` | `Record<string, unknown>` | ✓ | | 대상 객체 |
| `keys` | `string[]` | ✓ | | 제외할 키 목록 |

* **반환** : `Record<string, unknown>` — `keys`를 뺀 나머지 속성을 담은 새 객체

```ts
$util.object.omit({ a: 1, b: 2, c: 3 }, ['b']);       // { a: 1, c: 3 }
$util.object.omit({ a: 1, b: 2 }, ['a', 'b']);        // {}
```

:::tip pick vs omit
남길 키가 적으면 `pick`, 뺄 키가 적으면 `omit`을 사용하면 편리합니다. (예: 비밀번호 필드만 제거 → `omit(user, ['password'])`)
:::

---

## get()

**점 표기 경로**로 중첩된 값을 안전하게 읽습니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `obj` | `Record<string, unknown>` | ✓ | | 대상 객체 |
| `path` | `string` | ✓ | | 점(`.`)으로 구분된 경로 |
| `fallback` | `unknown` | | `undefined` | 값이 없을 때 반환할 기본값 |

* **반환** : `unknown` — 경로에 해당하는 값. 경로 중간이 없거나 값이 `undefined`이면 `fallback`
* 중간 경로가 객체가 아니어도 오류 없이 `fallback`을 반환합니다. (안전 접근)

```ts
const data = { user: { name: 'Tom', addr: { city: '서울' } } };

$util.object.get(data, 'user.name');            // 'Tom'
$util.object.get(data, 'user.addr.city');       // '서울'
$util.object.get(data, 'user.age', 0);          // 0 (없으므로 fallback)
$util.object.get(data, 'user.phone.home', '-'); // '-' (중간 경로 없음)
```

---

## set()

**점 표기 경로**에 값을 설정한 **새 객체**를 반환합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `obj` | `Record<string, unknown>` | ✓ | | 대상 객체 |
| `path` | `string` | ✓ | | 점(`.`)으로 구분된 경로 |
| `value` | `unknown` | ✓ | | 설정할 값 |

* **반환** : `Record<string, unknown>` — 값이 반영된 **새 객체** (원본 불변)
* 경로 중간에 객체가 없으면 **빈 객체를 자동 생성**하여 연결합니다.
* 경로 중간이 객체가 아닌 값이면 객체로 덮어씁니다.

```ts
$util.object.set({ a: 1 }, 'b.c', 2);   // { a: 1, b: { c: 2 } }
$util.object.set({ a: 1 }, 'a', 99);    // { a: 99 }

// 원본은 변경되지 않음
const src = { a: 1 };
const next = $util.object.set(src, 'b', 2);
src;  // { a: 1 } (그대로)
next; // { a: 1, b: 2 }
```

---

## cleanEmpty()

`null` · `undefined` · **빈 문자열** 속성을 **재귀적으로 제거**합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `obj` | `Record<string, unknown>` | ✓ | | 대상 객체 |

* **반환** : `Record<string, unknown>` — 빈 값이 제거된 새 객체
* 중첩된 객체도 재귀적으로 정리하며, 정리 후 **비어버린 중첩 객체는 제거**됩니다.
* 제거 대상은 `null` · `undefined` · `''`(빈 문자열)입니다. (`0`, `false`, 빈 배열은 **유지**)

```ts
$util.object.cleanEmpty({ a: 1, b: null, c: '', d: 'x' });
// { a: 1, d: 'x' }

$util.object.cleanEmpty({ a: 1, nested: { b: null, c: '' } });
// { a: 1 } (nested 는 정리 후 비어서 제거됨)

$util.object.cleanEmpty({ a: 0, b: false, c: [] });
// { a: 0, b: false, c: [] } (0/false/빈 배열은 유지)
```

:::tip API 요청 페이로드 정리
검색 폼처럼 값이 비어 있는 파라미터를 서버로 보내지 않으려 할 때, 요청 직전에 `cleanEmpty`로 빈 속성을 걸러내면 편리합니다.
:::

---

## merge()

두 객체를 **깊게 병합**한 새 객체를 반환합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `target` | `Record<string, unknown>` | ✓ | | 기준 객체 |
| `source` | `Record<string, unknown>` | ✓ | | 덮어쓸 객체 (우선순위 높음) |

* **반환** : `Record<string, unknown>` — 병합된 새 객체 (원본 불변)
* 양쪽 모두 **일반 객체**인 속성은 재귀적으로 병합하고, 그 외에는 `source` 값으로 **덮어씁니다.**
* 배열은 병합하지 않고 `source` 값으로 대체됩니다.

```ts
$util.object.merge(
  { a: 1, b: { x: 1 } },
  { b: { y: 2 }, c: 3 },
);
// { a: 1, b: { x: 1, y: 2 }, c: 3 }  (b 는 깊게 병합)

$util.object.merge({ a: 1 }, { a: 99 });      // { a: 99 } (source 우선)
$util.object.merge({ list: [1, 2] }, { list: [3] }); // { list: [3] } (배열은 대체)
```

:::tip 기본 설정 + 사용자 설정 병합
기본값 객체에 사용자 지정 값만 덮어쓸 때 유용합니다. → `merge(defaults, userConfig)`
:::

---

## 활용 예시

여러 함수를 조합한 실제 업무 활용 예시입니다.

```ts
// 1) 검색 폼 값을 정리한 뒤 필요한 필드만 서버로 전송
const form = { keyword: '커피', category: '', page: 1, sort: null };
const cleaned = $util.object.cleanEmpty(form);       // { keyword: '커피', page: 1 }
const payload = $util.object.pick(cleaned, ['keyword', 'page']);

// 2) 응답 객체에서 중첩 값 안전하게 읽기
const res = { data: { user: { profile: { nickname: '길동' } } } };
const nickname = $util.object.get(res, 'data.user.profile.nickname', '이름없음');

// 3) 기본 설정에 사용자 설정 병합
const defaults = { theme: 'light', layout: { sidebar: true, width: 240 } };
const config = $util.object.merge(defaults, { layout: { width: 320 } });
// { theme: 'light', layout: { sidebar: true, width: 320 } }

// 4) 저장 전 원본 보존을 위한 깊은 복사
const draft = $util.object.deepClone(config);
```

:::info 요약
| 함수 | 반환 타입 | 설명 |
| --- | --- | --- |
| `isEmpty(value)` | `boolean` | 비어 있는지 검사 (null/공백/빈 배열/빈 객체) |
| `deepClone(value)` | `unknown` | 깊은 복사본 반환 |
| `deepEqual(a, b)` | `boolean` | 깊은 비교 |
| `pick(obj, keys)` | `object` | 지정 키만 추린 새 객체 |
| `omit(obj, keys)` | `object` | 지정 키를 제외한 새 객체 |
| `get(obj, path, fallback?)` | `unknown` | 점 표기 경로로 안전하게 읽기 |
| `set(obj, path, value)` | `object` | 점 표기 경로에 값 설정 (원본 불변) |
| `cleanEmpty(obj)` | `object` | null/undefined/빈 문자열 재귀 제거 |
| `merge(target, source)` | `object` | 깊은 병합 (source 우선, 원본 불변) |
:::
