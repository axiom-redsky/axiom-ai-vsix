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
 * 인식 패턴(입력한 이름을 그대로 존중 — Page 접미사 강제 안 함):
 * - "AccountListPage 페이지를 만들어줘" → pageName: "AccountListPage"
 * - "AccountList 페이지 만들어줘"       → pageName: "AccountList" (입력 그대로)
 * - "AccountListPage 화면을 만들어줘"   → pageName: "AccountListPage" (화면 키워드 인식)
 * - "account-list 페이지 생성해줘"      → pageName: "AccountList" (kebab-case → PascalCase)
 * - "계좌 목록 페이지 만들어줘"          → isPageCreation: true, pageName: null (되묻기/위임)
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

    // 명시적으로 입력한 이름은 그대로 존중한다(Page 접미사 강제 안 함).
    const rawName = this._extractRawName(userInput);
    const pageName = rawName ? this._toPascalCase(rawName) : null;

    return { isPageCreation: true, pageName, rawName };
  }

  /**
   * 사용자가 이름 되묻기 단계에서 직접 입력한 문자열을 컴포넌트명으로 정규화한다.
   * 명시적으로 입력한 이름은 그대로 존중한다: 확장자(.tsx 등)만 제거하고 Page 접미사를
   * 강제하지 않는다. kebab/snake-case만 PascalCase로 변환한다.
   * 영문 식별자(PascalCase/kebab/snake)를 찾지 못하면 null(재입력 요청용).
   *
   * - "EmployeeList2.tsx" → "EmployeeList2"  (확장자 제거, Page 미강제)
   * - "EmployeeList2Page" → "EmployeeList2Page"
   * - "account-list"      → "AccountList"
   */
  normalizeName(input: string): string | null {
    const withoutExt = input.replace(/\.(tsx?|jsx?)\b/gi, ' ');
    const raw = this._extractRawName(withoutExt);
    return raw ? this._toPascalCase(raw) : null;
  }

  /**
   * "페이지 만드는 **방법/가이드**" 같은 **정보성(how-to) 질문**인지 판단한다.
   *
   * CREATION_KEYWORDS는 `'페이지 생성'`·`'화면 생성'`처럼 동사 없는 명사구 조각을 포함하므로,
   * "페이지 생성 방법 알려줘"·"화면 생성 방법"이 실제 생성 요청으로 오인되어 영문명 되묻기
   * 루프에 갇힌다. 핵심 구분은 **주 서술어**다 — 생성 명령은 `만들어줘/생성해`로 끝나고, how-to
   * 질문은 "(…하는) **방법/가이드**"를 묻거나 `보여줘/알려줘`로 끝난다.
   *
   * 판정 순서:
   *  1. `어떻게 … 만들/생성` 또는 영어 `how to` — 의문사형 how-to(생성 동사 유무 무관).
   *  2. how-to 명사(방법·가이드·절차·순서·사용법·만드는 법…)가 있으면:
   *     - 설명 동사(보여/알려/설명…)가 함께 → 확정적 how-to.
   *     - 설명 동사가 없어도 **명시적 생성 명령(만들어줘·생성해…)이 없으면** how-to로 본다.
   *       ("화면 생성 방법"·"페이지 만드는 방법"처럼 '방법'이 생성 동작을 수식하는 짧은 입력).
   *     - 단, 명령형 생성이 함께면 '방법'은 페이지 주제이므로 생성 유지
   *       (예: "회원가입 방법 페이지 만들어줘").
   */
  static isHowToQuery(input: string): boolean {
    const lower = input.toLowerCase();

    // 1) 의문사형 how-to — 생성 동사를 수식해도 "하는 법"을 묻는 질문이다.
    if (/how\s*to/i.test(lower)) return true;
    if (/어떻게/.test(lower) && /만들|생성|추가|짜/.test(lower)) return true;

    // 2) how-to 명사가 있어야 정보성 후보. (없으면 일반 생성 명령으로 본다.)
    const hasHowToNoun = /가이드|방법|절차|순서|사용법|(만드|하|쓰|짜)는\s*법|guide/i.test(lower);
    if (!hasHowToNoun) return false;

    // 설명 동사가 함께면 확정적 정보 요청.
    if (/보여|알려|설명|가르쳐|궁금|뭐(야|에요|예요)|무엇/.test(lower)) return true;

    // 설명 동사가 없어도 명시적 생성 명령이 없으면 how-to로 본다.
    // ('만드는'·'생성'은 동작을 수식하는 형태라 명령형(만들어/생성해)과 구분된다.)
    const hasCreateImperative =
      /만들어|만드세요|만들세요|만들어라|생성해|생성하세요|추가해|추가하세요|짜줘|짜주세요/.test(lower);
    return !hasCreateImperative;
  }

  private _isPageCreationRequest(input: string): boolean {
    // 정보성 질문("페이지 생성 방법 알려줘")은 생성 명령이 아니라 가이드 요청 → Q&A로 흘려보낸다.
    if (PageCreationDetector.isHowToQuery(input)) return false;

    const lower = input.toLowerCase();
    if (PageCreationDetector.CREATION_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))) {
      return true;
    }
    // "LoginPage를 auth 도메인에 만들어줘" 처럼 Page 식별자와 생성 동사가 분리된 경우
    const hasPageIdentifier = /\b[A-Z][a-zA-Z0-9]*Page\b/.test(input);
    const hasCreationVerb = /만들어|생성해|추가해|create|make|add/.test(lower);
    return hasPageIdentifier && hasCreationVerb;
  }

  /**
   * 사용자 입력에서 페이지명 후보를 추출한다.
   * PascalCase 식별자 또는 kebab-case/snake_case 단어를 인식한다.
   * 순수 한국어 이름은 null 반환 (LLM에 네이밍 위임).
   */
  private _extractRawName(input: string): string | null {
    // "내용은 EmployeeListPage.tsx 파일 내용으로 채워줘"처럼 채울 내용의 출처로 지정한
    // 기존 파일 참조는 만들 페이지명이 아니므로 후보에서 제거한다(안 그러면 출처 파일명을
    // 만들 이름으로 오인해 기존 파일을 덮어쓴다).
    const scope = this._stripContentSourceRefs(input);

    // PascalCase 식별자 (예: AccountListPage, AccountList)
    const pascalMatch = scope.match(/\b([A-Z][a-zA-Z0-9]+(?:[A-Z][a-zA-Z0-9]*)*)\b/);
    if (pascalMatch?.[1]) {
      // 단독 대문자 약어 제외 (예: "UI", "API")
      if (pascalMatch[1].length > 2) return pascalMatch[1];
    }

    // kebab-case 또는 snake_case (예: account-list, account_list)
    const kebabMatch = scope.match(/\b([a-z][a-z0-9]*(?:[-_][a-z0-9]+)+)\b/);
    if (kebabMatch?.[1]) return kebabMatch[1];

    return null;
  }

  /**
   * 채울 내용의 출처로 지정한 기존 파일 참조를 페이지명 후보에서 제거한다.
   * 이 토큰들은 "만들 페이지명"이 아니라 "내용 출처"이므로, 남겨두면 만들 이름으로
   * 오인되어 기존 파일을 덮어쓴다.
   *
   * - "내용은 EmployeeListPage.tsx 파일 내용으로 채워줘" → 출처 파일 제거
   * - "EmployeeListPage 파일 내용으로 채워줘"            → "… 파일" 앞 식별자 제거
   * - "EmployeeList2.tsx 페이지 만들어줘"                → 보존(파일명이 곧 만들 이름)
   */
  private _stripContentSourceRefs(input: string): string {
    // 1) 확장자를 가진 파일 참조 (예: EmployeeListPage.tsx)
    //    단, 바로 뒤에 생성 키워드(페이지/화면/page)가 오면 만들 이름이므로 보존한다.
    let scope = input.replace(/\b[A-Za-z][\w-]*\.(?:tsx?|jsx?)\b/g, (match, offset: number) => {
      const after = input.slice(offset + match.length);
      return /^\s*(?:페이지|화면|page)/i.test(after) ? match : ' ';
    });

    // 2) "… 파일" 바로 앞의 식별자 (예: "EmployeeListPage 파일 내용으로")
    //    (한글은 JS 정규식에서 단어문자가 아니므로 파일 뒤에 \b를 쓰지 않는다)
    scope = scope.replace(/\b[A-Za-z][\w-]*(?=\s*파일(?![가-힣]))/g, ' ');

    return scope;
  }

  /**
   * 추출한 이름 후보를 PascalCase로 변환한다. 입력 이름을 그대로 존중하므로
   * Page 접미사는 강제하지 않는다(이미 PascalCase면 그대로 반환).
   *
   * - "AccountList"      → "AccountList"
   * - "AccountListPage"  → "AccountListPage"
   * - "account-list"     → "AccountList"
   * - "account_list"     → "AccountList"
   */
  private _toPascalCase(raw: string): string {
    if (/^[A-Z]/.test(raw)) return raw; // 이미 PascalCase → 입력 그대로

    return raw
      .split(/[-_]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join('');
  }
}
