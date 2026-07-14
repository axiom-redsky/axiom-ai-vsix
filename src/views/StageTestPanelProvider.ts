import * as vscode from 'vscode';

/**
 * 단계별 테스트 사이드바 — 파이프라인 진행 flow 순서의 단계 목록.
 *
 * 각 항목을 클릭하면 그 단계 전용 테스트 페이지가 에디터 탭으로 열린다
 * (예: 1. 의도파악 → IntentProbePanel). 아직 페이지가 없는 단계는 "예정"으로 표시.
 * 층 정의·순서는 src/ai/README.md(5층 + 보조)와 docs/src-ai-enhancement-progress.md를 따른다.
 */
interface StageDef {
  no: number;
  label: string;
  detail: string;
  ready: boolean;
}

const STAGES: StageDef[] = [
  { no: 1, label: '의도파악', detail: '프롬프트 → 모델 분류기 vs 정규식 폴백 판정 비교 (src/ai/intent)', ready: true },
  { no: 2, label: '분해', detail: '쿼리 토큰화 + 배경·의존성 추출 (src/ai/decompose) — 예정', ready: false },
  { no: 3, label: '위치찾기', detail: '스냅 사다리로 편집 대상 영역 결정 (src/ai/locate) — 예정', ready: false },
  { no: 4, label: '설명서 삽입', detail: '계약카드·prop 인덱스 프롬프트 주입 (src/ai/contracts) — 예정', ready: false },
  { no: 5, label: '게이트·적용', detail: 'sLLM 응답 검증 후 결정론 배치 (src/ai/apply) — 예정', ready: false },
];

class StageItem extends vscode.TreeItem {
  constructor(def: StageDef) {
    super(`${def.no}. ${def.label}`, vscode.TreeItemCollapsibleState.None);
    this.description = def.ready ? '' : '예정';
    this.tooltip = def.detail;
    this.iconPath = new vscode.ThemeIcon(def.ready ? 'beaker' : 'circle-outline');
    this.command = {
      command: 'axiom-ai.openStageTest',
      title: '단계 테스트 열기',
      arguments: [def.no],
    };
  }
}

export class StageTestPanelProvider implements vscode.TreeDataProvider<StageItem> {
  public static readonly viewId = 'axiom-ai.stageTestPanel';

  getTreeItem(element: StageItem): vscode.TreeItem {
    return element;
  }

  getChildren(): StageItem[] {
    return STAGES.map((d) => new StageItem(d));
  }
}
