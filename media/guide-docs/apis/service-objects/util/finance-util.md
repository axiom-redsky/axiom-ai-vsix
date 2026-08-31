---
sidebar_position: 1
displayed_sidebar: 'apiDocSidebar'
title: '⋮ $util.finance'
---

# $util.finance

`react-app-scaffold`에서 전역으로 제공하는 **금융 계산 유틸리티**입니다.
단리·복리 이자, 예·적금 만기액, 원리금균등상환(월 상환액·상환 스케줄), 환율 환산, 금액 분할, 부가세 역산 등 금융 업무 화면에서 자주 쓰이는 계산 기능을 제공합니다.

* 외부 라이브러리 의존 없이 순수 함수로 동작합니다.
* 별도의 `import` 없이 전역 객체 `$util.finance`로 바로 사용합니다.

```ts
// 사용 형태
$util.finance.simpleInterest(1000000, 0.05, 2);   // 100000
$util.finance.exchange(100, 1350);                 // 135000
$util.finance.splitAmount(10000, 3);               // [3334, 3333, 3333]
```

:::info 공통 규칙
* **연이율(annualRate)** 은 소수로 입력합니다. (예: 연 5% → `0.05`, 연 6% → `0.06`)
* 금액 계산 결과는 대부분 **원 단위로 반올림**(`Math.round`)됩니다.
* 반올림 과정에서 발생하는 1원 오차는 `splitAmount`(분할)와 `amortization`(상환표 마지막 회차)에서 자동 보정됩니다.
:::

---

## simpleInterest()

**단리 이자액**을 계산합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `principal` | `number` | ✓ | | 원금 |
| `annualRate` | `number` | ✓ | | 연이율 (소수, 예: `0.05`) |
| `years` | `number` | ✓ | | 기간 (년) |

* **반환** : `number` — `원금 × 연이율 × 년수`를 원 단위로 반올림한 **이자액** (원금 제외)
* 계산 결과가 유한한 수가 아니면 `0`을 반환합니다.

```ts
$util.finance.simpleInterest(1000000, 0.05, 2);  // 100000 (100만원 × 5% × 2년)
$util.finance.simpleInterest(1000000, 0.05, 1);  // 50000
```

---

## compoundInterest()

**복리 이자액**을 계산합니다. (원금 제외)

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `principal` | `number` | ✓ | | 원금 |
| `annualRate` | `number` | ✓ | | 연이율 (소수) |
| `years` | `number` | ✓ | | 기간 (년) |
| `timesPerYear` | `number` | | `1` | 연간 복리 횟수 (예: 월복리 → `12`) |

* **반환** : `number` — 복리로 늘어난 **이자액**(만기 수령액 − 원금)을 원 단위로 반올림
* `timesPerYear`가 `0` 이하이면 `0`을 반환합니다.

```ts
// 연 1회 복리 (기본)
$util.finance.compoundInterest(1000000, 0.05, 2);       // 102500

// 월복리 (연 12회)
$util.finance.compoundInterest(1000000, 0.05, 2, 12);   // 104941
```

:::note simpleInterest 와의 차이
`simpleInterest`는 원금에만 이자가 붙지만, `compoundInterest`는 **이자에도 이자가 붙어**(복리) 더 큰 값이 됩니다.
원리금 합계(만기 수령액)가 필요하면 [`maturityAmount()`](#maturityamount)를 사용하세요.
:::

---

## maturityAmount()

**복리 만기 수령액**(원리금 합계)을 계산합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `principal` | `number` | ✓ | | 원금 |
| `annualRate` | `number` | ✓ | | 연이율 (소수) |
| `years` | `number` | ✓ | | 기간 (년) |
| `timesPerYear` | `number` | | `1` | 연간 복리 횟수 |

* **반환** : `number` — **원금 + 복리 이자**의 합계를 원 단위로 반올림한 만기 수령액
* `timesPerYear`가 `0` 이하이면 `0`을 반환합니다.
* `maturityAmount = principal + compoundInterest(...)` 관계가 성립합니다.

```ts
// 월복리 예·적금 만기 수령액
$util.finance.maturityAmount(1000000, 0.05, 2, 12);   // 1104941
$util.finance.maturityAmount(1000000, 0.05, 2);       // 1102500 (연 1회 복리)
```

---

## monthlyPayment()

**원리금균등상환**의 월 상환액을 계산합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `principal` | `number` | ✓ | | 대출 원금 |
| `annualRate` | `number` | ✓ | | 연이율 (소수) |
| `months` | `number` | ✓ | | 총 상환 개월 수 |

* **반환** : `number` — 매월 동일하게 상환하는 금액을 원 단위로 반올림
* 내부적으로 월이율(`연이율 / 12`)을 사용합니다. 무이자(이율 `0`)이면 `원금 / 개월수`가 됩니다.

```ts
// 1,200만원을 연 6%로 12개월 상환
$util.finance.monthlyPayment(12000000, 0.06, 12);  // 1032800

// 무이자 12개월 할부
$util.finance.monthlyPayment(1200000, 0, 12);      // 100000
```

---

## amortization()

**원리금균등상환 스케줄**(회차별 상환표)을 반환합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `principal` | `number` | ✓ | | 대출 원금 |
| `annualRate` | `number` | ✓ | | 연이율 (소수) |
| `months` | `number` | ✓ | | 총 상환 개월 수 |

* **반환** : `AmortizationRow[]` — 회차별 상환 내역 배열. `months`가 `0` 이하이면 빈 배열(`[]`)
* **마지막 회차**는 반올림 누적 오차를 보정하기 위해 남은 잔액을 모두 상환합니다.

각 회차(`AmortizationRow`)의 구조입니다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `round` | `number` | 회차 (1부터) |
| `payment` | `number` | 해당 회차 총 상환액 (원금 + 이자) |
| `principal` | `number` | 원금 상환액 |
| `interest` | `number` | 이자 |
| `balance` | `number` | 상환 후 잔액 |

```ts
$util.finance.amortization(1200000, 0.06, 3);
// [
//   { round: 1, payment: 404007, principal: 398007, interest: 6000, balance: 801993 },
//   { round: 2, payment: 404007, principal: 399997, interest: 4010, balance: 401997 },
//   { round: 3, payment: 404007, principal: 401997, interest: 2010, balance: 0 },
// ]
// 회차가 진행될수록 이자는 줄고 원금 상환액은 늘어납니다.
```

---

## exchange()

**환율을 적용한 환산액**을 계산합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `amount` | `number` | ✓ | | 환산할 금액 |
| `rate` | `number` | ✓ | | 적용 환율 |
| `digits` | `number` | | `0` | 반올림할 소수 자릿수 |

* **반환** : `number` — `금액 × 환율`을 `digits` 자릿수로 반올림한 값

```ts
// 100달러 → 원화 (환율 1,350)
$util.finance.exchange(100, 1350);          // 135000

// 소수 둘째 자리까지 표시
$util.finance.exchange(100, 1350.678, 2);   // 135067.8
```

---

## splitAmount()

총액을 **지정한 개수로 균등 분할**합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `total` | `number` | ✓ | | 분할할 총액 |
| `count` | `number` | ✓ | | 분할 개수 |

* **반환** : `number[]` — 분할된 금액 배열. `count`가 `0` 이하이면 빈 배열(`[]`)
* 나머지(1원 단위)는 **앞에서부터 1원씩 배분**하여, 배열 합계가 `total`과 **정확히 일치**합니다.

```ts
$util.finance.splitAmount(10000, 3);  // [3334, 3333, 3333]  (합계 10000)
$util.finance.splitAmount(10000, 4);  // [2500, 2500, 2500, 2500]
$util.finance.splitAmount(100, 3);    // [34, 33, 33]
```

:::tip 분할 오차 보정
`10000 / 3`은 나누어떨어지지 않지만, `splitAmount`는 나머지 `1`원을 첫 항목에 더해 합계가 원본과 어긋나지 않도록 보장합니다. (N빵 정산, 할부 금액 분할 등)
:::

---

## supplyPrice()

부가세 포함 금액에서 **공급가액을 역산**합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `total` | `number` | ✓ | | 부가세 포함 금액 |
| `rate` | `number` | | `0.1` | 부가세율 (기본 10%) |

* **반환** : `number` — `total / (1 + rate)`를 원 단위로 반올림한 공급가액
* `부가세액 = total − supplyPrice(total)` 으로 계산할 수 있습니다.

```ts
// 11,000원(부가세 포함) → 공급가액 / 부가세
const supply = $util.finance.supplyPrice(11000);   // 10000 (공급가액)
const vat = 11000 - supply;                         // 1000  (부가세)

// 세율을 다르게 지정
$util.finance.supplyPrice(10500, 0.05);            // 10000
```

---

## 활용 예시

여러 함수를 조합한 실제 업무 활용 예시입니다.

```ts
// 1) 예금 만기 시 원금·이자·수령액 요약
const principal = 5000000;
const interest = $util.finance.compoundInterest(principal, 0.045, 3, 12);
const maturity = $util.finance.maturityAmount(principal, 0.045, 3, 12);
// interest: 복리 이자, maturity: 원리금 합계

// 2) 대출 월 상환액과 전체 상환 스케줄
const monthly = $util.finance.monthlyPayment(30000000, 0.055, 36);
const schedule = $util.finance.amortization(30000000, 0.055, 36);
const totalInterest = schedule.reduce((sum, row) => sum + row.interest, 0);
// totalInterest: 총 이자 부담액

// 3) 해외 결제 금액 환산 후 인원수로 분할
const krw = $util.finance.exchange(250, 1342);   // 250달러 → 원화
const perPerson = $util.finance.splitAmount(krw, 4); // 4명 균등 분할 (1원 오차 보정)
```

:::info 요약
| 함수 | 반환 타입 | 설명 |
| --- | --- | --- |
| `simpleInterest(principal, annualRate, years)` | `number` | 단리 이자액 |
| `compoundInterest(principal, annualRate, years, timesPerYear?)` | `number` | 복리 이자액 (원금 제외) |
| `maturityAmount(principal, annualRate, years, timesPerYear?)` | `number` | 복리 만기 수령액 (원리금 합계) |
| `monthlyPayment(principal, annualRate, months)` | `number` | 원리금균등 월 상환액 |
| `amortization(principal, annualRate, months)` | `AmortizationRow[]` | 회차별 상환 스케줄 |
| `exchange(amount, rate, digits?)` | `number` | 환율 적용 환산액 |
| `splitAmount(total, count)` | `number[]` | 총액 균등 분할 (1원 오차 보정) |
| `supplyPrice(total, rate?)` | `number` | 부가세 포함 금액에서 공급가액 역산 |
:::
