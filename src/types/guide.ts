// 내장 개발 가이드(Guide Hub) 공유 타입 — 호스트(GuidePanel)·웹뷰(GuideApp)·이관 스크립트 공용.
// docId = 가이드 루트 기준 확장자 없는 상대경로, 구분자는 항상 '/' (예: 'documents/dev/use-rest-api').

/** 가이드 문서를 읽는 출처 — workspace = .axiom/guide (편집 가능), bundled = 확장 동봉 스냅샷 (읽기전용) */
export type TGuideSource = 'workspace' | 'bundled';

export type TTocNode =
  | { type: 'doc'; id: string }
  | { type: 'category'; label: string; collapsed?: boolean; items: TTocNode[] };

export interface ITocSidebar {
  id: string;
  label: string;
  items: TTocNode[];
}

/** _toc.json 스키마. 문서 제목은 담지 않는다 — 호스트가 frontmatter title로 인덱스를 만들어 md 수정이 곧 반영되게 한다. */
export interface ITocManifest {
  version: 1;
  generatedAt?: string;
  sidebars: ITocSidebar[];
}
