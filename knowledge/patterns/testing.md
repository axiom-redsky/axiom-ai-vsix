---
title: "테스트·스토리 작성 패턴"
category: pattern
tags: [test, 테스트, testing, 검증, storybook, 스토리북, story, 스토리, stories, csf, __stories__,
       컴포넌트테스트, 컴포넌트 테스트, 유닛테스트, unit-test, 단위테스트, 훅테스트, hook-test,
       mock, 목, 모킹, mocking, query-mock, api-mock, api모킹, msw, react-testing-library, rtl,
       render, screen, 시각검증, 상태검증, isolation, 격리]
priority: 3
language: ko
scope: pattern
related: [react/component.md, patterns/use-api.md, patterns/error-handling.md]
version: "1.0"
---

# 테스트·스토리 작성 패턴

react-app-scaffold는 컴포넌트를 격리 환경에서 시각·상태 검증하기 위해 **Storybook**(`.storybook/` 설정,
스토리는 `src/__stories__/`)을 사용한다. 단위/통합 테스트의 **러너·라이브러리는 프로젝트 설정에 따르므로**
(scaffold가 특정 러너를 강제하지 않음) 아래 단위 테스트 예시는 RTL류가 구성된 경우의 **일반 패턴**으로 참고한다.

---

## 1. Storybook 스토리 (CSF) — 컴포넌트 상태 검증

컴포넌트의 주요 상태(기본·로딩·에러·빈 상태·variant)를 스토리로 만들어 눈으로 확인한다.
파일은 `src/__stories__/`에 `*.stories.tsx`로 둔다.

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from '@axiom/components/ui';

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Default: Story = { args: { children: '확인' } };
export const Destructive: Story = { args: { variant: 'destructive', children: '삭제' } };
export const Disabled: Story = { args: { disabled: true, children: '대기' } };
```

- 페이지처럼 데이터(`useApi`)에 의존하는 컴포넌트는 **프레젠테이션 컴포넌트를 분리**해 props로 상태를 주입하면
  스토리에서 로딩/에러/정상 케이스를 데이터 없이 그릴 수 있다.

---

## 2. 컴포넌트 단위 테스트 (RTL 구성 시, 일반 패턴)

테스트 러너 + `@testing-library/react`가 설정된 프로젝트라면 아래처럼 렌더·상호작용을 검증한다.

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@axiom/components/ui';

it('클릭하면 onClick이 호출된다', () => {
  const onClick = vi.fn(); // 또는 jest.fn() — 프로젝트 러너에 맞춤
  render(<Button onClick={onClick}>확인</Button>);
  fireEvent.click(screen.getByText('확인'));
  expect(onClick).toHaveBeenCalledTimes(1);
});
```

---

## 3. useApi 의존 컴포넌트 모킹

`useApi`를 쓰는 컴포넌트는 **네트워크를 모킹**해야 결정론적으로 테스트된다. 두 가지 접근:

- **(a) `useApi` 자체를 모킹** — 가장 단순. 훅을 stub해 원하는 `{ data, isPending, error }`를 반환시킨다.

  ```tsx
  vi.mock('@axiom/hooks', () => ({
    useApi: () => ({ data: [{ id: 1, name: '홍길동' }], isPending: false, error: null }),
  }));
  ```

- **(b) HTTP 레벨 모킹(MSW 등)** — 실제 요청 경로까지 검증하고 싶을 때. MSW가 구성된 프로젝트에서
  핸들러로 엔드포인트 응답을 가로챈다. (MSW는 scaffold 기본 포함이 아니므로 도입 여부는 프로젝트에 따름.)

> 컴포넌트를 **데이터 페치(useApi)** 와 **표현(props로 받는 프레젠테이션)** 으로 나눠 두면, 표현 컴포넌트는
> 모킹 없이 props만으로 테스트되고 모킹은 데이터 컴포넌트에만 국한된다(테스트가 단순해짐).

---

## 체크리스트

- [ ] 주요 상태(기본/로딩/에러/빈/variant)를 Storybook 스토리로 만든다(`src/__stories__/*.stories.tsx`).
- [ ] 단위 테스트의 러너·matcher는 프로젝트 설정(vitest/jest 등)에 맞춘다.
- [ ] `useApi` 의존 컴포넌트는 훅 또는 HTTP 레벨에서 모킹한다.
- [ ] 표현 로직은 프레젠테이션 컴포넌트로 분리해 모킹 없이 검증한다.
