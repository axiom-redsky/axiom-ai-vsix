/**
 * MiniYaml — 행동 카드 frontmatter(§4)를 위한 YAML **부분집합** 파서 (의존성 0).
 *
 * 전체 YAML이 아니다. 카드 스키마가 쓰는 문법만 지원한다:
 *  - 스칼라:        `key: value` (문자열·정수·소수·true/false, 따옴표 선택)
 *  - 인라인 배열:   `key: [a, b, "c, d"]` (따옴표 안 콤마 존중)
 *  - 중첩 객체:     `key:` + 들여쓰기 블록
 *  - 객체 리스트:   `- key: value` + 더 깊은 들여쓰기의 연속 키들
 *  - 스칼라 리스트: `- value`
 *  - 주석:          `#` (행 첫머리 또는 공백 뒤, 따옴표 밖)
 *
 * 폐쇄망·의존성 최소화 원칙으로 js-yaml을 넣지 않는다. 카드 어휘가 좁아(§4 규칙 2)
 * 부분집합으로 충분하고, 지원 밖 문법은 조용히 삼키지 않고 errors로 보고한다
 * (fail-open: 카드 로더가 그 카드만 비활성 처리).
 */

export type TYamlScalar = string | number | boolean;
export type TYamlValue = TYamlScalar | TYamlValue[] | IYamlMap;
export interface IYamlMap {
  [key: string]: TYamlValue;
}

export interface IYamlParseResult {
  value: IYamlMap;
  /** "L<줄번호>: 설명" 형식. 하나라도 있으면 파싱을 신뢰하지 말 것. */
  errors: string[];
}

interface ILine {
  indent: number;
  text: string;
  n: number;
}

/** 따옴표 밖에서 ` #`(또는 행 첫머리 `#`)부터를 주석으로 잘라낸다. */
function stripComment(raw: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === '#' && !inSingle && !inDouble && (i === 0 || raw[i - 1] === ' ' || raw[i - 1] === '\t')) {
      return raw.slice(0, i);
    }
  }
  return raw;
}

/** 주석·빈 줄을 제거하고 (들여쓰기, 내용, 줄번호)로 정규화한다. 탭 들여쓰기는 공백 2칸 취급. */
function toLines(src: string): ILine[] {
  const out: ILine[] = [];
  src.split(/\r?\n/).forEach((raw, idx) => {
    const cut = stripComment(raw.replace(/\t/g, '  '));
    const text = cut.trim();
    if (!text) return;
    const indent = (cut.match(/^ */) as RegExpMatchArray)[0].length;
    out.push({ indent, text, n: idx + 1 });
  });
  return out;
}

/** 스칼라 토큰 해석 — 따옴표 벗기기, 정수/소수/불리언 승격. */
function parseScalar(tok: string): TYamlScalar {
  const t = tok.trim();
  const q = t.match(/^"(.*)"$/) ?? t.match(/^'(.*)'$/);
  if (q) return q[1];
  if (/^-?\d+$/.test(t)) return parseInt(t, 10);
  if (/^-?\d+\.\d+$/.test(t)) return parseFloat(t);
  if (t === 'true') return true;
  if (t === 'false') return false;
  return t;
}

/** 인라인 배열 본문(`[` `]` 제외)을 따옴표 존중하며 콤마로 나눈다. */
function splitInline(body: string): string[] {
  const items: string[] = [];
  let cur = '';
  let inSingle = false;
  let inDouble = false;
  for (const c of body) {
    if (c === "'" && !inDouble) { inSingle = !inSingle; cur += c; }
    else if (c === '"' && !inSingle) { inDouble = !inDouble; cur += c; }
    else if (c === ',' && !inSingle && !inDouble) { items.push(cur); cur = ''; }
    else cur += c;
  }
  if (cur.trim()) items.push(cur);
  return items.map((s) => s.trim()).filter((s) => s.length > 0);
}

/** `key:` 뒤의 값 토큰 하나를 해석한다 (인라인 배열 또는 스칼라). */
function parseValueToken(tok: string, line: ILine, errors: string[]): TYamlValue {
  if (tok.startsWith('[')) {
    if (!tok.endsWith(']')) {
      errors.push(`L${line.n}: 인라인 배열이 닫히지 않음 — "${tok}"`);
      return [];
    }
    return splitInline(tok.slice(1, -1)).map(parseScalar);
  }
  return parseScalar(tok);
}

/** `indent` 깊이의 맵(객체) 블록을 파싱한다. 반환: [맵, 다음 처리할 줄 인덱스]. */
function parseMap(lines: ILine[], start: number, indent: number, errors: string[]): [IYamlMap, number] {
  const map: IYamlMap = {};
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < indent) break;
    if (line.text.startsWith('- ') || line.text === '-') break; // 리스트 항목은 상위 소관
    if (line.indent > indent) {
      errors.push(`L${line.n}: 예상치 못한 들여쓰기 — "${line.text}"`);
      i++;
      continue;
    }
    const m = line.text.match(/^([^:]+):(.*)$/);
    if (!m) {
      errors.push(`L${line.n}: "key: value" 형식이 아님 — "${line.text}"`);
      i++;
      continue;
    }
    const key = m[1].trim();
    const rest = m[2].trim();
    if (key in map) errors.push(`L${line.n}: 중복 키 "${key}"`);
    if (rest) {
      map[key] = parseValueToken(rest, line, errors);
      i++;
      continue;
    }
    // 블록 값 — 다음 줄의 들여쓰기·형태로 리스트/객체를 판별한다.
    const next = lines[i + 1];
    if (next && next.indent > indent) {
      if (next.text.startsWith('- ') || next.text === '-') {
        const [arr, ni] = parseList(lines, i + 1, next.indent, errors);
        map[key] = arr;
        i = ni;
      } else {
        const [obj, ni] = parseMap(lines, i + 1, next.indent, errors);
        map[key] = obj;
        i = ni;
      }
    } else {
      map[key] = '';
      i++;
    }
  }
  return [map, i];
}

/** `indent` 깊이의 `- ` 리스트 블록을 파싱한다. 항목 = 스칼라 또는 평면 객체(연속 키 포함). */
function parseList(lines: ILine[], start: number, indent: number, errors: string[]): [TYamlValue[], number] {
  const arr: TYamlValue[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent !== indent || !(line.text.startsWith('- ') || line.text === '-')) break;
    const rest = line.text === '-' ? '' : line.text.slice(2).trim();
    const kv = rest.match(/^([A-Za-z_][\w-]*):(.*)$/);
    if (kv) {
      // 객체 항목: `- key: value` 가 첫 키, 더 깊은 들여쓰기의 줄들이 나머지 키.
      const item: IYamlMap = {};
      const firstVal = kv[2].trim();
      item[kv[1].trim()] = firstVal ? parseValueToken(firstVal, line, errors) : '';
      const next = lines[i + 1];
      if (next && next.indent > indent && !(next.text.startsWith('- ') || next.text === '-')) {
        const [obj, ni] = parseMap(lines, i + 1, next.indent, errors);
        for (const [k, v] of Object.entries(obj)) {
          if (k in item) errors.push(`L${next.n}: 리스트 항목의 중복 키 "${k}"`);
          else item[k] = v;
        }
        i = ni;
      } else {
        i++;
      }
      arr.push(item);
    } else if (rest) {
      arr.push(parseValueToken(rest, line, errors));
      i++;
    } else {
      errors.push(`L${line.n}: 빈 리스트 항목`);
      i++;
    }
  }
  return [arr, i];
}

/** 최상위 진입점 — frontmatter 본문(--- 제외)을 맵으로 파싱한다. */
export function parseMiniYaml(src: string): IYamlParseResult {
  const lines = toLines(src);
  const errors: string[] = [];
  if (lines.length === 0) return { value: {}, errors };
  const [value] = parseMap(lines, 0, lines[0].indent, errors);
  return { value, errors };
}
