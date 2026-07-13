/**
 * cross-file 재타겟 억제 판정 — "현재 파일이 import한 컴포넌트명"이 쿼리에 나와도, 그게 편집 **대상**이
 * 아니라 **사용/위치 기준**으로 쓰였으면 그 컴포넌트 파일로 전환하지 않는다(현재 파일 편집 유지).
 *
 * 배경: "PageHeader 위에 버튼 만들고…" 처럼 컴포넌트명이 **위치 랜드마크**일 때, 단순 이름 매칭이
 * PageHeader.tsx(shared 컴포넌트)를 통째 재작성하려는 조용한 오라우팅이 났다(실측). 경로 하드차단이
 * 아니라 **의도 정밀화**로 푼다 — "X로 적용"=사용, "X 위에/아래에 …"=위치, 둘 다 X는 편집 대상이 아니다.
 *
 * 순수 함수(외부 의존 0) — vscode 없이 단위 테스트 가능하게 분리.
 */

/** 정규식 메타문자 이스케이프(컴포넌트명은 보통 PascalCase지만 방어). */
function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * `name`(컴포넌트)이 편집 대상이 아니라 사용/위치 기준으로 쓰였으면 그 사유를 반환(아니면 null).
 *  - 'use-as'   : "X(으)로 적용/변환/교체/바꿔/사용/만들/구현" — X를 **쓰라**는 뜻(현재 파일 편집).
 *  - 'landmark' : "X 위에/아래에/옆에/앞에/뒤에/근처/사이/상단/하단 …" — X는 **위치 기준**(현재 파일에 추가).
 *
 * 주의: "X**를** 수정/고쳐" 같은 편집 대상 표현은 억제하지 않는다(진짜 cross-file 편집 보존).
 * landmark는 위치 명사에 **조사 '에'가 붙은 형태**(위에/아래에…)만 인정해 "X를 위로 옮겨"(편집)와 구분한다.
 */
export function crossFileSuppressionReason(query: string, name: string): 'use-as' | 'landmark' | null {
  const n = esc(name);
  // "X (컴포넌트)로 적용/…" — 사용 의도.
  const useAs = new RegExp(`${n}\\s*(?:컴포넌트|component)?\\s*(?:으로|로)\\s*(?:적용|변환|교체|바꿔|바꾸|사용|만들|구현)`);
  if (useAs.test(query)) return 'use-as';
  // "X (컴포넌트) 위에/아래에/…" — 위치 랜드마크. 위치명사+'에'(또는 상/하단·근처·사이)로 한정.
  const landmark = new RegExp(
    `${n}\\s*(?:컴포넌트|component)?\\s*(?:위에|위쪽|아래에|아래쪽|밑에|옆에|왼쪽|오른쪽|앞에|뒤에|근처|주변|사이|상단|하단|다음에)`,
  );
  if (landmark.test(query)) return 'landmark';
  return null;
}
