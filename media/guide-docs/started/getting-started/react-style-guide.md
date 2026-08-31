---
sidebar_position: 1
displayed_sidebar: "startDocSidebar"
title: "코딩스타일"
---


# React 코딩 스타일


## <span class="text-blue-normal">*.tsx</span> 파일명
---
**컴포넌트, 페이지** 이름은 **PascalCase** 형식을 사용합니다.
:::danger 나쁨
```javascript
reservationCard.tsx
reservation-card.tsx
```
:::
:::info 좋음
```javascript
// PascalCase 사용
ReservationCard.tsx
```
:::






## 참조 이름 명
---
**컴포넌트**의 참조명은 **PascalCase** 형식을 사용합니다.  
**변수명, 인스턴스명**은 **camelCase**를 사용합니다.
:::danger 나쁨
```javascript
import reservationCard from './ReservationCard';
const ReservationItem = <ReservationCard />;
```
:::
:::info 좋음
```javascript
// PascalCase 사용(컴포넌트)
import ReservationCard from './ReservationCard';
// camelCase 사용(인스턴스)
const reservationItem = <ReservationCard />;
```
:::






## 디렉토리 루트 요소 이름 지정
---
디렉토리 루트 파일은 `index.tsx`로 지정하고 참조명은 해당 디렉토리명으로 지정합니다.
:::danger 나쁨
```javascript
import Footer from './Footer/Footer';
import Footer from './Footer/index';
```
:::
:::info 좋음
```javascript
import Footer from './Footer';
```
:::





## <span class="text-blue-normal">jsx구문</span>의 속성 정렬
---
다음과 같은 **ESLint**의 정렬 규칙을 따릅니다.
:::danger 나쁨
```jsx
<Foo superLongParam="bar"
     anotherSuperLongParam="baz" />
```
:::
:::info 좋음
```jsx
<Foo
  superLongParam="bar"
  anotherSuperLongParam="baz"
/>
```
:::





## <span class="text-blue-normal">Props</span> 이름
---
prop 이름은 항상 **camelCase**를 사용합니다.  
prop의 값이 컴포넌트명 일때는 **PascalCase**를 사용합니다.  
:::danger 나쁨
```jsx
<Foo
  UserName="hello"
  phone_number={12345678}
/>
```
:::
:::info 좋음
```jsx
<Foo
  userName="hello"
  phoneNumber={12345678}
  Component={SomeComponent}
/>
```
:::





## <span class="text-blue-normal">Refs</span> 할당
---
**ref**에는 항상 콜백함수를 사용합니다.  
:::danger 나쁨
```jsx
<Foo
  ref="myRef"
/>
```
:::
:::info 좋음
```jsx
<Foo
  ref={(ref) => { this.myRef = ref; }}
/>
```
:::





## <span class="text-blue-normal">jsx 엘리먼트</span> 괄호
---
**jsx 엘리먼트**가 두 줄 이상일 경우에는 괄호로 묶습니다.  
:::danger 나쁨
```jsx
render() {
  return <MyComponent variant="long body" foo="bar">
           <MyChild />
         </MyComponent>;
}
```
:::
:::info 좋음
```jsx
render() {
  return (
    <MyComponent variant="long body" foo="bar">
      <MyChild />
    </MyComponent>
  );
}
```
:::