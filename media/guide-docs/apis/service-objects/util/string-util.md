---
sidebar_position: 1
displayed_sidebar: 'apiDocSidebar'
title: '⋮ $util.string'
---

# $util.string

`react-app-scaffold`에서 전역으로 제공하는 **문자열(String) 유틸리티**입니다.
기본 가공(빈 값 검사·말줄임·마스킹), 개인정보/금융 번호 **검증·마스킹·포맷**, 케이스 변환, 추출, 한글 처리(초성·조사), HTML/Base64 보안 인코딩까지 업무 화면에서 자주 쓰이는 문자열 처리 기능을 폭넓게 제공합니다.

* 외부 라이브러리 의존 없이 순수 함수로 동작합니다.
* 별도의 `import` 없이 전역 객체 `$util.string`으로 바로 사용합니다.

```ts
// 사용 형태
$util.string.isEmpty('   ');                 // true
$util.string.formatMobile('01012345678');    // '010-1234-5678'
$util.string.maskName('홍길동');              // '홍*동'
$util.string.josa('사과', '을/를');           // '사과를'
```

:::info 번호 관련 함수의 공통 규칙
휴대폰·주민번호·사업자번호·카드번호 등 **번호 관련 함수**(검증 `is*`, 마스킹 `mask*`, 포맷 `format*`)는 입력에서 **숫자만 추출한 뒤** 처리하므로, 하이픈·공백 유무와 무관하게 동작합니다.
:::

---

## 기본

### isEmpty()

값이 **비어 있는지** 검사합니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `value` | `unknown` | ✓ | | 검사할 값 |

* **반환** : `boolean` — 비어 있으면 `true`
* `null` · `undefined` → `true`, 문자열은 **trim 후** 길이가 `0`이면 `true`, 그 외의 값은 `false`

```ts
$util.string.isEmpty(null);      // true
$util.string.isEmpty('   ');     // true (공백만)
$util.string.isEmpty('hello');   // false
$util.string.isEmpty(0);         // false (문자열이 아님)
```

### capitalize()

문자열의 **첫 글자를 대문자**로 변환합니다. (나머지는 그대로 유지)

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `value` | `string` | ✓ | | 변환할 문자열 |

* **반환** : `string` — 첫 글자만 대문자로 바꾼 문자열. 빈 문자열이면 입력값 그대로

```ts
$util.string.capitalize('hello');       // 'Hello'
$util.string.capitalize('hello world'); // 'Hello world' (첫 글자만)
```

### truncate()

문자열이 지정 길이를 넘으면 **잘라내고 말줄임 표시**를 붙입니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `value` | `string` | ✓ | | 대상 문자열 |
| `length` | `number` | ✓ | | 잘라낼 기준 길이 |
| `suffix` | `string` | | `'...'` | 잘린 뒤 붙일 접미사 |

* **반환** : `string` — `length`보다 길면 잘라낸 뒤 `suffix`를 붙인 문자열, 아니면 원본 그대로

```ts
$util.string.truncate('안녕하세요 반갑습니다', 5); // '안녕하세요...'
$util.string.truncate('hello', 10);              // 'hello' (기준 이하)
$util.string.truncate('hello world', 5, '…');    // 'hello…'
```

### padStart() / padEnd()

문자열 **앞쪽 / 뒤쪽을 채워** 지정한 길이를 맞춥니다.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `value` | `string \| number` | ✓ | | 대상 값 (숫자도 허용) |
| `length` | `number` | ✓ | | 채운 뒤의 전체 길이 |
| `fill` | `string` | | `padStart` → `'0'`, `padEnd` → `' '` | 채울 문자 |

* **반환** : `string` — 이미 `length` 이상이면 원본 그대로. 기본 채움 문자가 서로 다름에 주의

```ts
$util.string.padStart(7, 3);        // '007'
$util.string.padStart('A', 4, '-'); // '---A'
$util.string.padEnd('AB', 5);       // 'AB   ' (기본 공백)
$util.string.padEnd('7', 5, '0');   // '70000'
```

### removeWhitespace() / trimAll()

공백을 제거합니다. **제거 방식이 다릅니다.**

| 함수 | 동작 |
| --- | --- |
| `removeWhitespace(value)` | 문자열 내 **모든 공백을 제거** |
| `trimAll(value)` | 앞뒤 공백을 제거하고, 내부 **연속 공백은 하나로** 합침 |

```ts
$util.string.removeWhitespace('  hello  world  '); // 'helloworld'
$util.string.trimAll('  hello   world  ');         // 'hello world'
```

### mask()

문자열의 **특정 구간을 마스킹 문자로 가립니다**.

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `value` | `string` | ✓ | | 대상 문자열 |
| `start` | `number` | ✓ | | 마스킹 시작 인덱스 (0부터) |
| `end` | `number` | ✓ | | 마스킹 끝 인덱스 (해당 위치 직전까지) |
| `maskChar` | `string` | | `'*'` | 가릴 때 사용할 문자 |

* **반환** : `string` — `start`~`end` 직전까지를 가린 문자열
* `start`는 `0` 미만이면 `0`으로, `end`는 길이를 넘으면 길이로 보정됩니다. `start >= end`이면 원본 그대로

```ts
$util.string.mask('01012345678', 3, 7); // '010****5678'
$util.string.mask('홍길동', 1, 2);       // '홍*동'
```

:::tip 번호별 전용 마스킹
주민번호·카드번호·계좌·휴대폰·이메일은 자리 규칙이 정해진 [전용 마스킹 함수](#마스킹-개인정보보호)를 사용하는 것이 편리합니다.
:::

### reverse()

문자열을 **뒤집습니다**.

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | :---: | --- |
| `value` | `string` | ✓ | 대상 문자열 |

* **반환** : `string` — 코드포인트 단위로 뒤집어 이모지 등 서로게이트 페어가 깨지지 않습니다.

```ts
$util.string.reverse('abcde'); // 'edcba'
```

### replaceAll()

문자열의 **모든 일치 부분을 치환**합니다.

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | :---: | --- |
| `value` | `string` | ✓ | 대상 문자열 |
| `search` | `string` | ✓ | 찾을 문자열 |
| `replacement` | `string` | ✓ | 바꿀 문자열 |

* **반환** : `string` — 정규식 특수문자 이스케이프 없이 **문자 그대로** 전체 치환합니다. `search`가 빈 문자열이면 원본 그대로

```ts
$util.string.replaceAll('a-b-c', '-', '/'); // 'a/b/c'
$util.string.replaceAll('1.2.3', '.', ',');  // '1,2,3' (특수문자도 그대로)
```

---

## 검증 (Validation)

형식·체크섬을 검사하여 `boolean`을 반환합니다.

### 문자 종류 검증

문자열이 **특정 문자 종류로만** 이루어졌는지 검사합니다. (빈 문자열은 모두 `false`)

| 함수 | 설명 | 예시 |
| --- | --- | --- |
| `isHangul(value)` | 모두 한글(가–힣)인지 | `isHangul('홍길동')` → `true` |
| `isEnglish(value)` | 모두 영문 알파벳인지 | `isEnglish('Hello')` → `true` |
| `isNumeric(value)` | 모두 숫자(0–9)인지 | `isNumeric('012345')` → `true` |
| `isAlphaNumeric(value)` | 모두 영문 또는 숫자인지 | `isAlphaNumeric('abc123')` → `true` |

```ts
$util.string.isHangul('홍길동');      // true
$util.string.isNumeric('012345');    // true
$util.string.isNumeric('012-345');   // false (하이픈 포함)
```

### isEmail()

**이메일 형식**이 올바른지 확인합니다.

```ts
$util.string.isEmail('user@example.com'); // true
$util.string.isEmail('user@example');     // false
```

### 번호 검증 (체크섬 포함)

각 번호의 **형식과 체크섬**을 검증합니다. 하이픈·공백 유무는 무관합니다.

| 함수 | 대상 | 예시 |
| --- | --- | --- |
| `isMobile(value)` | 휴대폰번호(010 등) | `isMobile('010-1234-5678')` |
| `isRRN(value)` | 주민등록번호 13자리 | `isRRN('960101-1234561')` |
| `isBizNo(value)` | 사업자등록번호 10자리 | `isBizNo('123-45-67891')` |
| `isCorpNo(value)` | 법인등록번호 13자리 | `isCorpNo('110111-1234569')` |
| `isCardNo(value)` | 카드번호(Luhn 검증) | `isCardNo('4111-1111-1111-1111')` |

```ts
$util.string.isMobile('010-1234-5678'); // true
$util.string.isRRN('9601011234561');    // 형식·체크섬 유효 시 true
$util.string.isCardNo('4111111111111111'); // true (Luhn 통과)
```

:::note 검증 범위
`isRRN` · `isBizNo` · `isCorpNo` · `isCardNo`는 **자릿수와 체크섬(수학적 유효성)** 만 검사합니다. 실제 발급·등록 여부를 보장하지는 않습니다.
:::

---

## 마스킹 (개인정보보호)

개인정보·금융 번호의 일부를 가려 화면에 안전하게 표시합니다. 자리 규칙에 맞지 않으면(길이 부족 등) 원본을 그대로 반환합니다.

| 함수 | 설명 | 예시 결과 |
| --- | --- | --- |
| `maskRRN(value)` | 주민번호: 생년월일 + 성별만 노출 | `'960101-1******'` |
| `maskName(value)` | 이름 가운데 글자 가림 (2글자는 뒷 글자) | `'홍*동'`, `'김*'` |
| `maskCardNo(value)` | 카드번호 가운데 가림 (4자리마다 하이픈) | `'1234-****-****-5678'` |
| `maskAccountNo(value)` | 계좌번호: 앞 3·뒤 3자리만 노출 | `'110*******890'` |
| `maskMobile(value)` | 휴대폰번호 가운데 가림 | `'010-****-5678'` |
| `maskEmail(value)` | 이메일 아이디 일부 가림 | `'ab****@example.com'` |

```ts
$util.string.maskRRN('960101-1234561');      // '960101-1******'
$util.string.maskName('홍길동');              // '홍*동'
$util.string.maskName('김철수영희');          // '김***희'
$util.string.maskCardNo('1234567812345678'); // '1234-****-****-5678'
$util.string.maskAccountNo('110-1234-567890'); // '110*******890'
$util.string.maskMobile('010-1234-5678');    // '010-****-5678'
$util.string.maskEmail('abcdef@example.com'); // 'ab****@example.com'
```

---

## 포맷 (구분자 삽입)

숫자만 남긴 뒤 **구분자(하이픈)를 삽입**합니다. 자릿수가 맞지 않으면 원본을 그대로 반환합니다. (`formatCardNo`는 자릿수 제한 없이 4자리마다 삽입)

| 함수 | 변환 예시 |
| --- | --- |
| `formatMobile(value)` | `'01012345678'` → `'010-1234-5678'` |
| `formatBizNo(value)` | `'1234567890'` → `'123-45-67890'` |
| `formatRRN(value)` | `'9601011234561'` → `'960101-1234561'` |
| `formatCardNo(value)` | `'1234567812345678'` → `'1234-5678-1234-5678'` |
| `formatBusinessDate(value)` | `'20260625'` → `'2026-06-25'` |

```ts
$util.string.formatMobile('01012345678');       // '010-1234-5678'
$util.string.formatBizNo('1234567890');         // '123-45-67890'
$util.string.formatBusinessDate('20260625');    // '2026-06-25'

// 입력에 구분자가 이미 있어도 동일하게 동작
$util.string.formatMobile('010 1234 5678');     // '010-1234-5678'
```

---

## 변환 (Case)

식별자 표기법을 상호 변환합니다. 공백 · 하이픈(`-`) · 언더스코어(`_`) · **대소문자 경계(camelHump)** 를 모두 단어 경계로 인식합니다.

| 함수 | 변환 예시 |
| --- | --- |
| `camelCase(value)` | `'user_name'` → `'userName'` |
| `snakeCase(value)` | `'userName'` → `'user_name'` |
| `kebabCase(value)` | `'userName'` → `'user-name'` |
| `pascalCase(value)` | `'user_name'` → `'UserName'` |

```ts
$util.string.camelCase('user_name');   // 'userName'
$util.string.snakeCase('userName');    // 'user_name'
$util.string.kebabCase('user name');   // 'user-name'
$util.string.pascalCase('user-name');  // 'UserName'
```

---

## 추출 (Extract)

### onlyNumber() / onlyHangul() / onlyEnglish()

문자열에서 **특정 문자 종류만 남깁니다**.

| 함수 | 남기는 문자 | 예시 |
| --- | --- | --- |
| `onlyNumber(value)` | 숫자 | `'총 1,234,567원'` → `'1234567'` |
| `onlyHangul(value)` | 한글(자모 포함) | `'abc홍길동123'` → `'홍길동'` |
| `onlyEnglish(value)` | 영문 알파벳 | `'abc홍길동123'` → `'abc'` |

```ts
$util.string.onlyNumber('총 1,234,567원'); // '1234567'
$util.string.onlyHangul('abc홍길동123');    // '홍길동'
$util.string.onlyEnglish('abc홍길동123');   // 'abc'
```

### getByteLength()

문자열의 **바이트 길이**를 계산합니다. (한글 등 비ASCII는 **2byte**로 간주)

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | :---: | --- |
| `value` | `string` | ✓ | 대상 문자열 |

* **반환** : `number` — 레거시 전문 길이 검증 등에 사용

```ts
$util.string.getByteLength('가나다ABC'); // 9 (한글 2byte×3 + 영문 1byte×3)
```

### cutByByte()

지정한 **바이트 길이로 자릅니다**. (한글 2byte 기준)

| 인자 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | :---: | --- | --- |
| `value` | `string` | ✓ | | 대상 문자열 |
| `byteLength` | `number` | ✓ | | 자를 기준 바이트 |
| `suffix` | `string` | | `''` | 잘렸을 때 붙일 접미사 |

* **반환** : `string` — 문자가 경계에 걸치면 포함하지 않고 자릅니다. 잘린 경우에만 `suffix`를 붙입니다.

```ts
$util.string.getByteLength('가나다라마바사');           // 14
$util.string.cutByByte('가나다라마바사', 8, '...');      // '가나다라...'
$util.string.cutByByte('가나다', 10);                   // '가나다' (기준 이하 → 그대로)
```

---

## 한글 (Korean)

### getChosung()

한글 문자열에서 **초성을 추출**합니다.

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | :---: | --- |
| `value` | `string` | ✓ | 대상 문자열 |

* **반환** : `string` — 한글 음절은 초성으로, 그 외 문자는 그대로 유지 (초성 검색 등에 활용)

```ts
$util.string.getChosung('홍길동');   // 'ㅎㄱㄷ'
$util.string.getChosung('안녕 world'); // 'ㅇㄴ world'
```

### josa()

단어의 **받침 유무에 따라 알맞은 조사**를 붙입니다.

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | :---: | --- |
| `value` | `string` | ✓ | 대상 단어 |
| `josaPair` | `string` | ✓ | `'받침있음/받침없음'` 형태의 조사 쌍 |

* **반환** : `string` — 마지막 글자의 받침을 판별해 알맞은 조사를 붙인 문자열
* 마지막 글자가 한글이 아니면 받침 없는 형태로 처리합니다.
* `'으로/로'` 처럼 `'로'`가 포함된 쌍은 **ㄹ 받침**도 받침 없는 형태(`'로'`)를 사용합니다.

```ts
$util.string.josa('사과', '을/를');   // '사과를' (받침 없음)
$util.string.josa('책', '을/를');     // '책을'   (받침 있음)
$util.string.josa('사과', '이/가');   // '사과가'
$util.string.josa('서울', '으로/로'); // '서울로' (ㄹ 받침 예외)
```

---

## 보안 / 인코딩 (Security)

### escapeHtml() / unescapeHtml()

HTML 특수문자를 **엔티티로 이스케이프**하거나 **원래 문자로 복원**합니다.

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | :---: | --- |
| `value` | `string` | ✓ | 대상 문자열 |

* `escapeHtml` : `&` `<` `>` `"` `'` 를 엔티티로 변환 (XSS 방지)
* `unescapeHtml` : 그 반대로 복원

```ts
$util.string.escapeHtml('<b>Tom & Jerry</b>');
// '&lt;b&gt;Tom &amp; Jerry&lt;/b&gt;'

$util.string.unescapeHtml('&lt;b&gt;Tom &amp; Jerry&lt;/b&gt;');
// '<b>Tom & Jerry</b>'
```

### stripTags()

모든 **HTML 태그를 제거**합니다.

```ts
$util.string.stripTags('<p>안녕 <b>세상</b></p>'); // '안녕 세상'
```

### base64Encode() / base64Decode()

문자열을 **Base64로 인코딩 / 디코딩**합니다. (UTF-8 기준이라 한글도 안전)

| 인자 | 타입 | 필수 | 설명 |
| --- | --- | :---: | --- |
| `value` | `string` | ✓ | 대상 문자열 |

```ts
$util.string.base64Encode('Hello');    // 'SGVsbG8='
$util.string.base64Decode('SGVsbG8='); // 'Hello'

// UTF-8 인코딩이라 한글도 왕복 변환 가능
$util.string.base64Decode($util.string.base64Encode('안녕하세요')); // '안녕하세요'
```

---

## 활용 예시

여러 함수를 조합한 실제 업무 활용 예시입니다.

```ts
// 1) 입력한 휴대폰 번호 검증 → 포맷 → 목록에서는 마스킹 표시
const raw = '010 1234 5678';
if ($util.string.isMobile(raw)) {
  const formatted = $util.string.formatMobile(raw); // '010-1234-5678'
  const masked = $util.string.maskMobile(raw);      // '010-****-5678'
}

// 2) 사용자 입력을 화면에 안전하게 출력 (XSS 방지)
const comment = '<script>alert(1)</script>';
const safe = $util.string.escapeHtml(comment);

// 3) 초성 검색용 인덱스 생성
const name = '홍길동';
const chosung = $util.string.getChosung(name); // 'ㅎㄱㄷ'

// 4) 안내 문구에 조사 자동 결합
const item = '연필';
`${item}${$util.string.josa(item, '을/를')} 담았습니다.`; // '연필을 담았습니다.'

// 5) 서버 전문(byte 기준)에 맞춰 이름 자르기
$util.string.cutByByte('홍길동입니다', 6); // '홍길동'
```

:::info 요약
| 함수 | 반환 타입 | 설명 |
| --- | --- | --- |
| **기본** | | |
| `isEmpty(value)` | `boolean` | 비어 있는지(null/undefined/공백) |
| `capitalize(value)` | `string` | 첫 글자 대문자 |
| `truncate(value, length, suffix?)` | `string` | 길이 초과 시 말줄임 |
| `padStart / padEnd(value, length, fill?)` | `string` | 앞/뒤 채우기 |
| `removeWhitespace / trimAll(value)` | `string` | 모든 공백 제거 / 연속 공백 정리 |
| `mask(value, start, end, maskChar?)` | `string` | 구간 마스킹 |
| `reverse(value)` | `string` | 문자열 뒤집기 |
| `replaceAll(value, search, replacement)` | `string` | 전체 치환 |
| **검증** | | |
| `isHangul / isEnglish / isNumeric / isAlphaNumeric(value)` | `boolean` | 문자 종류 검증 |
| `isEmail(value)` | `boolean` | 이메일 형식 |
| `isMobile / isRRN / isBizNo / isCorpNo / isCardNo(value)` | `boolean` | 번호 형식·체크섬 검증 |
| **마스킹** | | |
| `maskRRN / maskName / maskCardNo / maskAccountNo / maskMobile / maskEmail(value)` | `string` | 개인정보 마스킹 |
| **포맷** | | |
| `formatMobile / formatBizNo / formatRRN / formatCardNo / formatBusinessDate(value)` | `string` | 구분자 삽입 |
| **변환(Case)** | | |
| `camelCase / snakeCase / kebabCase / pascalCase(value)` | `string` | 케이스 변환 |
| **추출** | | |
| `onlyNumber / onlyHangul / onlyEnglish(value)` | `string` | 문자 종류별 추출 |
| `getByteLength(value)` | `number` | 바이트 길이(한글 2byte) |
| `cutByByte(value, byteLength, suffix?)` | `string` | 바이트 기준 자르기 |
| **한글** | | |
| `getChosung(value)` | `string` | 초성 추출 |
| `josa(value, josaPair)` | `string` | 받침에 맞는 조사 결합 |
| **보안/인코딩** | | |
| `escapeHtml / unescapeHtml(value)` | `string` | HTML 이스케이프 / 복원 |
| `stripTags(value)` | `string` | HTML 태그 제거 |
| `base64Encode / base64Decode(value)` | `string` | Base64 인코딩 / 디코딩 |
:::
