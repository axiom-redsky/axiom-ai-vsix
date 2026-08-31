---
sidebar_position: 1
displayed_sidebar: "documentDocSidebar"
title: "각 업무 공통함수만들기"
---


# 업무(domain)에서만 사용하는 공통함수 만들기

**react-app-scaffold** 프로젝트는 전역 공통 유틸리티 함수들($ui, $utils, $router 등)을 제공합니다. 그러나 이들 외에도, **각 업무에서만** 사용되는 JavaScript 공통 함수가 필요한 경우가 발생할 수 있습니다. 이러한 경우, 다음과 같이 함수를 생성하여 활용할 수있습니다.
* 여러가지 방법으로 공통함수를 만들 수 있지만, 여기서는 일반적인 **Function** 방식과 **class** 방식 두가지로 알려드립니다.







## 업무(domain) 전용 공통함수 만들기
---


* 업무(domain)별 공통함수를 만들기 위해서는 `domains` 그룹 폴더 내부에 있는 각 업무 폴더, 그 하위에 `common`이라는 폴더를 생성합니다.
* 해당 업무가 **account** 업무라고 가정했을 때, 다음과 같은 구조를 가질 수 있습니다.
* **account** 업무 폴더 내부의 `common` 폴더에 카드 관련 공통 함수 모음인 **card-utils.ts** 파일을 생성해보겠습니다. 업무 상황에 따라 해당 업무에 맞는 공통 함수 파일을 생성하여 이와 같이 작성하면 됩니다. 여기서는 **account** 업무의 특정 공통 함수 예시로 설명합니다.
```sh
mfe-app-main/
├── src
│   ├── domains
│   │   ├── ...
// highlight-start
│   │   └── account # account 업무 폴더
│   │       ├── pages       
│   │       │   ├── MainIndex.tsx      
│   │       │   └── UsageHistory.tsx                               
│   │       ├── common       # 업무 공통 폴더
│   │       │   └── card-utils.ts # 카드 관련 공통 함수 모음
│   │       ├── components   
│   │       │   └── List.tsx 
│   │       ├── router       
│   │       ├── api           
│   │       └── types        
// highlight-end
│   └── ...    
└── ...
```
:::info 설명
* 내가 작업하는 업무는 **account** 라고 가정한다.
* **account** 업무의 하위에는 <span class="text-blue-normal">**api, components, common, hooks, pages, router, store, types**</span>폴더를 가질 수 있다.
* **account** 업무용 JavaScript 공통함수를 만들기 위하여 업무폴더 내부에 **common** 폴더를 생성하고 그 내부에 **card-utils.ts** 파일을 생성한다.
:::





## Function 방식으로 공통함수 만들기
---
### `card-utils.ts` 파일 작성
  - 카드번호를 마스킹 처리하는 공통함수를 만들어 봅니다.
  - 필요한 TypeScript 타입을 정의하고, 카드번호를 마스킹 처리하는 공통함수를 만든 후 `export` 합니다.
```tsx
/**
 * 카드번호 마스킹 옵션 인터페이스
 */
export interface CardMaskOptions {
  /** 마스킹 문자 (기본값: '*') */
  maskChar?: string;
  /** 앞에서 보여줄 자릿수 (기본값: 4) */
  visibleStart?: number;
  /** 뒤에서 보여줄 자릿수 (기본값: 4) */
  visibleEnd?: number;
  /** 구분자 (기본값: '-') */
  separator?: string;
  /** 구분자를 사용할지 여부 (기본값: true) */
  useSeparator?: boolean;
}

/**
 * 카드번호를 마스킹 처리합니다.
 * 
 * @param cardNumber - 마스킹할 카드번호 (숫자 또는 하이픈 포함 문자열)
 * @param options - 마스킹 옵션
 * @returns 마스킹된 카드번호
 */
export const maskCardNumber = (
  cardNumber: string,
  options: CardMaskOptions = {}
): string => {
  const {
    maskChar = '*',
    visibleStart = 4,
    visibleEnd = 4,
    separator = '-',
    useSeparator = true,
  } = options;

  // 카드번호에서 숫자만 추출
  const digitsOnly = cardNumber.replace(/\D/g, '');

  // 유효성 검사
  if (!digitsOnly || digitsOnly.length < 8) {
    return cardNumber; // 유효하지 않은 경우 원본 반환
  }

  const totalLength = digitsOnly.length;
  const maskLength = totalLength - visibleStart - visibleEnd;

  // 앞부분, 마스킹 부분, 뒷부분 생성
  const startPart = digitsOnly.slice(0, visibleStart);
  const maskedPart = maskChar.repeat(Math.max(0, maskLength));
  const endPart = digitsOnly.slice(totalLength - visibleEnd);

  const masked = startPart + maskedPart + endPart;

  // 구분자 추가
  if (useSeparator && totalLength >= 16) {
    // 4자리씩 구분
    return masked.match(/.{1,4}/g)?.join(separator) || masked;
  }

  return masked;
};
```

### `card-utils.ts` 파일 사용
```tsx
import { maskCardNumber } from '@/domains/account/common/card-utils';

// 카드번호 마스킹 처리 함수 사용 -------------------------
const cardNumber = '1234-5678-9012-3456';
const maskedCardNumber = maskCardNumber(cardNumber);
console.log(maskedCardNumber); // 1234-****-****-3456
```







## Class 방식으로 공통함수 만들기
---
  - 카드번호를 마스킹 처리하는 공통함수를 JavaScript Class 방식으로 만들어 봅니다.
  - Singleton 패턴으로 JavaScript Class로 구현되어 즉시 인스턴스가 생성됩니다.
  - 필요한 TypeScript 타입을 정의하고, Class 인스턴스를 `export` 합니다.

### `card-utils.ts` class 파일 작성
```tsx
// account 업무에서만 사용하는 공통 util을 모아놓은 JavaScript class.
export default new (class CardUtils {
  // 만들고자 하는 함수를 만든다.
  /**
   * 카드번호를 마스킹 처리합니다.
   * 
   * @param cardNumber - 마스킹할 카드번호 (숫자 또는 하이픈 포함 문자열)
   * @param options - 마스킹 옵션
   * @returns 마스킹된 카드번호
   */
  maskCardNumber(
    cardNumber: string,
    options: CardMaskOptions = {}
  ): string {
    // 만든 공통함수의 로직 구현...(생략)
    return `[CardUtils][maskCardNumber]함수:: ${cardNumber}, ${options}`;
  }
  // ... 다른 함수 계속 추가 ...
})();

// 업무 화면에서 사용할 때는 아래와 같이 import해서 사용한다.
//import CardUtils from '@/domains/account/common/card-utils';
//CardUtils.maskCardNumber('1234567812345678');
```

### `card-utils.ts` class 파일 사용
```tsx
import CardUtils from '@/domains/account/common/card-utils';

// 카드번호 마스킹 처리 함수 사용 -------------------------
const cardNumber = '1234-5678-9012-3456';
const maskedCardNumber = CardUtils.maskCardNumber(cardNumber);
console.log(maskedCardNumber); // 1234-****-****-3456
```

