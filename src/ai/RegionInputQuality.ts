/**
 * 입력(다이어트) 품질 측정 — 모델 호출 없이, 조립된 입력만 보고 채점한다.
 *
 * 목적: region/하이브리드 경로가 모델에 보내는 **입력 자체**의 충분성·타깃 정확도를 1급 지표로
 * 분리 측정한다. axiom의 입력 구성 로직(locateEditRegion + depsHeader 절단 + 다이어트)이
 * "정답에 필요한 사실을 다 남겼나 / 엉뚱한 곳을 region으로 줬나"를 **모델과 무관하게** 본다.
 *
 * full 입력은 출시 경로가 아니라 "채점 기준자"로만 쓴다(여기선 source 전체를 oracle로 삼아
 * 다이어트가 빠뜨린 걸 역산). 다이어트는 그대로 두고, 그 품질에만 점수를 매긴다.
 *
 * 검출하는 결함(전부 입력에만 조건부 — 자동 채점 가능):
 *  - region-mistarget   : 쿼리가 특정 컨트롤을 지목했는데 region 루트가 큰 컨테이너(table/div 등).
 *  - control-invisible  : 쿼리가 지목한 컨트롤이 소스엔 존재하나 입력(region+depsHeader)엔 안 보임
 *                         → 모델이 없는 줄 알고 재생성 → 중복.
 *  - edit-locus-readonly: 필터/편집 의도인데, region이 렌더하는 목록 변수의 출처가 읽기전용
 *                         depsHeader에만 있음 → 진짜 편집 지점(useApi params 등)에 손댈 채널 없음.
 *  - anchor-unsafe      : locate 안전 게이트 미통과(주석/import/스냅실패 앵커).
 *  - region-empty       : region이 비었거나 JSX 루트가 없음.
 *
 * 외부 의존성 0 — locateEditRegion + tokenizeQuery + 문자열 분석만.
 */
import { locateEditRegion } from './RegionEdit';
import { CONTAINER_TAGS, EDIT_INTENT_RE, countTag, firstJsxTag, impliedControlTags, mappedListVars } from './RegionIntent';

export type FlagSeverity = 'high' | 'medium' | 'info';

export type FlagCode =
  | 'region-mistarget'
  | 'control-invisible'
  | 'edit-locus-readonly'
  | 'anchor-unsafe'
  | 'region-empty';

export interface InputQualityFlag {
  code: FlagCode;
  severity: FlagSeverity;
  message: string;
}

export interface InputQualityReport {
  query: string;
  located: {
    startLine: number;
    endLine: number;
    regionRootTag: string | null;
    safetyOk: boolean;
    safetyGate: string;
  };
  /** 다이어트 간결성 지표 — 토큰 폭주 감시용(작은 모델 비용). */
  leanness: {
    sourceChars: number;
    regionChars: number;
    depsHeaderChars: number;
    backingChars: number;
    totalInputChars: number;
    /** 입력/원본 비율 (낮을수록 공격적 다이어트) */
    dietRatio: number;
  };
  flags: InputQualityFlag[];
  /** high 심각도 플래그가 하나도 없으면 입력이 "충분(adequate)"하다고 본다. */
  adequate: boolean;
}

/** depsHeader에 그 변수가 **선언 바인딩**으로 등장하는지(읽기전용 출처 판정). */
function isDeclaredIn(text: string, name: string): boolean {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // const/let X | const [X | const {X | = useState 형태 모두 커버하는 느슨한 선언 패턴
  return new RegExp(`\\b(?:const|let|var)\\s+(?:\\[\\s*|\\{\\s*)?${esc}\\b`).test(text);
}

/**
 * 조립된 region 입력의 품질을 채점한다. 모델 호출 없음.
 */
export function analyzeInputQuality(source: string, query: string): InputQualityReport {
  const loc = locateEditRegion(source, query);
  const region = loc.region ?? '';
  const depsHeader = loc.depsHeader ?? '';
  const backing = loc.backingDecls ?? '';
  const rootTag = firstJsxTag(region);
  const flags: InputQualityFlag[] = [];

  // ── anchor-unsafe ─────────────────────────────────────────────
  if (!loc.safety.ok) {
    flags.push({
      code: 'anchor-unsafe',
      severity: 'high',
      message: `locate 안전 게이트 미통과(${loc.safety.gate}) — ${loc.safety.reason}`,
    });
  }

  // ── region-empty ──────────────────────────────────────────────
  if (!region.trim() || !rootTag) {
    flags.push({ code: 'region-empty', severity: 'high', message: 'region이 비었거나 JSX 루트 태그가 없음.' });
  }

  const controls = impliedControlTags(query);
  const inventory = loc.controlInventory ?? '';

  // B+C 경로 활성 여부 — 서버 params 필터(편집의도+useApi params) + 인벤토리가 채워져 있으면,
  // region이 컨테이너여도 모델은 인벤토리(B)로 재생성을 피하고 <replace>(C)로 데이터 소스를 고친다.
  // 이때 region-mistarget·edit-locus-readonly는 "보완됨" — 거짓 경보로 충분/부실 판정을 흐리지 않게 강등/억제.
  const hasServerParamsFilter = EDIT_INTENT_RE.test(query) && /useApi/.test(depsHeader) && /\bparams\s*:/.test(depsHeader);
  const bcActive = hasServerParamsFilter && inventory.trim().length > 0;

  // ── region-mistarget ──────────────────────────────────────────
  // 쿼리가 특정 컨트롤을 지목했는데 region 루트가 큰 컨테이너면, region이 정밀 타깃이 아님.
  // B+C 활성이면 info로 강등(보완됨) — locate 품질 신호로는 남기되 부실 판정엔 안 넣음.
  if (controls.length > 0 && rootTag && CONTAINER_TAGS.has(rootTag)) {
    flags.push({
      code: 'region-mistarget',
      severity: bcActive ? 'info' : 'high',
      message: `쿼리가 [${controls.join(', ')}] 컨트롤을 지목했으나 region 루트는 컨테이너 <${rootTag}> ` +
        `(${loc.startLine}~${loc.endLine}줄).` +
        (bcActive
          ? ` — B(인벤토리)+C(<replace>)로 보완됨(모델은 region 미변경 + 데이터소스 교체). locate 타깃 개선 여지(E).`
          : ` 편집 대상 컨트롤이 region 밖일 가능성 높음.`),
    });
  }

  // ── control-invisible ─────────────────────────────────────────
  // 재생성(중복) 위험의 본질은 "사용자가 손대려는 컨트롤이 **재작성 표면(region)** 안에 없을 때"다.
  // region에 그 컨트롤이 있으면 모델은 제자리에서 고치므로 안전(depsHeader 가시성은 무관 — 거긴
  // 읽기전용이라 어차피 못 고침). 따라서 소스엔 있는데 region엔 0개인 컨트롤만 비가시로 본다.
  // B(컨트롤 인벤토리)가 region 밖 컨트롤을 프롬프트에 노출하면 더 이상 "비가시"가 아니다 → 억제.
  for (const tag of controls) {
    const inSource = countTag(source, tag);
    const inRegion = countTag(region, tag);
    const inInventory = countTag(inventory, tag);
    if (inSource > 0 && inRegion === 0 && inInventory === 0) {
      flags.push({
        code: 'control-invisible',
        severity: 'high',
        message: `<${tag}> 컨트롤이 소스엔 ${inSource}개 있으나 region·인벤토리 어디에도 없음 — 모델이 ` +
          `없는 줄 알고 재생성 → 기존 ${inSource}개와 중복 위험.`,
      });
    }
  }

  // ── edit-locus-readonly ───────────────────────────────────────
  // 필터/편집 의도인데 region이 렌더하는 목록 변수의 출처가 읽기전용 depsHeader에만 있으면,
  // 진짜 편집 지점(useApi params 등)에 손댈 수정 채널이 입력에 없다.
  // 단 B+C 활성이면 그 채널(<replace>)이 이미 프롬프트에 있으므로 억제(거짓 경보 방지).
  if (EDIT_INTENT_RE.test(query) && !bcActive) {
    for (const v of mappedListVars(region)) {
      const inDeps = isDeclaredIn(depsHeader, v);
      const inRegion = isDeclaredIn(region, v);
      const inBacking = isDeclaredIn(backing, v);
      if (inDeps && !inRegion && !inBacking) {
        flags.push({
          code: 'edit-locus-readonly',
          severity: 'medium',
          message: `필터/편집 의도인데 목록 '${v}'의 선언이 읽기전용 depsHeader에만 있음. ` +
            `데이터 소스(useApi params 등)를 고칠 수정 채널이 입력에 없음 → 모델이 클라 필터로 우회하기 쉬움.`,
        });
      }
    }
  }

  const totalInputChars = region.length + depsHeader.length + backing.length;
  const report: InputQualityReport = {
    query,
    located: {
      startLine: loc.startLine,
      endLine: loc.endLine,
      regionRootTag: rootTag,
      safetyOk: loc.safety.ok,
      safetyGate: loc.safety.gate,
    },
    leanness: {
      sourceChars: source.length,
      regionChars: region.length,
      depsHeaderChars: depsHeader.length,
      backingChars: backing.length,
      totalInputChars,
      dietRatio: source.length > 0 ? +(totalInputChars / source.length).toFixed(3) : 0,
    },
    flags,
    adequate: !flags.some((f) => f.severity === 'high'),
  };
  return report;
}
