---
sidebar_position: 1
displayed_sidebar: "documentDocSidebar"
title: "SEO 최적화(작업중)"
---

# SEO 최적화 (CSR 환경)(작업중)



## aaa
---
```sh
react-helmet-async     → 페이지별 동적 메타 태그
react-snap 또는 Next.js → 사전 렌더링 또는 SSG
sitemap.xml + robots.txt → 크롤러 가이드
구조화 데이터 (JSON-LD)  → 리치 스니펫
Core Web Vitals 최적화  → 검색 순위 신호
```

| 검토 기술      | 판정          | 이유                 |
|----------------|---------------|----------------------|
| Vue-Meta (React에서) | ❌ 사용 불가 | Vue 전용 라이브러리 |
| prerender-spa-plugin | ❌ 비권장 | 사실상 방치, 호환성 문제 |
| react-helmet-async | ✅ 권장 | React CSR 메타 태그 표준 |
| Next.js | ✅ 강력 권장 | 2025 업계 표준 렌더링 전략 |
| react-snap | ✅ 권장 | CSR 구조 유지하며 pre-rendering 가능 |









