---
sidebar_position: 1
displayed_sidebar: "documentDocSidebar"
title: "UI 컴포넌트 사용하기"
---


# UI 컴포넌트 사용하기

:::info 작업 내용
* **react-app-scaffold**에서 제공하는 기본 UI 컴포넌트를 사용하여 화면을 구성하는 방법을 설명합니다.
:::




:::tip UI 컴포넌트 전체 목록
[UI 컴포넌트 전체 목록 참조](../../components/)
:::




## 공통 UI 컴포넌트 사용
* **@axiom/components/ui** 에서 제공하는 다양한 공통 UI 컴포넌트를 사용할 수 있습니다.
* 현재 제공되는 주요 컴포넌트는 다음과 같습니다. (계속 추가 중)
    * **Accordion**: 접이식 콘텐츠 패널
    * **Alert & AlertDialog**: 알림 및 확인 다이얼로그
    * **Badge**: 상태 표시 배지
    * **Button**: 다양한 스타일의 버튼
    * **Calendar**: 날짜 선택 캘린더
    * **Checkbox**: 체크박스 입력
    * **Dialog**: 모달 다이얼로그
    * **Icon**: 아이콘 컴포넌트
    * **Input**: 텍스트 입력 필드
    * **Select**: 드롭다운 선택
    * **Spinner**: 로딩 스피너
    * **Table**: 데이터 테이블








## 기본 예제
---
* `react-app-scaffold` 에서 제공하는 기본 UI 컴포넌트 중 **Button** 컴포넌트를 예제로 사용하겠습니다.
* 모든 UI 컴포넌트는 `@axiom/components/ui`에서 **import** 해서 사용합니다.
```tsx
import { Button } from '@axiom/components/ui';
```
* **import** 한 컴포넌트를 **페이지**의 적절한 위치에 세팅합니다.
```tsx
export default function SampleComponent(): React.ReactNode {
  return (
    // highlight-start
    <Button>Click me</Button>
    // highlight-end
  );
}
```

* UI 컴포넌트 마다 해당하는 기능을 활용하여 로직을 구현합니다. **Button** 컴포넌트는 클릭 이벤트를 통해 원하는 로직을 구현할 수 있습니다.
* 자세한 컴포넌트 가이드는 **Components** 메뉴에서 확인할 수 있습니다.

```tsx
import { Button } from '@axiom/components/ui';

export default function SampleComponent(): React.ReactNode {
  // highlight-start
  const handleClick = () => {
    $ui.alert('버튼 클릭!');
  };
  // highlight-end

  return (
    // highlight-start
    <Button onClick={handleClick}>Click me</Button>
    // highlight-end
  );
}
```



