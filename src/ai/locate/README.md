# locate/ — 위치찾기

분해된 쿼리 토큰으로 편집 대상 **영역(region)**을 결정하는 층.
**스냅 사다리** 방식: 위에서 아래로 순차 시도, 앞 단계 실패 시에만 다음 단계로.
(유일 JSX텍스트 앵커 → 컨트롤 요소 앵커 → 토큰 스코어 → …)
도식: `docs/diagrams/02-분해-위치결정.svg`

- 위치: sLLM 콜 **전** (③ 위치찾기)
- 산출물: LocatedRegion (시작·끝 라인, 루트 태그, 후보 목록)
- 모호하면 결정하지 않는다 — 후보를 모델 객관식(disambiguation)으로 위임

## 이관 후보 (현재 src/ai/ 직하)

- `RegionEdit.ts` — locateEditRegion, snapToElement, firstJsxTag (핵심 스냅 사다리)
  - ⚠ checkRegionRootTag(게이트)도 같이 들어 있음 → 장기적으로 apply/로 분리 검토
