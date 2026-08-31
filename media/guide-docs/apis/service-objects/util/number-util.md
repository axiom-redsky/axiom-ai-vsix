---
sidebar_position: 1
displayed_sidebar: 'apiDocSidebar'
title: '⋮ $util.number'
---

# $util.number

`react-app-scaffold`에서 전역으로 제공하는 **숫자(Number) 유틸리티**입니다.
천 단위 콤마·통화·한글 금액 등 표시용 포맷, 반올림/올림/버림, **부동소수점 오차 없는 산술 연산**, 범위 제한, 백분율·증감율 계산 등 업무 화면에서 자주 쓰이는 숫자 처리 기능을 제공합니다.

* 별도의 의존 라이브러리 없이 동작하며, **유효하지 않은 값**(`NaN`, `Infinity` 등)에 대한 안전한 기본값 처리를 지원합니다.
* 별도의 `import` 없이 전역 객체 `$util.number`로 바로 사용합니다.

```ts
// 사용 형태
$util.number.comma(1234567);      // '1,234,567'
$util.number.round(3.14159, 2);   // 3.14
$util.number.add(0.1, 0.2);       // 0.3 (부동소수점 오차 없음)
$util.number.currency(50000);     // '50,000원'
```

:::info 안전한 값 처리
* 문자열을 반환하는 포맷 함수(`comma` · `currency` · `percent` · `formatFixed` · `abbreviate` · `sign` · `toKorean`)는 유효하지 않은 값에 대해 **빈 문자열(`''`)** 을 반환합니다.
* `toNumber()` 는 변환에 실패하면 지정한 **`fallback`(기본 `0`)** 을, `vat()` · `rate()` 는 **`0`** 을 반환합니다.
:::

---

## 포맷 / 표시

숫자를 화면에 표시하기 위한 문자열로 변환합니다.

### comma()

숫자에 **천 단위 콤마(,)** 를 적용한 문자열로 변환합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `value` | `number \| string` | ✓ | | 변환할 숫자. 문자열도 허용 |

* **반환** : `string` — 콤마가 적용된 문자열. 유효하지 않은 값이면 **빈 문자열(`''`)**
* 정수부에만 콤마를 적용하고 **소수부는 그대로 유지**합니다.

```ts
$util.number.comma(1234567);     // '1,234,567'
$util.number.comma('1234567');   // '1,234,567' (문자열 입력)
$util.number.comma(1234.56);     // '1,234.56'  (소수부 유지)
$util.number.comma(-9876543);    // '-9,876,543'
$util.number.comma('잘못된값');   // '' (유효하지 않음)
```

### currency()

천 단위 콤마와 **단위**를 붙여 통화 문자열로 변환합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `value` | `number \| string` | ✓ | | 변환할 숫자 |
| `unit` | `string` | | `'원'` | 뒤에 붙일 단위 |

* **반환** : `string` — 예: `'1,234,567원'`. 유효하지 않은 값이면 `''`

```ts
$util.number.currency(1234567);         // '1,234,567원'
$util.number.currency(50000, ' USD');   // '50,000 USD'
```

### formatFixed()

천 단위 콤마와 함께 **소수 자릿수를 고정**합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `value` | `number` | ✓ | | 변환할 숫자 |
| `digits` | `number` | ✓ | | 고정할 소수 자릿수 |

* **반환** : `string` — 소수부를 `digits` 자리로 **채워서**(0 포함) 표시. 유효하지 않은 값이면 `''`
* `comma()`와 달리 소수 자릿수가 모자라면 `0`으로 채웁니다.

```ts
$util.number.formatFixed(1234.5, 2);   // '1,234.50' (소수 0 채움)
$util.number.formatFixed(1234.567, 2); // '1,234.57' (반올림)
$util.number.formatFixed(-1234, 1);    // '-1,234.0'
```

### percent()

숫자를 **백분율(%) 문자열**로 변환합니다. (예: `0.25` → `'25.0%'`)

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `value` | `number` | ✓ | | 변환할 비율 값(0~1 기준) |
| `digits` | `number` | | `1` | 표시할 소수 자릿수 |

* **반환** : `string` — `%`가 붙은 백분율 문자열. 유효하지 않은 값이면 `''`
* 입력 값에 `100`을 곱한 뒤 `digits` 자리까지 표시합니다.

```ts
$util.number.percent(0.25);      // '25.0%'
$util.number.percent(0.1234, 2); // '12.34%'
$util.number.percent(0.5, 0);    // '50%'
$util.number.percent(1.5);       // '150.0%' (1 이상도 처리)
$util.number.percent(NaN);       // ''
```

### sign()

**부호(+/-)** 를 붙인 콤마 문자열로 변환합니다. (등락 표시용)

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `value` | `number \| string` | ✓ | | 변환할 숫자 |

* **반환** : `string` — 양수는 `+`, 음수는 `-`를 붙인 콤마 문자열. 유효하지 않은 값이면 `''`
* `0`에는 부호를 붙이지 않습니다.

```ts
$util.number.sign(1200);   // '+1,200'
$util.number.sign(-1200);  // '-1,200'
$util.number.sign(0);      // '0'
```

### abbreviate()

**만/억/조 단위**로 축약 표기합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `value` | `number \| string` | ✓ | | 변환할 숫자 |

* **반환** : `string` — 만 단위 이상이면 축약, 미만이면 콤마 문자열. 유효하지 않은 값이면 `''`
* **소수 첫째 자리까지** 버림하여 표기합니다.

```ts
$util.number.abbreviate(12345678);   // '1,234.5만'
$util.number.abbreviate(150000000);  // '1.5억'
$util.number.abbreviate(9500);       // '9,500' (만 미만은 콤마만)
```

### toKorean()

숫자를 **한글 금액 표기**로 변환합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `value` | `number \| string` | ✓ | | 변환할 숫자 |

* **반환** : `string` — 한글로 읽은 금액. 유효하지 않은 값이면 `''`
* **정수 부분만** 변환하며(소수부는 버림), 음수는 `'마이너스 '`를 앞에 붙입니다.
* 십·백·천 자리의 `1`은 `'일'`을 생략합니다. (예: `100` → `'백'`)

```ts
$util.number.toKorean(12345678); // '천이백삼십사만오천육백칠십팔'
$util.number.toKorean(100);      // '백'
$util.number.toKorean(0);        // '영'
$util.number.toKorean(-5000);    // '마이너스 오천'
```

---

## 반올림 / 올림 / 버림

지정한 소수 자릿수를 기준으로 자릿수를 조정합니다. `digits`가 **음수**이면 정수부(십·백 단위 등)를 조정합니다.

### round()

지정한 **소수 자릿수로 반올림**합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `value` | `number` | ✓ | | 반올림할 숫자 |
| `digits` | `number` | | `0` | 유지할 소수 자릿수 |

* **반환** : `number` — 반올림된 숫자

```ts
$util.number.round(3.14159);     // 3
$util.number.round(3.14159, 2);  // 3.14
$util.number.round(12345, -2);   // 12300 (음수 자릿수 → 자리 올림)
```

### floor()

지정한 **소수 자릿수로 버림(내림)** 합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `value` | `number` | ✓ | | 대상 숫자 |
| `digits` | `number` | | `0` | 유지할 소수 자릿수 |

* **반환** : `number` — 버림된 숫자 (`Math.floor` 기준이므로 음수는 더 작은 쪽으로)

```ts
$util.number.floor(12345.678);    // 12345
$util.number.floor(1.238, 2);     // 1.23
$util.number.floor(-1.5);         // -2
```

### ceil()

지정한 **소수 자릿수로 올림**합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `value` | `number` | ✓ | | 대상 숫자 |
| `digits` | `number` | | `0` | 유지할 소수 자릿수 |

* **반환** : `number` — 올림된 숫자

```ts
$util.number.ceil(12345.001);   // 12346
$util.number.ceil(1.231, 2);    // 1.24
```

---

## 정밀 산술 연산

`0.1 + 0.2 !== 0.3` 과 같은 **부동소수점 오차 없이** 사칙연산을 수행합니다. 금액·수량 계산에 사용하세요.

### add() / subtract() / multiply() / divide()

두 수를 **부동소수점 오차 없이** 더하기 / 빼기 / 곱하기 / 나누기 합니다.

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | :---: | --- |
| `a` | `number` | ✓ | 피연산자 1 |
| `b` | `number` | ✓ | 피연산자 2 |

* **반환** : `number` — 오차가 보정된 계산 결과

```ts
// 일반 연산의 부동소수점 오차
0.1 + 0.2;                       // 0.30000000000000004

$util.number.add(0.1, 0.2);      // 0.3
$util.number.subtract(0.3, 0.1); // 0.2
$util.number.multiply(0.1, 3);   // 0.3
$util.number.divide(0.3, 0.1);   // 3
```

---

## 값 처리

### clamp()

값을 지정한 **최소·최대 범위 안으로 제한**합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `value` | `number` | ✓ | | 제한할 값 |
| `min` | `number` | ✓ | | 최솟값 |
| `max` | `number` | ✓ | | 최댓값 |

* **반환** : `number` — `min`보다 작으면 `min`, `max`보다 크면 `max`, 그 사이이면 원래 값

```ts
$util.number.clamp(120, 0, 100);  // 100 (최댓값으로 제한)
$util.number.clamp(-20, 0, 100);  // 0   (최솟값으로 제한)
$util.number.clamp(50, 0, 100);   // 50  (범위 내 → 그대로)
```

### toNumber()

임의의 값을 **숫자로 변환**합니다. 변환할 수 없으면 `fallback`을 반환합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `value` | `unknown` | ✓ | | 변환할 값 |
| `fallback` | `number` | | `0` | 변환 실패 시 반환할 기본값 |

* **반환** : `number` — 변환된 숫자. 실패 시 `fallback`
* 문자열의 경우 **숫자·부호·소수점만 남기고** 콤마·통화기호 등은 제거한 뒤 변환합니다.

```ts
$util.number.toNumber(123);          // 123
$util.number.toNumber('1,234,567');  // 1234567
$util.number.toNumber('₩12,000');    // 12000
$util.number.toNumber('-3.14');      // -3.14
$util.number.toNumber('abc');        // 0 (실패 → fallback)
$util.number.toNumber('abc', -1);    // -1
```

---

## 금융 / 비율

### vat()

공급가액에 대한 **부가가치세액**을 계산합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `value` | `number` | ✓ | | 공급가액 |
| `rate` | `number` | | `0.1` | 부가세율 (기본 10%) |

* **반환** : `number` — `공급가액 × 세율`을 원 단위로 반올림한 세액. 유효하지 않은 값이면 `0`

```ts
$util.number.vat(10000);        // 1000
$util.number.vat(33333);        // 3333 (반올림)
$util.number.vat(10000, 0.05);  // 500
```

:::note $util.finance.supplyPrice 와의 관계
`vat()`는 **공급가액 → 세액**을 계산하고, [`$util.finance.supplyPrice()`](./finance-util#supplyprice)는 반대로 **부가세 포함 금액 → 공급가액**을 역산합니다.
:::

### rate()

이전값 대비 **증감율(%)** 을 계산합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `current` | `number` | ✓ | | 현재 값 |
| `prev` | `number` | ✓ | | 이전(기준) 값 |

* **반환** : `number` — `(현재 − 이전) / 이전 × 100`을 **소수 둘째 자리까지 반올림**한 값
* `prev`가 `0`이거나 유효하지 않은 값이면 `0`을 반환합니다.

```ts
$util.number.rate(120, 100);  // 20   (20% 상승)
$util.number.rate(80, 100);   // -20  (20% 하락)
$util.number.rate(133, 120);  // 10.83
$util.number.rate(100, 0);    // 0    (기준값 0 → 0)
```

---

## 활용 예시

여러 함수를 조합한 실제 업무 활용 예시입니다.

```ts
// 1) 사용자가 입력한 금액 문자열을 숫자로 변환 후 통화 표시
const input = '1,250,000';
const amount = $util.number.toNumber(input);   // 1250000
$util.number.currency(amount);                 // '1,250,000원'

// 2) 공급가액에서 부가세·합계 계산 (부동소수점 오차 방지)
const supply = 33333;
const tax = $util.number.vat(supply);          // 3333
const total = $util.number.add(supply, tax);   // 36666

// 3) 전월 대비 매출 증감을 부호와 함께 표시
const growth = $util.number.rate(13200, 12000); // 10
const label = `${$util.number.sign(growth)}%`;  // '+10%'

// 4) 큰 금액을 축약 표기
$util.number.abbreviate(123456789);            // '1.2억'

// 5) 평점 입력 값을 0~5 범위로 제한하고 소수 1자리로 반올림
$util.number.round($util.number.clamp(5.4, 0, 5), 1); // 5
```

:::info 요약
| 함수 | 반환 타입 | 설명 |
| --- | --- | --- |
| **포맷 / 표시** | | |
| `comma(value)` | `string` | 천 단위 콤마 적용 (실패 시 `''`) |
| `currency(value, unit?)` | `string` | 콤마 + 단위 통화 문자열 (기본 `'원'`) |
| `formatFixed(value, digits)` | `string` | 콤마 + 소수 자릿수 고정 (0 채움) |
| `percent(value, digits?)` | `string` | 백분율 문자열 (기본 소수 1자리) |
| `sign(value)` | `string` | 부호(+/-)를 붙인 콤마 문자열 |
| `abbreviate(value)` | `string` | 만/억/조 단위 축약 |
| `toKorean(value)` | `string` | 한글 금액 표기 |
| **반올림 / 올림 / 버림** | | |
| `round(value, digits?)` | `number` | 반올림 |
| `floor(value, digits?)` | `number` | 버림(내림) |
| `ceil(value, digits?)` | `number` | 올림 |
| **정밀 산술 연산** | | |
| `add / subtract / multiply / divide(a, b)` | `number` | 부동소수점 오차 없는 사칙연산 |
| **값 처리** | | |
| `clamp(value, min, max)` | `number` | 값을 min~max 범위로 제한 |
| `toNumber(value, fallback?)` | `number` | 값을 숫자로 변환 (실패 시 `fallback`) |
| **금융 / 비율** | | |
| `vat(value, rate?)` | `number` | 부가가치세액 (기본 10%) |
| `rate(current, prev)` | `number` | 이전값 대비 증감율(%) |
:::
