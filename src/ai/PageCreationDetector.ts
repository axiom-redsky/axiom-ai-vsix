export interface PageCreationIntent {
  /** 페이지 생성 요청 여부 */
  isPageCreation: boolean;
  /** 정규화된 PascalCase + Page 접미사 페이지명 (null이면 LLM에 위임) */
  pageName: string | null;
  /** 사용자가 원본으로 입력한 이름 */
  rawName: string | null;
}

/**
 * 채팅 입력에서 페이지 생성 인텐트와 페이지명을 추출한다.
 *
 * 인식 패턴:
 * - "AccountListPage 페이지를 만들어줘" → pageName: "AccountListPage"
 * - "AccountList 페이지 만들어줘"       → pageName: "AccountListPage" (Page 접미사 자동 추가)
 * - "AccountListPage 화면을 만들어줘"   → pageName: "AccountListPage" (화면 키워드 인식)
 * - "account-list 페이지 생성해줘"      → pageName: "AccountListPage" (kebab-case → PascalCase)
 * - "계좌 목록 페이지 만들어줘"          → isPageCreation: true, pageName: null (LLM에 위임)
 */
export class PageCreationDetector {
  /** 페이지 생성 의도를 나타내는 한국어/영어 키워드 */
  private static readonly CREATION_KEYWORDS = [
    '페이지를 만들어',
    '페이지 만들어',
    '페이지를 생성',
    '페이지 생성',
    '페이지를 추가',
    '페이지 추가',
    '화면을 만들어',
    '화면 만들어',
    '화면을 생성',
    '화면 생성',
    '화면을 추가',
    '화면 추가',
    'page를 만들어',
    'page 만들어',
    'page를 생성',
    'page 생성',
    'create page',
    'add page',
  ];

  detect(userInput: string): PageCreationIntent {
    const isPageCreation = this._isPageCreationRequest(userInput);

    if (!isPageCreation) {
      return { isPageCreation: false, pageName: null, rawName: null };
    }

    const rawName = this._extractRawName(userInput);
    const pageName = rawName ? this._normalizeToPascalCasePage(rawName) : null;

    return { isPageCreation: true, pageName, rawName };
  }

  private _isPageCreationRequest(input: string): boolean {
    const lower = input.toLowerCase();
    return PageCreationDetector.CREATION_KEYWORDS.some((kw) =>
      lower.includes(kw.toLowerCase()),
    );
  }

  /**
   * 사용자 입력에서 페이지명 후보를 추출한다.
   * PascalCase 식별자 또는 kebab-case/snake_case 단어를 인식한다.
   * 순수 한국어 이름은 null 반환 (LLM에 네이밍 위임).
   */
  private _extractRawName(input: string): string | null {
    // PascalCase 식별자 (예: AccountListPage, AccountList)
    const pascalMatch = input.match(/\b([A-Z][a-zA-Z0-9]+(?:[A-Z][a-zA-Z0-9]*)*)\b/);
    if (pascalMatch?.[1]) {
      // 단독 대문자 약어 제외 (예: "UI", "API")
      if (pascalMatch[1].length > 2) return pascalMatch[1];
    }

    // kebab-case 또는 snake_case (예: account-list, account_list)
    const kebabMatch = input.match(/\b([a-z][a-z0-9]*(?:[-_][a-z0-9]+)+)\b/);
    if (kebabMatch?.[1]) return kebabMatch[1];

    return null;
  }

  /**
   * 다양한 포맷의 이름을 PascalCase로 변환하고 Page 접미사를 보장한다.
   *
   * - "AccountList"      → "AccountListPage"
   * - "AccountListPage"  → "AccountListPage" (이미 Page 접미사)
   * - "account-list"     → "AccountListPage"
   * - "account_list"     → "AccountListPage"
   */
  private _normalizeToPascalCasePage(raw: string): string {
    let pascal: string;

    if (/^[A-Z]/.test(raw)) {
      // 이미 PascalCase
      pascal = raw;
    } else {
      // kebab-case / snake_case → PascalCase
      pascal = raw
        .split(/[-_]/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join('');
    }

    // Page 접미사가 없으면 추가
    if (!pascal.endsWith('Page')) {
      pascal += 'Page';
    }

    return pascal;
  }
}
