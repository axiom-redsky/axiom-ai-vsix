import * as fs from 'fs';
import * as path from 'path';

interface ExtractedStructure {
  fileType: 'html' | 'tsx' | 'unknown';
  classNames: string[];
  hasForm: boolean;
  hasTable: boolean;
  formFields: string[];
  buttonLabels: string[];
  headings: string[];
  apiPatterns: string[];
  rawPreview: string;
}

/**
 * 퍼블리셔 HTML 또는 TSX 파일에서 구조적 시그널을 추출한다.
 * 역방향 스펙 생성(파일 → spec.md)의 컨텍스트 수집 담당.
 */
export class PublishExtractor {
  /**
   * 파일을 분석하고 LLM 프롬프트용 구조 설명 문자열을 반환한다.
   * 파일이 없거나 읽기 실패 시 빈 문자열 반환.
   */
  extractFromFile(filePath: string): string {
    if (!fs.existsSync(filePath)) return '';
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      return '';
    }

    const ext = path.extname(filePath).toLowerCase();
    const fileType: ExtractedStructure['fileType'] =
      ext === '.html' || ext === '.htm' ? 'html' :
      ext === '.tsx' ? 'tsx' : 'unknown';

    const structure = this._extract(content, fileType);
    return this._format(filePath, structure);
  }

  private _extract(content: string, fileType: ExtractedStructure['fileType']): ExtractedStructure {
    return {
      fileType,
      classNames: this._extractClassNames(content),
      hasForm: /(<form\b|<Form\b|useForm\s*\()/.test(content),
      hasTable: /(<table\b|<Table\b|DataTable\b|<tbody\b)/.test(content),
      formFields: this._extractFormFields(content),
      buttonLabels: this._extractButtonLabels(content),
      headings: this._extractHeadings(content),
      apiPatterns: fileType === 'tsx' ? this._extractApiPatterns(content) : [],
      rawPreview: content.slice(0, 2000),
    };
  }

  private _extractClassNames(content: string): string[] {
    const seen = new Set<string>();
    for (const m of content.matchAll(/class(?:Name)?=["']([^"']+)["']/g)) {
      for (const cls of m[1].split(/\s+/)) {
        const c = cls.trim();
        if (c && !c.startsWith('{')) seen.add(c);
      }
    }
    return [...seen].slice(0, 30);
  }

  private _extractHeadings(content: string): string[] {
    const results: string[] = [];
    for (const m of content.matchAll(/<h[1-3][^>]*>([^<]{1,80})<\/h[1-3]>/gi)) {
      const text = m[1].trim();
      if (text) results.push(text);
    }
    for (const m of content.matchAll(/title[=:][\s]*["']([^"']{1,80})["']/gi)) {
      results.push(m[1].trim());
    }
    return [...new Set(results)].slice(0, 5);
  }

  private _extractButtonLabels(content: string): string[] {
    const results: string[] = [];
    for (const m of content.matchAll(/<button[^>]*>([^<{]{1,50})<\/button>/gi)) {
      const label = m[1].trim();
      if (label) results.push(label);
    }
    for (const m of content.matchAll(/<Button[^>]*>([^<{]{1,50})<\/Button>/g)) {
      const label = m[1].trim();
      if (label) results.push(label);
    }
    return [...new Set(results)].slice(0, 10);
  }

  private _extractFormFields(content: string): string[] {
    const results: string[] = [];
    for (const m of content.matchAll(/(?:name|placeholder)=["']([^"']{1,60})["']/gi)) {
      results.push(m[1].trim());
    }
    for (const m of content.matchAll(/label=["']([^"']{1,60})["']/gi)) {
      results.push(m[1].trim());
    }
    return [...new Set(results)].slice(0, 15);
  }

  private _extractApiPatterns(content: string): string[] {
    const results: string[] = [];
    for (const m of content.matchAll(/useApi\(\s*['"]([A-Z]+)['"]\s*,\s*['"]([^'"]+)['"]/g)) {
      results.push(`${m[1]} ${m[2]}`);
    }
    return results.slice(0, 10);
  }

  private _format(filePath: string, s: ExtractedStructure): string {
    const sections: string[] = [
      `## 파일 구조 분석: ${path.basename(filePath)} (${s.fileType})`,
    ];

    if (s.headings.length > 0) {
      sections.push(`### 제목/헤딩\n${s.headings.map((h) => `- ${h}`).join('\n')}`);
    }

    if (s.classNames.length > 0) {
      sections.push(`### CSS 클래스명\n${s.classNames.map((c) => `- .${c}`).join('\n')}`);
    }

    const features: string[] = [];
    if (s.hasForm) features.push('폼(Form) 포함');
    if (s.hasTable) features.push('테이블(Table) 포함');
    if (features.length > 0) {
      sections.push(`### UI 구성\n${features.map((f) => `- ${f}`).join('\n')}`);
    }

    if (s.formFields.length > 0) {
      sections.push(`### 폼 필드/레이블\n${s.formFields.map((f) => `- ${f}`).join('\n')}`);
    }

    if (s.buttonLabels.length > 0) {
      sections.push(`### 버튼 레이블\n${s.buttonLabels.map((b) => `- ${b}`).join('\n')}`);
    }

    if (s.apiPatterns.length > 0) {
      sections.push(`### API 패턴 (TSX)\n${s.apiPatterns.map((a) => `- ${a}`).join('\n')}`);
    }

    sections.push(
      `### 소스 미리보기 (첫 2000자)\n\`\`\`${s.fileType}\n${s.rawPreview}\n\`\`\``,
    );

    return sections.join('\n\n');
  }
}
