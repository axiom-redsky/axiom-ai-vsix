# apply/ — 게이트·적용

sLLM 응답을 **검증(게이트)**하고, 통과한 조각을 대상 위치에 **결정론 배치**하는 층.
모델은 조각만 만들고, 어디에 어떻게 꽂을지는 확장이 결정한다.
도식: `docs/diagrams/04-게이트-컴파일러검증.svg`

- 위치: sLLM 콜 **후** (⑤ 게이트·적용)
- 게이트 예: 루트태그 가드(화이트리스트 교체 허용), 중복선언, 미해소 참조,
  파괴적 누락(태그·라인 급감), closer-dropped, tsc 검증-교정 루프(experimental.regionVerify)
- 적용 예: import hoist, import provenance 교정, in-place 훅 파라미터 교체

## 이관 후보 (현재 src/ai/ 직하)

- `StructuralAnchor.ts` — applyStructuralEdit, 게이트 일체 (91KB, 장기적으로 게이트/적용 분할 검토)
- `DiffUtil.ts` — diff 계산 유틸
- RegionEdit.ts의 checkRegionRootTag — locate/에 섞여 있음 (2단계 이관 대상)
