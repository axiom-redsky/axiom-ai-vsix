---
sidebar_position: 1
displayed_sidebar: "documentDocSidebar"
title: "React 컴포넌트 문서화(작업중)"
---

# React 컴포넌트 문서화(작업중)

React 컴포넌트 문서화 + 테스트 + 렌더링 검증 도구






##  Storybook 10 권장 셋업 요약
---
```sh
@storybook/react-vite                  # 프레임워크
@takuma-ru/auto-story-generator        # Story 자동 생성
autodocs tag                           # 문서 자동화
@storybook/addon-vitest                # 컴포넌트 테스트 (Playwright 브라우저 모드)
sb.mock                                # 모듈 모킹 (v10 내장)
CSF Factories + .test()                # Story에 테스트 직접 부착 (v10 신문법)
@storybook/addon-a11y                  # 접근성 검증
@chromatic-com/storybook               # 비주얼 리그레션 (선택)
```
| 기능   | 도구        |
|--------|-------------|
| Story 자동 생성 | auto-story-generator / Nx generator |
| 문서 자동화 | autodocs tag + react-docgen |
| 렌더링 검증 | addon-vitest (Playwright 브라우저 모드) |
| 인터랙션 테스트 | play 함수 / CSF Factories .test() |
| 모킹 | sb.mock (v10 내장) |
| 비주얼 리그레션 | Chromatic |
| 접근성 | addon-a11y |