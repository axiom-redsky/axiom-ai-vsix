---
title: 전역 유틸 $util (숫자·날짜·문자열·금융·객체·배열)
version: "2.0"
tags: [util, 유틸, 유틸리티, 헬퍼, helper, $util, window.util, 공통함수, 공통유틸, format, 포맷, 변환,
       금액, 통화, currency, 쉼표, comma, 천단위, 천단위콤마, 3자리, 콤마, 숫자포맷, number,
       반올림, round, floor, ceil, 버림, 올림, clamp, 범위제한, toNumber, 숫자변환, percent, 퍼센트, 백분율,
       vat, 부가세, 한글금액, toKorean, 축약, abbreviate, 만억조, 증감율, rate, 등락,
       날짜포맷, dateformat, addDays, addMonths, addYears, diffDays, 날짜계산, 영업일, businessday, 공휴일, holiday,
       startOf, endOf, 분기, quarter, 주차, 만나이, age, 윤년, 요일, dayOfWeek, fromNow, 상대시간,
       문자열, string, capitalize, truncate, 말줄임, padStart, 자리수, mask, 마스킹, isEmpty, 공백제거,
       이메일검증, isEmail, 휴대폰, 주민번호, 사업자번호, 카드번호, 초성, chosung, 조사, josa, escapeHtml, base64,
       finance, 금융, 이자, 단리, 복리, simpleInterest, compoundInterest, 만기, 원리금균등, 상환, amortization, 환율, exchange, 공급가액, 분할,
       object, 객체, deepClone, deepEqual, pick, omit, merge, cleanEmpty, 깊은복사, 깊은비교, 경로조회,
       array, 배열, groupBy, sortBy, sum, sumBy, uniq, uniqBy, chunk, toTree, flattenTree, 그룹핑, 트리, 중복제거, 분할, 합계]
scope: scaffold
related: [catalog/overview.md, patterns/router.md, libraries/dayjs.md, utils/cn.md]
---

# 전역 유틸 $util

react-app-scaffold는 공통 유틸을 **전역 `$util`** 로 제공한다. `$router`와 동일하게 **import 없이** 어디서나 쓸 수 있다(전역 등록은 `main.tsx`의 `registerWindowUtil()`이 1회 수행). 타입은 `@/types/common`의 `IUtils`.

```ts
// import 불필요 — 전역으로 바로 사용
$util.number.comma(1234567);     // "1,234,567"
$util.date.format(new Date());   // "2026-06-01"
$util.string.mask('01012345678', 3, 7); // "010****5678"
$util.finance.monthlyPayment(12000000, 0.06, 12); // 원리금균등 월 상환액
$util.object.pick({ a: 1, b: 2, c: 3 }, ['a', 'c']); // { a: 1, c: 3 }
$util.array.groupBy(rows, 'type'); // 키별 그룹핑
```

- 구현 위치: `src/core/utils/util/{date,number,string,finance,object,array}.ts` (`createWindowUtil()`로 조립)
- 루트 타입: `IUtils { date; number; string; finance; object; array }` (`@/types/common`)
- ⛔ 직접 `import { numberUtil } ...` 하지 말고 전역 `$util.number...`로 쓰는 것이 스캐폴드 컨벤션이다. (named export도 있으나 전역 사용 권장)
- 각 유틸의 설명·데모 예시값의 **단일 출처는 `@/types/common`의 인터페이스 JSDoc**이다. 데모 페이지(`domains/example/pages/utils/`)는 이 인터페이스를 파싱해 인터랙티브 예제를 렌더한다.

네임스페이스 6종: **number · date · string · finance · object · array**

---

## 숫자 유틸 — $util.number

금액 표기·반올림/버림/올림·부동소수점 안전 연산·부가세·한글 금액·축약 등.

```ts
$util.number.comma(1234567);          // "1,234,567"
$util.number.round(3.14159, 2);       // 3.14
$util.number.floor(12345.678);        // 12345 (절사)
$util.number.ceil(12345.001);         // 12346 (절상)
$util.number.clamp(15, 0, 10);        // 10
$util.number.toNumber('$ 1,234.50 원'); // 1234.5 (실패 시 fallback)
$util.number.percent(0.1234);         // "12.3%"
$util.number.add(0.1, 0.2);           // 0.3  (부동소수점 오차 보정)
$util.number.vat(10000);              // 1000 (부가세 10%)
$util.number.currency(1234567);       // "1,234,567원"
$util.number.toKorean(12345678);      // "천이백삼십사만오천육백칠십팔"
$util.number.formatFixed(1234.5, 2);  // "1,234.50"
$util.number.abbreviate(12345678);    // "1,234.5만"
$util.number.sign(1200);              // "+1,200" (등락 표시)
$util.number.rate(120, 100);          // 20 (증감율 %)
```

시그니처:
```ts
interface INumberUtil {
  comma(value: number | string): string;            // 천 단위 콤마(금액 표기)
  round(value: number, digits?: number): number;     // 반올림(기본 0)
  floor(value: number, digits?: number): number;     // 버림/절사(기본 0)
  ceil(value: number, digits?: number): number;      // 올림/절상(기본 0)
  clamp(value: number, min: number, max: number): number;
  toNumber(value: unknown, fallback?: number): number; // 문자열→숫자(콤마·기호 제거)
  percent(value: number, digits?: number): string;   // 비율→백분율(기본 1)
  add(a: number, b: number): number;                 // 부동소수점 안전 +
  subtract(a: number, b: number): number;            // 부동소수점 안전 -
  multiply(a: number, b: number): number;            // 부동소수점 안전 ×
  divide(a: number, b: number): number;              // 부동소수점 안전 ÷
  vat(value: number, rate?: number): number;         // 부가세(기본 10%)
  currency(value: number | string, unit?: string): string; // 콤마+단위(기본 "원")
  toKorean(value: number | string): string;          // 한글 금액 표기
  formatFixed(value: number, digits: number): string; // 콤마+소수 고정
  abbreviate(value: number | string): string;        // 만/억/조 축약
  sign(value: number | string): string;              // +/- 부호 콤마(등락)
  rate(current: number, prev: number): number;       // 증감율(%)
}
```

## 날짜 유틸 — $util.date

내부적으로 dayjs(+customParseFormat)를 쓰지만, 날짜는 이 유틸을 통해 다루는 것이 컨벤션이다. 영업일(주말·공휴일 제외) 계산, 시작/끝 경계, 만 나이·분기·주차 등 실무 함수를 포함한다. (dayjs 직접 사용도 가능 — `libraries/dayjs.md`)

```ts
// 변환 / 파싱
$util.date.format(new Date(), 'YYYY-MM-DD'); // "2026-06-01" (기본 YYYY-MM-DD)
$util.date.now();                            // "2026-06-01 14:30:00"
$util.date.parse('2026-06-01', 'YYYY-MM-DD'); // Date | null (엄격 파싱)
$util.date.isValid('2026-13-01');            // false

// 기본 연산
$util.date.addDays(new Date(), 7);
$util.date.addMonths(new Date(), -1);
$util.date.addYears(new Date(), 1);
$util.date.add(new Date(), 2, 'week');       // 단위 가감(year~second)
$util.date.diffDays('2026-12-31', new Date());
$util.date.diffMonths('2026-06-26', '2026-01-01');

// 시작/끝 경계 (배치 집계 범위)
$util.date.startOf(new Date(), 'month');     // 그 달 1일 00:00:00
$util.date.endOf(new Date(), 'day');         // 23:59:59.999
$util.date.firstDayOfMonth(new Date());
$util.date.lastDayOfMonth(new Date());
$util.date.daysInMonth('2026-02-01');        // 28

// 비교 / 판별
$util.date.isBefore(a, b);
$util.date.isBetween('2026-06-26', '2026-06-01', '2026-06-30');
$util.date.isToday(d); $util.date.isPast(d); $util.date.isFuture(d);

// 영업일 (주말·공휴일 제외) — T+2 결제일/어음 만기
$util.date.isBusinessDay('2026-06-26');
$util.date.addBusinessDays(new Date(), 2);
$util.date.diffBusinessDays(a, b);
$util.date.nextBusinessDay(d); $util.date.prevBusinessDay(d);

// 표시 / 기타
$util.date.formatKorean('2026-06-26'); // "2026년 6월 26일"
$util.date.dayOfWeek('2026-06-26');    // "금"
$util.date.fromNow('2026-06-20');      // "6일 전"
$util.date.getQuarter(d);  $util.date.weekOfYear(d);
$util.date.age('1990-05-05');          // 만 나이
$util.date.range('2026-06-01', '2026-06-05'); // Date[]
```

> 공휴일 캘린더는 `setHolidays()`로 서버 영업일 데이터를 주입할 수 있다(부수효과 함수라 `index.ts`에서 `setHolidays/getHolidays`로 별도 export).

시그니처(요약):
```ts
type DateInput = Date | string | number;
type DateUnit = 'year' | 'month' | 'week' | 'day' | 'hour' | 'minute' | 'second';
interface IDateUtil {
  // 변환/파싱
  format(date?: DateInput, template?: string): string; // 기본 'YYYY-MM-DD'
  now(template?: string): string;                      // 기본 'YYYY-MM-DD HH:mm:ss'
  parse(value: DateInput, template?: string): Date | null;
  isValid(value: DateInput): boolean;
  // 연산
  addDays(d: DateInput, n: number): Date;
  addMonths(d: DateInput, n: number): Date;
  addYears(d: DateInput, n: number): Date;
  add(d: DateInput, n: number, unit: DateUnit): Date;
  diffDays(a: DateInput, b: DateInput): number;
  diffMonths(a: DateInput, b: DateInput): number;
  diffYears(a: DateInput, b: DateInput): number;
  // 경계
  startOf(d: DateInput, unit: DateUnit): Date;
  endOf(d: DateInput, unit: DateUnit): Date;
  firstDayOfMonth(d: DateInput): Date;
  lastDayOfMonth(d: DateInput): Date;
  daysInMonth(d: DateInput): number;
  // 비교/판별
  isBefore(a: DateInput, b: DateInput): boolean;
  isAfter(a: DateInput, b: DateInput): boolean;
  isSame(a: DateInput, b: DateInput, unit?: DateUnit): boolean;
  isBetween(d: DateInput, start: DateInput, end: DateInput): boolean;
  isToday(d: DateInput): boolean;
  isPast(d: DateInput): boolean;
  isFuture(d: DateInput): boolean;
  min(a: DateInput, b: DateInput): Date;
  max(a: DateInput, b: DateInput): Date;
  // 영업일
  isWeekend(d: DateInput): boolean;
  isHoliday(d: DateInput): boolean;
  isBusinessDay(d: DateInput): boolean;
  addBusinessDays(d: DateInput, n: number): Date;
  diffBusinessDays(a: DateInput, b: DateInput): number;
  nextBusinessDay(d: DateInput): Date;
  prevBusinessDay(d: DateInput): Date;
  // 표시/기타
  formatKorean(d: DateInput): string;
  dayOfWeek(d: DateInput): string;
  fromNow(d: DateInput): string;
  getQuarter(d: DateInput): number;
  weekOfYear(d: DateInput): number;
  toBusinessDate(d: DateInput): string;  // "20260626"
  age(birth: DateInput): number;
  isLeapYear(d: DateInput): boolean;
  range(start: DateInput, end: DateInput): Date[];
}
```

## 문자열 유틸 — $util.string

기본 가공 + 한국 실무용 검증/마스킹/포맷(주민·사업자·카드·휴대폰)·한글 처리(초성·조사)·보안 인코딩까지 폭넓게 제공한다.

```ts
// 기본
$util.string.isEmpty('   ');             // true
$util.string.capitalize('hello');        // "Hello"
$util.string.truncate('안녕하세요 반갑습니다', 5); // "안녕하세요..."
$util.string.padStart(7, 5);             // "00007"
$util.string.trimAll('  a   b  ');       // "a b"
$util.string.mask('홍길동', 1, 2);        // "홍*동"
$util.string.replaceAll('a-b-c', '-', '/'); // "a/b/c"

// 검증
$util.string.isEmail('user@example.com'); // true
$util.string.isMobile('010-1234-5678');   // true
$util.string.isRRN('960101-1234561');     // 형식+체크섬
$util.string.isBizNo('123-45-67891');     // 사업자번호 체크섬
$util.string.isCardNo('4111-1111-1111-1111'); // Luhn

// 개인정보 마스킹
$util.string.maskName('홍길동');          // "홍*동"
$util.string.maskMobile('010-1234-5678'); // "010-****-5678"
$util.string.maskRRN('960101-1234561');   // "960101-1******"
$util.string.maskEmail('abcdef@example.com'); // "ab****@example.com"

// 포맷(구분자 삽입)
$util.string.formatMobile('01012345678');  // "010-1234-5678"
$util.string.formatBizNo('1234567890');     // "123-45-67890"
$util.string.formatCardNo('1234567812345678'); // "1234-5678-1234-5678"

// 변환(Case) / 추출
$util.string.camelCase('user_name');  // "userName"
$util.string.snakeCase('userName');   // "user_name"
$util.string.onlyNumber('총 1,234원'); // "1234"
$util.string.onlyHangul('abc홍길동123'); // "홍길동"
$util.string.getByteLength('가나다ABC'); // 9 (한글 2byte)
$util.string.cutByByte('가나다라마바사', 8); // 바이트 기준 절단

// 한글 / 보안
$util.string.getChosung('홍길동');     // "ㅎㄱㄷ"
$util.string.josa('사과', '을/를');    // "사과를"
$util.string.escapeHtml('<b>Tom & Jerry</b>'); // XSS 방지
$util.string.base64Encode('안녕하세요');
```

시그니처(요약):
```ts
interface IStringUtil {
  // 기본
  isEmpty(v: unknown): boolean; capitalize(v: string): string;
  truncate(v: string, length: number, suffix?: string): string;
  padStart(v: string | number, length: number, fill?: string): string;
  padEnd(v: string | number, length: number, fill?: string): string;
  removeWhitespace(v: string): string; trimAll(v: string): string;
  mask(v: string, start: number, end: number, maskChar?: string): string;
  reverse(v: string): string;
  replaceAll(v: string, search: string, replacement: string): string;
  // 검증
  isHangul(v: string): boolean; isEnglish(v: string): boolean;
  isNumeric(v: string): boolean; isAlphaNumeric(v: string): boolean;
  isEmail(v: string): boolean; isMobile(v: string): boolean;
  isRRN(v: string): boolean; isBizNo(v: string): boolean;
  isCorpNo(v: string): boolean; isCardNo(v: string): boolean;
  // 마스킹(개인정보)
  maskRRN(v: string): string; maskName(v: string): string;
  maskCardNo(v: string): string; maskAccountNo(v: string): string;
  maskMobile(v: string): string; maskEmail(v: string): string;
  // 포맷(구분자)
  formatMobile(v: string): string; formatBizNo(v: string): string;
  formatRRN(v: string): string; formatCardNo(v: string): string;
  formatBusinessDate(v: string): string; // "20260625" → "2026-06-25"
  // 변환(Case)
  camelCase(v: string): string; snakeCase(v: string): string;
  kebabCase(v: string): string; pascalCase(v: string): string;
  // 추출
  onlyNumber(v: string): string; onlyHangul(v: string): string;
  onlyEnglish(v: string): string; getByteLength(v: string): number;
  cutByByte(v: string, byteLength: number, suffix?: string): string;
  // 한글
  getChosung(v: string): string; josa(v: string, josaPair: string): string;
  // 보안/인코딩
  escapeHtml(v: string): string; unescapeHtml(v: string): string;
  stripTags(v: string): string;
  base64Encode(v: string): string; base64Decode(v: string): string;
}
```

## 금융 유틸 — $util.finance

이자(단리/복리)·예적금 만기·원리금균등 대출 상환·환율·금액 분할·공급가액 역산 등 실무 금융 계산. 모든 금액은 원 단위 반올림.

```ts
$util.finance.simpleInterest(1000000, 0.05, 2);     // 단리 이자액(원금×연이율×년수)
$util.finance.compoundInterest(1000000, 0.05, 2, 12); // 복리 이자액(원금 제외)
$util.finance.maturityAmount(1000000, 0.05, 2, 12);  // 예·적금 만기 수령액(원리금 합)
$util.finance.monthlyPayment(12000000, 0.06, 12);    // 원리금균등 월 상환액
$util.finance.amortization(1200000, 0.06, 3);        // 회차별 원금·이자·잔액 스케줄
$util.finance.exchange(100, 1350);                   // 환산액(환율 적용)
$util.finance.splitAmount(10000, 3);                 // [3334, 3333, 3333] (1원 오차 보정)
$util.finance.supplyPrice(11000);                    // 10000 (부가세 포함→공급가액 역산)
```

시그니처:
```ts
interface AmortizationRow {
  round: number;     // 회차(1부터)
  payment: number;   // 총 상환액(원금+이자)
  principal: number; // 원금 상환액
  interest: number;  // 이자
  balance: number;   // 상환 후 잔액
}
interface IFinanceUtil {
  simpleInterest(principal: number, annualRate: number, years: number): number;
  compoundInterest(principal: number, annualRate: number, years: number, timesPerYear?: number): number;
  maturityAmount(principal: number, annualRate: number, years: number, timesPerYear?: number): number;
  monthlyPayment(principal: number, annualRate: number, months: number): number;
  amortization(principal: number, annualRate: number, months: number): AmortizationRow[];
  exchange(amount: number, rate: number, digits?: number): number;
  splitAmount(total: number, count: number): number[];
  supplyPrice(total: number, rate?: number): number; // 기본 세율 10%
}
```

## 객체 유틸 — $util.object

깊은 복사/비교, 키 선택/제외, 점 표기 경로 조회·설정, 빈 값 정리, 깊은 병합 등. 변형 함수는 **원본 불변**(새 객체 반환).

```ts
$util.object.isEmpty({});                 // true (null/undefined/빈문자열/빈배열/빈객체)
$util.object.deepClone({ a: 1, b: { c: 2 } });
$util.object.deepEqual({ x: 1 }, { x: 1 }); // true
$util.object.pick({ a: 1, b: 2, c: 3 }, ['a', 'c']); // { a: 1, c: 3 }
$util.object.omit({ a: 1, b: 2, c: 3 }, ['b']);      // { a: 1, c: 3 }
$util.object.get({ user: { name: 'Tom' } }, 'user.name'); // "Tom"
$util.object.set({ a: 1 }, 'b.c', 2);     // { a: 1, b: { c: 2 } } (원본 불변)
$util.object.cleanEmpty({ a: 1, b: null, c: '' }); // { a: 1 } — API 페이로드 정리
$util.object.merge({ a: 1, b: { x: 1 } }, { b: { y: 2 }, c: 3 }); // 깊은 병합
```

시그니처:
```ts
interface IObjectUtil {
  isEmpty(value: unknown): boolean;
  deepClone(value: unknown): unknown;
  deepEqual(a: unknown, b: unknown): boolean;
  pick(obj: Record<string, unknown>, keys: string[]): Record<string, unknown>;
  omit(obj: Record<string, unknown>, keys: string[]): Record<string, unknown>;
  get(obj: Record<string, unknown>, path: string, fallback?: unknown): unknown;
  set(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown>;
  cleanEmpty(obj: Record<string, unknown>): Record<string, unknown>;
  merge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown>;
}
```

## 배열 유틸 — $util.array

그룹핑·정렬·합계·중복 제거·분할, 그리고 평면 목록↔트리 변환(메뉴·조직도·계층코드). 정렬 등은 **원본 불변**.

```ts
$util.array.groupBy(rows, 'type');        // { A: [...], B: [...] } — 그리드/리포트 집계
$util.array.sortBy(rows, 'n', 'asc');     // 키 기준 정렬(원본 불변)
$util.array.sum([1, 2, 3, 4]);            // 10
$util.array.sumBy([{ amt: 100 }, { amt: 200 }], 'amt'); // 300 — 금액 컬럼 합계
$util.array.uniq([1, 1, 2, 3, 3]);        // [1, 2, 3]
$util.array.uniqBy([{ id: 1 }, { id: 1 }, { id: 2 }], 'id'); // [{id:1},{id:2}]
$util.array.chunk([1, 2, 3, 4, 5], 2);    // [[1,2],[3,4],[5]] — 페이지/배치 분할

// 평면 ↔ 트리 (기본 키: id / parentId / children)
$util.array.toTree(flatRows);             // 메뉴·조직도·계층코드 → 트리
$util.array.flattenTree(tree);            // 트리 → 평면 목록(children 제거)
```

시그니처:
```ts
interface IArrayUtil {
  groupBy(array: Record<string, unknown>[], key: string): Record<string, Record<string, unknown>[]>;
  sortBy(array: Record<string, unknown>[], key: string, order?: 'asc' | 'desc'): Record<string, unknown>[];
  sum(array: number[]): number;
  sumBy(array: Record<string, unknown>[], key: string): number;
  uniq(array: unknown[]): unknown[];
  uniqBy(array: Record<string, unknown>[], key: string): Record<string, unknown>[];
  chunk(array: unknown[], size: number): unknown[][];
  toTree(flat: Record<string, unknown>[], idKey?: string, parentKey?: string, childrenKey?: string): Record<string, unknown>[];
  flattenTree(tree: Record<string, unknown>[], childrenKey?: string): Record<string, unknown>[];
}
```
