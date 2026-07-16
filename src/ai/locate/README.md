# locate/ — 위치찾기

분해된 쿼리 토큰으로 편집 대상 **영역(region)**을 결정하는 층.
**스냅 사다리** 방식: 위에서 아래로 순차 시도, 앞 단계 실패 시에만 다음 단계로
(① grep 점수화 → ② 채택+스냅 → 구제 랜드마크 ②.5 유일 테이블/②.7 앵커 품질/②.8 섹션 주석/
②.85 유일 컨트롤 → ②.9 테이블 교정 → ④ 안전 게이트 → ⑤ 후보).
도식: [locate-flow.svg](locate-flow.svg) (로직 흐름도) · `docs/diagrams/02-분해-위치결정.svg`

- 위치: sLLM 콜 **전** (③ 위치찾기)
- 산출물: LocatedRegion (시작·끝 라인, 안전 게이트, 후보 목록, 동봉 재료)
- 모호하면 결정하지 않는다 — 후보를 모델 객관식(disambiguation)으로 위임

## 계기판 (단계별 테스트)

- **3. 위치찾기 테스트** 페이지(`axiom-ai.stageTestPanel` → 3단계) — 프롬프트+현재 파일을 넣으면
  게이트 배지·앵커(라인/점수/매칭 토큰)·채택 영역·모델 객관식 후보·동봉 재료 크기를 보여준다.
  decompose 패널과 동일 원칙 — `locateEditRegion`은 export 순수 함수라 **직접 호출**한다
  (운영 미러 아님 → 동기화 드리프트 0). **후보 행의 "이 후보로 강제" 클릭 = 모델 pick 시뮬레이션**
  (forcedRegion 재실행, 운영 재타겟과 동일 경로). 구현: `src/providers/LocateProbePanel.ts` ·
  `src/webview/locateProbe/LocateProbeApp.tsx`
- 합성 계기판: `eval:region`(적용률·게이트 분포) · `eval:disambig`(+record, 모델 pick 정확도) ·
  `test:region-edit`(간접 안전망) · `eval:bigfile`(큰파일 region 경로)
- 0단계 베이스라인(2026-07-16): eval:region 85%(35/41) — 비적격 6건 중 5건은 정당 가드,
  **실측 실패는 attr-readonly(anchor-import) 1건뿐** = 개선 1번 데이터 포인트.
  상세는 [docs/src-ai-enhancement-progress.md](../../../docs/src-ai-enhancement-progress.md) ③ 카드.

## 구성 파일 (2026-07-13 이관 완료)

- `RegionEdit.ts` — locateEditRegion, snapToElement, firstJsxTag (핵심 스냅 사다리)
  - 외부 참조: `../decompose/` 3건 (CodeSectionExtractor, SectionExtractor, RegionIntent)

## 아직 여기 없는 것 (2단계 이관 대상)

- ⚠ RegionEdit.ts 안의 checkRegionRootTag는 **게이트**(sLLM 후 검증) → 장기적으로 apply/로 분리 검토
