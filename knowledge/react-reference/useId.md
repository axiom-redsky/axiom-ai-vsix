---
title: "useId — 고유 ID 생성 훅"
category: pattern
language: ko
scope: react-reference
source: react.dev
tags: [useid, use-id, 고유id, unique-id, 접근성id, htmlfor, aria, 라벨연결, ssr-id, 안정적id]
---

# useId

`useId`는 접근성 속성 등에 쓸 **고유하고 안정적인 ID**를 생성하는 훅이다(서버·클라이언트 렌더 간 일치).

## 시그니처

```tsx
const id = useId();
```

## 사용법 — 라벨/입력 연결

```tsx
function Field(): React.ReactNode {
  const id = useId();
  return (
    <>
      <label htmlFor={id}>이메일</label>
      <input id={id} type="email" />
    </>
  );
}
```

여러 요소면 접미사를 붙인다: `id="${id}-first"`, `id="${id}-last"`.

## 주의사항

- **리스트의 key 용도로 쓰지 말 것**(key는 데이터에서 파생해야 함).
- 생성된 문자열(예: `:r0:`)에 의존하지 말고 속성 연결에만 사용한다.

---
> 📚 출처: React 공식 문서(react.dev, CC BY 4.0) 요약 — https://ko.react.dev/reference/react/useId
