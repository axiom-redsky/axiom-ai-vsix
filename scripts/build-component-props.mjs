// @ts-check
/**
 * build-component-props.mjs — 실 react-app-scaffold 소스에서 UI 컴포넌트의 "고유 prop"을
 * TS Compiler API로 추출해 커밋 가능한 인덱스(JSON)로 굽는다.
 *
 * 왜: region(하이브리드) 편집 경로는 토큰 절약차 컴포넌트 지식 문서를 주입하지 않는다.
 * 그래서 "기존 SmartTable에 excel 내보내기(exportable) 추가" 같은 옵션-추가 요청이 모델에게
 * prop의 존재조차 안 보여 "변경 없음"으로 끝난다. 이 인덱스를 region 프롬프트에 "존재 기반"으로
 * 주입해(<SmartTable/>이 영역에 있으면 SmartTable prop 표만) 그 공백을 메운다.
 *
 * 전략(단일 경로): export된 PascalCase 컴포넌트 함수의 첫 파라미터 타입을 체커로 해소해
 * getProperties()로 열거. 체커가 `&` 교집합·VariantProps·React.ComponentProps를 전부 평탄화한다.
 * 노이즈(DOM attr 250개)는 "출처(provenance)" 우선으로 필터: 선언이 scaffold 소스면 고유 prop,
 * node_modules면 표준 attr로 접는다. cva에서 온 variant/size 등 리터럴 유니언은 구제해 채택한다.
 *
 * 소스 부재 시(예: CI) graceful skip — 마지막 커밋된 JSON을 그대로 두고 경고만.
 *
 * 사용: node scripts/build-component-props.mjs [--debug]
 *   환경변수 AXIOM_SCAFFOLD_SRC 로 scaffold 루트 경로 오버라이드.
 */
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DEBUG = process.argv.includes('--debug');

const SCAFFOLD =
  process.env.AXIOM_SCAFFOLD_SRC ||
  'C:/redsky/work/react/single_react_new_nicfirst/react-app-scaffold';

const OUT_PATH = path.resolve(REPO_ROOT, 'src/ai/generated/componentPropsIndex.ts');

/** scaffold 상대 대상 파일. 파일당 여러 컴포넌트를 export할 수 있다(Select/Card/…). */
const TARGET_FILES = [
  'src/shared/ui/smart-table/SmartTable.tsx',
  'src/shared/lib/shadcn/ui/button.tsx',
  'src/shared/lib/shadcn/ui/select.tsx',
  'src/shared/lib/shadcn/ui/input.tsx',
  'src/shared/lib/shadcn/ui/calendar.tsx',
  'src/shared/lib/shadcn/ui/checkbox.tsx',
  'src/shared/lib/shadcn/ui/badge.tsx',
  'src/shared/lib/shadcn/ui/textarea.tsx',
  'src/shared/lib/shadcn/ui/card.tsx',
  'src/shared/lib/shadcn/ui/combobox.tsx',
  'src/shared/lib/shadcn/ui/dropdown-menu.tsx',
  'src/shared/lib/shadcn/ui/accordion.tsx',
];

/** 이 scaffold에서 위 컴포넌트들은 전부 배럴로 재export된다. */
const DEFAULT_IMPORT = '@axiom/components/ui';

const MAX_TYPE_LEN = 160;
// per-component 상한을 넉넉히: region 주입은 보통 1~2개 컴포넌트만 뽑으므로 토큰 부담이 작다.
// 잘라내면 SmartTable(37개)의 selectable/summary/sortMode 같은 핵심 prop이 알파벳 컷에 사라진다.
const MAX_UNIQUE_PROPS = 40;

// ── 표준 DOM/React attr 패턴 (출처가 흐릿할 때의 2차 필터) ──────────────
const DOM_NAME_PATTERNS = [/^on[A-Z]/, /^aria-/, /^data-/];
const DOM_COMMON = new Set([
  'className', 'style', 'id', 'key', 'ref', 'children', 'dir', 'lang', 'title', 'role',
  'tabIndex', 'hidden', 'slot', 'translate', 'spellCheck', 'contentEditable', 'draggable',
  'autoFocus', 'autoCapitalize', 'accessKey', 'inputMode', 'enterKeyHint', 'nonce', 'is',
  'suppressContentEditableWarning', 'suppressHydrationWarning', 'itemProp', 'itemScope',
  'itemType', 'itemID', 'itemRef', 'color', 'security', 'unselectable', 'radioGroup',
  'about', 'content', 'datatype', 'inlist', 'prefix', 'property', 'rel', 'resource', 'rev',
  'typeof', 'vocab', 'defaultChecked', 'defaultValue', 'dangerouslySetInnerHTML',
]);

function isPascal(name) {
  return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

function isStandardDomName(name) {
  if (DOM_COMMON.has(name)) return true;
  return DOM_NAME_PATTERNS.some((re) => re.test(name));
}

/** 선언이 scaffold 소스 트리(≠ node_modules) 안에서 왔나. */
function isScaffoldDecl(sym) {
  const decls = sym.getDeclarations() || [];
  for (const d of decls) {
    const f = d.getSourceFile().fileName.replace(/\\/g, '/');
    if (f.includes('/node_modules/')) continue;
    if (f.includes('/react-app-scaffold/') || f.startsWith(SCAFFOLD.replace(/\\/g, '/'))) return true;
  }
  return false;
}

/** 헤드리스 UI 라이브러리 출처 패턴 — 여기서 온 non-DOM prop(onValueChange·open 등)은 컴포넌트 고유 API다. */
const COMPONENT_LIB_PATTERNS = [
  /\/node_modules\/@radix-ui\//, /\/node_modules\/react-day-picker\//, /\/node_modules\/@base-ui/,
  /\/node_modules\/cmdk\//, /\/node_modules\/vaul\//, /\/node_modules\/embla-carousel/,
];
function isComponentLibDecl(sym) {
  const decls = sym.getDeclarations() || [];
  return decls.some((d) => {
    const f = d.getSourceFile().fileName.replace(/\\/g, '/');
    return COMPONENT_LIB_PATTERNS.some((re) => re.test(f));
  });
}

/** 리터럴 유니언(cva variant 등) — 표준 attr는 아니지만 값 집합이 명시된 컴포넌트 고유 옵션. */
function looksLikeVariantUnion(typeStr) {
  // "'a' | 'b' | 'c'" 형태(따옴표 리터럴 2개 이상)
  const quoted = typeStr.match(/'[^']*'/g);
  return !!quoted && quoted.length >= 2;
}

function truncateType(s) {
  // `import("C:/…/index").SmartColumns<TRow>` → `SmartColumns<TRow>`. 절대경로가 커밋 JSON·프롬프트에
  // 새는 것을 막고(머신별 diff 노이즈 제거), 타입을 사람이 읽을 수 있는 이름만 남긴다.
  const one = s.replace(/import\("[^"]*"\)\./g, '').replace(/\s+/g, ' ').trim();
  return one.length > MAX_TYPE_LEN ? one.slice(0, MAX_TYPE_LEN - 1) + '…' : one;
}

function main() {
  const scaffoldNorm = SCAFFOLD.replace(/\\/g, '/');
  if (!fs.existsSync(SCAFFOLD)) {
    console.warn(
      `[build-component-props] scaffold 소스 없음: ${SCAFFOLD}\n` +
      `  → 인덱스 재생성 건너뜀(마지막 커밋 JSON 유지). AXIOM_SCAFFOLD_SRC로 경로 지정 가능.`,
    );
    process.exit(0);
  }

  const absTargets = TARGET_FILES.map((f) => path.join(SCAFFOLD, f)).filter((f) => fs.existsSync(f));
  if (absTargets.length === 0) {
    console.warn('[build-component-props] 대상 파일을 찾지 못함 → 건너뜀');
    process.exit(0);
  }

  // scaffold tsconfig로 컴파일러 옵션(경로 별칭·lib·@types 해소)을 가져온다.
  const configPath =
    ts.findConfigFile(SCAFFOLD, ts.sys.fileExists, 'tsconfig.app.json') ||
    ts.findConfigFile(SCAFFOLD, ts.sys.fileExists, 'tsconfig.json');
  let options = { jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, skipLibCheck: true };
  if (configPath) {
    const read = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(read.config || {}, ts.sys, path.dirname(configPath));
    options = { ...parsed.options, noEmit: true, skipLibCheck: true };
  }

  const program = ts.createProgram(absTargets, options);
  const checker = program.getTypeChecker();

  /** @type {Record<string, { import: string, source: string, props: any[], domNote: boolean }>} */
  const index = {};

  for (const abs of absTargets) {
    const sf = program.getSourceFile(abs);
    if (!sf) continue;
    const relSource = path.relative(SCAFFOLD, abs).replace(/\\/g, '/');

    /** 컴포넌트 함수 후보 수집: `function Foo(...)` + `export const Foo = (...) =>` + `export default function Foo`. */
    const components = [];
    ts.forEachChild(sf, (node) => {
      if (ts.isFunctionDeclaration(node) && node.name && isPascal(node.name.text) && node.parameters.length > 0) {
        components.push({ name: node.name.text, param: node.parameters[0] });
      } else if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (
            ts.isIdentifier(decl.name) && isPascal(decl.name.text) && decl.initializer &&
            (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) &&
            decl.initializer.parameters.length > 0
          ) {
            components.push({ name: decl.name.text, param: decl.initializer.parameters[0] });
          }
        }
      }
    });

    for (const comp of components) {
      const paramType = checker.getTypeAtLocation(comp.param);
      const props = checker.getPropertiesOfType(paramType);
      const unique = [];
      let domFolded = 0;

      for (const sym of props) {
        const name = sym.getName();
        if (name.startsWith('__')) continue;
        const fromScaffold = isScaffoldDecl(sym);
        const t = checker.getTypeOfSymbolAtLocation(sym, comp.param);
        const typeStr = checker.typeToString(sym.valueDeclaration ? t : t, comp.param, ts.TypeFormatFlags.NoTruncation);
        const optional = (sym.getFlags() & ts.SymbolFlags.Optional) !== 0;

        // 순서 주의: 라이브러리 출처 검사를 DOM 이름 검사보다 앞에 둔다. onValueChange·onOpenChange 등
        // Radix 고유 콜백은 /^on[A-Z]/ DOM 패턴에 걸리지만 컴포넌트 API이므로 이름과 무관하게 살려야 한다.
        // DOM attr(onClick·className 등)은 @types/react 출처라 isComponentLibDecl=false → 다음 단계에서 접힘.
        let keep;
        if (fromScaffold) keep = true;                    // scaffold 소스 = 항상 고유
        else if (isComponentLibDecl(sym)) keep = true;    // Radix/day-picker 고유 prop(onValueChange·open) = 구제
        else if (isStandardDomName(name)) keep = false;   // className·onClick·aria-* 등 표준 attr = 접기
        else keep = looksLikeVariantUnion(typeStr);        // 그 외 리터럴 유니언(variant 등)만 구제

        if (DEBUG) {
          const src = (sym.getDeclarations()?.[0]?.getSourceFile().fileName || '').replace(/\\/g, '/');
          const tag = src.includes('/node_modules/') ? 'NM' : 'SC';
          console.log(`   [${comp.name}] ${keep ? 'KEEP' : 'fold'} ${tag} ${name}: ${truncateType(typeStr)}`);
        }

        if (!keep) { domFolded++; continue; }

        const docParts = sym.getDocumentationComment(checker);
        const doc = ts.displayPartsToString(docParts).split('\n')[0].trim();
        unique.push({ name, type: truncateType(typeStr), required: !optional, doc: doc || undefined });
      }

      if (unique.length === 0 && !DEBUG) {
        // 고유 prop이 없는 순수 HTML 래퍼(Input 등)도 "표준 attr만 받음"을 알리기 위해 등록.
      }

      // 정렬: required 먼저, 그다음 이름.
      unique.sort((a, b) => (a.required === b.required ? a.name.localeCompare(b.name) : a.required ? -1 : 1));
      const capped = unique.slice(0, MAX_UNIQUE_PROPS);

      // 같은 이름 컴포넌트가 여러 파일에 있을 일은 없지만, 더 많은 고유 prop을 가진 쪽을 우선.
      const prev = index[comp.name];
      if (!prev || prev.props.length < capped.length) {
        index[comp.name] = {
          import: DEFAULT_IMPORT,
          source: relSource,
          props: capped,
          domNote: domFolded > 0,
          truncated: unique.length > capped.length || undefined,
        };
      }
    }
  }

  if (DEBUG) {
    console.log('\n[debug] 인덱싱된 컴포넌트:', Object.keys(index).join(', '));
    return;
  }

  void scaffoldNorm;
  const banner =
    `/**\n` +
    ` * AUTO-GENERATED — 편집 금지. scripts/build-component-props.mjs 가 실 react-app-scaffold 소스에서 생성.\n` +
    ` * react-app-scaffold UI 컴포넌트의 "고유 prop"(표준 DOM attr 제외). region 편집 경로에 존재 기반 주입한다.\n` +
    ` * 갱신: npm run build:component-props (scaffold 소스 필요; 없으면 이 파일 유지).\n` +
    ` */\n`;
  const types =
    `export interface IComponentPropDoc {\n` +
    `  name: string;\n  type: string;\n  required: boolean;\n  doc?: string;\n}\n` +
    `export interface IComponentEntry {\n` +
    `  /** 이 컴포넌트의 배럴 import 경로(예: '@axiom/components/ui'). */\n  import: string;\n` +
    `  /** scaffold 소스 상대 경로(추적용). */\n  source: string;\n` +
    `  /** 컴포넌트 고유 prop 목록(표준 DOM attr 제외). */\n  props: IComponentPropDoc[];\n` +
    `  /** 표준 DOM 속성도 함께 받는가(접힌 attr이 있었나). */\n  domNote: boolean;\n` +
    `  /** per-component 상한으로 잘렸는가. */\n  truncated?: boolean;\n}\n`;
  const body =
    `export const COMPONENT_PROPS_INDEX: Record<string, IComponentEntry> = ${JSON.stringify(index, null, 2)};\n`;
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, banner + '\n' + types + '\n' + body, 'utf8');
  const total = Object.values(index).reduce((n, c) => n + c.props.length, 0);
  console.log(
    `[build-component-props] ${Object.keys(index).length}개 컴포넌트 · 고유 prop ${total}개 → ` +
    `${path.relative(REPO_ROOT, OUT_PATH).replace(/\\/g, '/')}`,
  );
}

main();
