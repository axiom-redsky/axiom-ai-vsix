/**
 * CardTemplate — "새 카드 만들기"의 스캐폴딩 원문 (§5 관리 UI: "편집은 파일, 관리는 패널").
 *
 * 패널은 폼 편집기를 만들지 않는다(사용자가 개발자다). 대신 **바로 고칠 수 있는 카드 파일**을
 * 만들어 에디터로 열어준다. 그래서 이 템플릿의 품질 기준은 "예쁜 예시"가 아니라:
 *  - 그 자체로 **파서를 통과**한다(만들자마자 ⚠가 뜨면 스캐폴딩이 아니다 — 테스트로 고정),
 *  - 스키마 어휘를 주석으로 옆에 적어 문서를 찾으러 가지 않아도 되게 한다.
 *
 * 순수 문자열 생성 — fs·vscode 비의존(테스트가 파서에 그대로 먹인다).
 */

import type { TActionType } from './types';

/**
 * 사용자가 저작할 수 있는 카드 종류.
 * `template`·`binding`은 제외한다 — 그 둘은 호스트가 가진 실행기 id(`page`/`api-table`)를 가리키는
 * 카드라, 사용자가 새 id를 지어내도 실행할 실행기가 없다(엔진은 id 해석을 호스트에 위임한다, §2-3).
 */
export type TCardTemplateKind = Extract<TActionType, 'recipe' | 'doc' | 'command'>;
export const CARD_TEMPLATE_KINDS: readonly TCardTemplateKind[] = ['recipe', 'doc', 'command'];

/** 패널 선택지 라벨 — 종류 이름만으론 뭘 만드는지 모른다. */
export const CARD_TEMPLATE_LABELS: Record<TCardTemplateKind, { label: string; detail: string }> = {
  recipe: { label: '레시피 (코드 골격 삽입)', detail: '우리 프로젝트 표준 골격을 카드로 — 슬롯 치환 후 현재 파일에 적용' },
  doc: { label: '문서 (지식문서 렌더)', detail: 'knowledge 문서 하나를 카드로 — 질문에 걸리면 문서를 그대로 보여준다' },
  command: { label: '명령 (VSCode 명령 호출)', detail: '등록된 명령을 카드에서 실행 — 명령 id를 아는 경우' },
};

export interface IBuildCardTemplateOptions {
  /** 미지정 시 id에서 만든 임시 제목. */
  title?: string;
}

const HEADER = (id: string, title: string, icon: string, triggers: string): string =>
  [
    '---',
    'schemaVersion: 1',
    `id: ${id}                       # 파일명(<id>.card.md)과 반드시 일치`,
    `title: ${title}`,
    `icon: ${icon}`,
    `# 트리거 = 이 카드가 뜰 말들. 조사("테이블에")는 넣지 마세요 — 어절 단위로 매칭합니다.`,
    `triggers: [${triggers}]`,
    '# 상황 필터: file-open(파일 열림) / scaffold-detected(스캐폴드 워크스페이스)',
  ].join('\n');

/**
 * 새 카드 파일 원문을 만든다. 결과는 그대로 `<id>.card.md`로 저장하면 되고,
 * **저장 즉시 파서를 통과**한다(경고 없이 카탈로그에 뜬다).
 */
export function buildCardTemplate(
  kind: TCardTemplateKind,
  id: string,
  opts: IBuildCardTemplateOptions = {},
): string {
  const title = opts.title?.trim() || id.replace(/-/g, ' ');
  switch (kind) {
    case 'recipe':
      return [
        HEADER(id, title, '🧩', '검색폼, 검색 조건'),
        'preconditions: [file-open, scaffold-detected]',
        '# 슬롯 = 카드의 칩. source: text | enum | domain-list | endpoint-list | component-list',
        'slots:',
        '  - name: name',
        '    label: 이름',
        '    source: text',
        '    prefillFrom: query',
        'action:',
        '  type: recipe',
        'priority: 10',
        '---',
        '',
        '## 설명',
        `${title} — 이 카드가 무엇을 하는지 한두 줄로 적으세요(패널·카드에 그대로 표시됩니다).`,
        '',
        '## 골격',
        '```tsx',
        '// {{name}} 처럼 슬롯 이름을 쓰면 실행 시 칩 값으로 치환됩니다.',
        'const [{{name}}Params, set{{name}}Params] = useState<T{{name}}Params>({});',
        '```',
        '',
      ].join('\n');

    case 'doc':
      return [
        HEADER(id, title, '📚', '사용법, 가이드'),
        'preconditions: [scaffold-detected]',
        'action:',
        '  type: doc',
        '  # 지식문서 id = knowledge 폴더 기준 상대경로(확장자 없이). .axiom/knowledge가 우선.',
        '  doc: scaffold-docs/use-api',
        'priority: 10',
        '---',
        '',
        '## 설명',
        `${title} — 어떤 문서를 왜 보여주는지 적으세요.`,
        '',
      ].join('\n');

    case 'command':
      return [
        HEADER(id, title, '🛠', '위저드, 마법사'),
        'preconditions: [scaffold-detected]',
        'action:',
        '  type: command',
        '  # VSCode 명령 id. 등록되지 않은 id면 카드가 "준비 중" 안내만 합니다.',
        '  command: axiom-ai.createPageWizard',
        'priority: 10',
        '---',
        '',
        '## 설명',
        `${title} — 이 명령이 무엇을 하는지 적으세요.`,
        '',
      ].join('\n');
  }
}
