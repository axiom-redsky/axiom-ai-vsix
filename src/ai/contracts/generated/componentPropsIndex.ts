/**
 * AUTO-GENERATED — 편집 금지. scripts/build-component-props.mjs 가 실 react-app-scaffold 소스에서 생성.
 * react-app-scaffold UI 컴포넌트의 "고유 prop"(표준 DOM attr 제외). region 편집 경로에 존재 기반 주입한다.
 * 갱신: npm run build:component-props (scaffold 소스 필요; 없으면 이 파일 유지).
 */

export interface IComponentPropDoc {
  name: string;
  type: string;
  required: boolean;
  doc?: string;
}
export interface IComponentEntry {
  /** 이 컴포넌트의 배럴 import 경로(예: '@axiom/components/ui'). */
  import: string;
  /** scaffold 소스 상대 경로(추적용). */
  source: string;
  /** 컴포넌트 고유 prop 목록(표준 DOM attr 제외). */
  props: IComponentPropDoc[];
  /** 표준 DOM 속성도 함께 받는가(접힌 attr이 있었나). */
  domNote: boolean;
  /** per-component 상한으로 잘렸는가. */
  truncated?: boolean;
}

export const COMPONENT_PROPS_INDEX: Record<string, IComponentEntry> = {
  "SmartTable": {
    "import": "@axiom/components/ui",
    "source": "src/shared/ui/smart-table/SmartTable.tsx",
    "props": [
      {
        "name": "columns",
        "type": "SmartColumns<TRow>",
        "required": true,
        "doc": "컬럼 DSL (필수)"
      },
      {
        "name": "bulkActions",
        "type": "ISmartBulkAction<TRow>[]",
        "required": false,
        "doc": "선택 행 일괄 액션"
      },
      {
        "name": "className",
        "type": "string",
        "required": false,
        "doc": "루트 className"
      },
      {
        "name": "classNames",
        "type": "ISmartTableSlotClassNames",
        "required": false,
        "doc": "슬롯별 className 오버라이드"
      },
      {
        "name": "data",
        "type": "TRow[]",
        "required": false,
        "doc": "클라이언트 모드: 배열 직접 전달"
      },
      {
        "name": "density",
        "type": "\"compact\" | \"normal\" | \"loose\"",
        "required": false,
        "doc": "행 높이 밀도 (기본 normal)"
      },
      {
        "name": "emptyText",
        "type": "ReactNode",
        "required": false,
        "doc": "빈 상태 텍스트"
      },
      {
        "name": "endpoint",
        "type": "string",
        "required": false,
        "doc": "서버 모드: endpoint 자동 배선 (useApi)"
      },
      {
        "name": "exportable",
        "type": "boolean | { filename?: string; format?: \"xlsx\" | \"csv\"; sheetName?: string; }",
        "required": false,
        "doc": "내보내기 활성화. `true`면 기본 `xlsx`(서식 있는 엑셀)."
      },
      {
        "name": "exporter",
        "type": "(rows: TRow[], columns: SmartColumns<TRow>) => void",
        "required": false,
        "doc": "완전 커스텀 exporter (지정 시 기본 export 대체) — 예: 다중 시트/로고/합계행"
      },
      {
        "name": "loading",
        "type": "boolean",
        "required": false,
        "doc": "외부 제어 로딩 (클라이언트 모드)"
      },
      {
        "name": "method",
        "type": "THttpMethod",
        "required": false,
        "doc": "서버 method (기본 GET)"
      },
      {
        "name": "onRowClick",
        "type": "(row: TRow, index: number) => void",
        "required": false,
        "doc": "행 클릭 콜백"
      },
      {
        "name": "onSelectionChange",
        "type": "(rows: TRow[]) => void",
        "required": false,
        "doc": "선택 변경 콜백"
      },
      {
        "name": "pageSize",
        "type": "number",
        "required": false,
        "doc": "초기 페이지 크기 (기본 10)"
      },
      {
        "name": "pageSizeOptions",
        "type": "number[]",
        "required": false,
        "doc": "페이지 크기 옵션 (기본 [10,20,30,50])"
      },
      {
        "name": "paginated",
        "type": "boolean",
        "required": false,
        "doc": "하단 페이징 UI 표시 여부 (기본 true)."
      },
      {
        "name": "paramMap",
        "type": "ISmartServerParamMap",
        "required": false,
        "doc": "서버 파라미터 네이밍"
      },
      {
        "name": "params",
        "type": "Record<string, string | number | boolean>",
        "required": false,
        "doc": "endpoint에 항상 붙는 고정 파라미터 (필터 등)"
      },
      {
        "name": "ref",
        "type": "Ref<ISmartTableHandle<TRow>>",
        "required": false,
        "doc": "명령형 핸들 (React 19 ref-as-prop)"
      },
      {
        "name": "renderEmpty",
        "type": "() => ReactNode",
        "required": false,
        "doc": "빈 상태 커스텀 렌더"
      },
      {
        "name": "renderRowActions",
        "type": "(row: TRow) => ReactNode",
        "required": false,
        "doc": "행 끝 액션 메뉴"
      },
      {
        "name": "rowKey",
        "type": "keyof TRow | ((row: TRow) => string)",
        "required": false,
        "doc": "행 고유키 (기본 'id')"
      },
      {
        "name": "searchable",
        "type": "boolean",
        "required": false,
        "doc": "툴바 검색창 표시"
      },
      {
        "name": "searchKeys",
        "type": "(keyof TRow)[]",
        "required": false,
        "doc": "클라이언트 검색 대상 컬럼 (미지정=전 컬럼)"
      },
      {
        "name": "searchPlaceholder",
        "type": "string",
        "required": false,
        "doc": "검색창 placeholder"
      },
      {
        "name": "select",
        "type": "SmartSelect<TRaw, TRow>",
        "required": false,
        "doc": "서버 응답 → { rows, total } 매핑. 미지정 시 기본 어댑터 추론"
      },
      {
        "name": "selectable",
        "type": "boolean | \"single\" | \"multiple\"",
        "required": false,
        "doc": "행 선택 활성화"
      },
      {
        "name": "sortDisplay",
        "type": "\"hover\" | \"always\" | \"none\" | \"off\"",
        "required": false,
        "doc": "정렬 표시/동작 방식 (기본 `'hover'`)."
      },
      {
        "name": "sortIcons",
        "type": "ISmartTableSortIcons",
        "required": false,
        "doc": "정렬 헤더 아이콘 교체 (오름/내림/미정렬). 미지정 시 lucide 기본 아이콘."
      },
      {
        "name": "sortMode",
        "type": "\"menu\" | \"toggle\"",
        "required": false,
        "doc": "정렬 헤더 동작 방식 (기본 `'toggle'`)."
      },
      {
        "name": "sortRemoval",
        "type": "boolean",
        "required": false,
        "doc": "정렬 해제 단계 허용 여부 (기본 `true`)."
      },
      {
        "name": "summary",
        "type": "boolean | { label?: string; }",
        "required": false,
        "doc": "하단 합계/소계 행. `true` 또는 `{ label }`."
      },
      {
        "name": "toolbar",
        "type": "boolean",
        "required": false,
        "doc": "상단 툴바(검색/컬럼토글/export/일괄액션/슬롯) 표시 여부 (기본 true)."
      },
      {
        "name": "toolbarEnd",
        "type": "ReactNode",
        "required": false,
        "doc": "컬럼토글 오른쪽 슬롯"
      },
      {
        "name": "toolbarStart",
        "type": "ReactNode",
        "required": false,
        "doc": "검색창 왼쪽 슬롯"
      },
      {
        "name": "variant",
        "type": "\"card\" | \"minimal\" | \"bordered\"",
        "required": false,
        "doc": "외형 (기본 card)"
      }
    ],
    "domNote": false
  },
  "Button": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/button.tsx",
    "props": [
      {
        "name": "asChild",
        "type": "boolean",
        "required": false
      },
      {
        "name": "size",
        "type": "\"default\" | \"xs\" | \"sm\" | \"lg\" | \"icon\" | \"icon-xs\" | \"icon-sm\" | \"icon-lg\"",
        "required": false
      },
      {
        "name": "variant",
        "type": "\"link\" | \"default\" | \"outline\" | \"secondary\" | \"ghost\" | \"destructive\"",
        "required": false
      }
    ],
    "domNote": true
  },
  "Select": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/select.tsx",
    "props": [
      {
        "name": "autoComplete",
        "type": "string",
        "required": false
      },
      {
        "name": "children",
        "type": "React.ReactNode",
        "required": false
      },
      {
        "name": "defaultOpen",
        "type": "boolean",
        "required": false
      },
      {
        "name": "defaultValue",
        "type": "string",
        "required": false
      },
      {
        "name": "dir",
        "type": "\"ltr\" | \"rtl\"",
        "required": false
      },
      {
        "name": "disabled",
        "type": "boolean",
        "required": false
      },
      {
        "name": "form",
        "type": "string",
        "required": false
      },
      {
        "name": "name",
        "type": "string",
        "required": false
      },
      {
        "name": "onOpenChange",
        "type": "(open: boolean) => void",
        "required": false
      },
      {
        "name": "onValueChange",
        "type": "(value: string) => void",
        "required": false
      },
      {
        "name": "open",
        "type": "boolean",
        "required": false
      },
      {
        "name": "required",
        "type": "boolean",
        "required": false
      },
      {
        "name": "value",
        "type": "string",
        "required": false
      }
    ],
    "domNote": false
  },
  "SelectGroup": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/select.tsx",
    "props": [
      {
        "name": "asChild",
        "type": "boolean",
        "required": false
      }
    ],
    "domNote": true
  },
  "SelectValue": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/select.tsx",
    "props": [
      {
        "name": "asChild",
        "type": "boolean",
        "required": false
      },
      {
        "name": "placeholder",
        "type": "React.ReactNode",
        "required": false
      }
    ],
    "domNote": true
  },
  "SelectTrigger": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/select.tsx",
    "props": [
      {
        "name": "asChild",
        "type": "boolean",
        "required": false
      },
      {
        "name": "size",
        "type": "\"default\" | \"sm\" | \"lg\"",
        "required": false
      }
    ],
    "domNote": true
  },
  "SelectContent": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/select.tsx",
    "props": [
      {
        "name": "align",
        "type": "\"center\" | \"start\" | \"end\"",
        "required": false
      },
      {
        "name": "alignOffset",
        "type": "number",
        "required": false
      },
      {
        "name": "arrowPadding",
        "type": "number",
        "required": false
      },
      {
        "name": "asChild",
        "type": "boolean",
        "required": false
      },
      {
        "name": "avoidCollisions",
        "type": "boolean",
        "required": false
      },
      {
        "name": "collisionBoundary",
        "type": "Element | Element[]",
        "required": false
      },
      {
        "name": "collisionPadding",
        "type": "number | Partial<Record<\"top\" | \"right\" | \"bottom\" | \"left\", number>>",
        "required": false
      },
      {
        "name": "hideWhenDetached",
        "type": "boolean",
        "required": false
      },
      {
        "name": "onCloseAutoFocus",
        "type": "(event: Event) => void",
        "required": false,
        "doc": "Event handler called when auto-focusing on close."
      },
      {
        "name": "onEscapeKeyDown",
        "type": "(event: KeyboardEvent) => void",
        "required": false,
        "doc": "Event handler called when the escape key is down."
      },
      {
        "name": "onPointerDownOutside",
        "type": "(event: CustomEvent<{ originalEvent: PointerEvent; }>) => void",
        "required": false,
        "doc": "Event handler called when the a `pointerdown` event happens outside of the `DismissableLayer`."
      },
      {
        "name": "position",
        "type": "\"item-aligned\" | \"popper\"",
        "required": false
      },
      {
        "name": "side",
        "type": "\"top\" | \"right\" | \"bottom\" | \"left\"",
        "required": false
      },
      {
        "name": "sideOffset",
        "type": "number",
        "required": false
      },
      {
        "name": "sticky",
        "type": "\"always\" | \"partial\"",
        "required": false
      },
      {
        "name": "updatePositionStrategy",
        "type": "\"always\" | \"optimized\"",
        "required": false
      }
    ],
    "domNote": true
  },
  "SelectLabel": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/select.tsx",
    "props": [
      {
        "name": "asChild",
        "type": "boolean",
        "required": false
      }
    ],
    "domNote": true
  },
  "SelectItem": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/select.tsx",
    "props": [
      {
        "name": "value",
        "type": "string",
        "required": true
      },
      {
        "name": "asChild",
        "type": "boolean",
        "required": false
      },
      {
        "name": "disabled",
        "type": "boolean",
        "required": false
      },
      {
        "name": "textValue",
        "type": "string",
        "required": false
      }
    ],
    "domNote": true
  },
  "SelectSeparator": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/select.tsx",
    "props": [
      {
        "name": "asChild",
        "type": "boolean",
        "required": false
      }
    ],
    "domNote": true
  },
  "SelectScrollUpButton": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/select.tsx",
    "props": [
      {
        "name": "asChild",
        "type": "boolean",
        "required": false
      }
    ],
    "domNote": true
  },
  "SelectScrollDownButton": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/select.tsx",
    "props": [
      {
        "name": "asChild",
        "type": "boolean",
        "required": false
      }
    ],
    "domNote": true
  },
  "Input": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/input.tsx",
    "props": [],
    "domNote": true
  },
  "Calendar": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/calendar.tsx",
    "props": [
      {
        "name": "animate",
        "type": "boolean",
        "required": false,
        "doc": "Animate navigating between months."
      },
      {
        "name": "aria-label",
        "type": "string",
        "required": false,
        "doc": "The aria-label attribute to add to the container element."
      },
      {
        "name": "aria-labelledby",
        "type": "string",
        "required": false,
        "doc": "The aria-labelledby attribute to add to the container element."
      },
      {
        "name": "autoFocus",
        "type": "boolean",
        "required": false,
        "doc": "When a selection mode is set, DayPicker will focus the first selected day"
      },
      {
        "name": "broadcastCalendar",
        "type": "boolean",
        "required": false,
        "doc": "Display the weeks in the month following the broadcast calendar. Setting"
      },
      {
        "name": "buttonVariant",
        "type": "\"link\" | \"default\" | \"outline\" | \"secondary\" | \"ghost\" | \"destructive\"",
        "required": false
      },
      {
        "name": "captionLayout",
        "type": "\"label\" | \"dropdown\" | \"dropdown-months\" | \"dropdown-years\"",
        "required": false,
        "doc": "Show dropdowns to navigate between months or years."
      },
      {
        "name": "className",
        "type": "string",
        "required": false,
        "doc": "Class name to add to the root element."
      },
      {
        "name": "classNames",
        "type": "Partial<ClassNames> & Partial<DeprecatedUI<string>>",
        "required": false,
        "doc": "Change the class names used by DayPicker."
      },
      {
        "name": "components",
        "type": "Partial<CustomComponents>",
        "required": false,
        "doc": "Change the components used for rendering the calendar elements."
      },
      {
        "name": "dateLib",
        "type": "Partial<DateLib>",
        "required": false,
        "doc": "Replace the default date library with a custom one. Experimental: not"
      },
      {
        "name": "defaultMonth",
        "type": "Date",
        "required": false,
        "doc": "The initial month to show in the calendar."
      },
      {
        "name": "dir",
        "type": "string",
        "required": false,
        "doc": "The text direction of the calendar. Use `ltr` for left-to-right (default)"
      },
      {
        "name": "disabled",
        "type": "Matcher | Matcher[]",
        "required": false,
        "doc": "Apply the `disabled` modifier to the matching days. Disabled days cannot be"
      },
      {
        "name": "disableNavigation",
        "type": "boolean",
        "required": false,
        "doc": "Disable the navigation between months. This prop won't hide the navigation:"
      },
      {
        "name": "endMonth",
        "type": "Date",
        "required": false,
        "doc": "The latest month to end the month navigation."
      },
      {
        "name": "firstWeekContainsDate",
        "type": "1 | 4",
        "required": false,
        "doc": "The day of January that is always in the first week of the year."
      },
      {
        "name": "fixedWeeks",
        "type": "boolean",
        "required": false,
        "doc": "Display always 6 weeks per each month, regardless of the month’s number of"
      },
      {
        "name": "footer",
        "type": "React.ReactNode",
        "required": false,
        "doc": "Add a footer to the calendar, acting as a live region."
      },
      {
        "name": "formatters",
        "type": "Partial<Formatters>",
        "required": false,
        "doc": "Formatters used to format dates to strings. Use this prop to override the"
      },
      {
        "name": "fromDate",
        "type": "Date",
        "required": false
      },
      {
        "name": "fromMonth",
        "type": "Date",
        "required": false
      },
      {
        "name": "fromYear",
        "type": "number",
        "required": false
      },
      {
        "name": "hidden",
        "type": "Matcher | Matcher[]",
        "required": false,
        "doc": "Apply the `hidden` modifier to the matching days. Will hide them from the"
      },
      {
        "name": "hideNavigation",
        "type": "boolean",
        "required": false,
        "doc": "Hide the navigation buttons. This prop won't disable the navigation: to"
      },
      {
        "name": "hideWeekdays",
        "type": "boolean",
        "required": false,
        "doc": "Hide the row displaying the weekday row header."
      },
      {
        "name": "id",
        "type": "string",
        "required": false,
        "doc": "A unique id to add to the root element."
      },
      {
        "name": "initialFocus",
        "type": "boolean",
        "required": false
      },
      {
        "name": "ISOWeek",
        "type": "boolean",
        "required": false,
        "doc": "Use ISO week dates instead of the locale setting. Setting this prop will"
      },
      {
        "name": "labels",
        "type": "Partial<Labels>",
        "required": false,
        "doc": "Labels creators to override the defaults. Use this prop to customize the"
      },
      {
        "name": "lang",
        "type": "string",
        "required": false,
        "doc": "Add the language tag to the container element."
      },
      {
        "name": "locale",
        "type": "Partial<DayPickerLocale>",
        "required": false,
        "doc": "The locale object used to localize dates. Pass a locale from"
      },
      {
        "name": "mode",
        "type": "\"single\" | \"multiple\" | \"range\"",
        "required": false,
        "doc": "Enable the selection of a single day, multiple days, or a range of days."
      },
      {
        "name": "modifiers",
        "type": "Record<string, Matcher | Matcher[]>",
        "required": false,
        "doc": "Add modifiers to the matching days."
      },
      {
        "name": "modifiersClassNames",
        "type": "ModifiersClassNames",
        "required": false,
        "doc": "Change the class name for the day matching the `modifiers`."
      },
      {
        "name": "modifiersStyles",
        "type": "ModifiersStyles",
        "required": false,
        "doc": "Change the class name for the day matching the {@link modifiers}."
      },
      {
        "name": "month",
        "type": "Date",
        "required": false,
        "doc": "The month displayed in the calendar."
      },
      {
        "name": "navLayout",
        "type": "\"around\" | \"after\"",
        "required": false,
        "doc": "Adjust the positioning of the navigation buttons."
      },
      {
        "name": "nonce",
        "type": "string",
        "required": false,
        "doc": "A cryptographic nonce (\"number used once\") which can be used by Content"
      },
      {
        "name": "noonSafe",
        "type": "boolean",
        "required": false,
        "doc": "Keep calendar math at noon in the configured {@link timeZone} to avoid"
      }
    ],
    "domNote": false,
    "truncated": true
  },
  "CalendarDayButton": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/calendar.tsx",
    "props": [
      {
        "name": "day",
        "type": "CalendarDay",
        "required": true,
        "doc": "The day to render."
      },
      {
        "name": "modifiers",
        "type": "Modifiers",
        "required": true,
        "doc": "The modifiers to apply to the day."
      },
      {
        "name": "locale",
        "type": "Partial<DayPickerLocale>",
        "required": false
      }
    ],
    "domNote": true
  },
  "Checkbox": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/checkbox.tsx",
    "props": [
      {
        "name": "asChild",
        "type": "boolean",
        "required": false
      },
      {
        "name": "checked",
        "type": "CheckboxPrimitive.CheckedState",
        "required": false
      },
      {
        "name": "defaultChecked",
        "type": "CheckboxPrimitive.CheckedState",
        "required": false
      },
      {
        "name": "onCheckedChange",
        "type": "(checked: CheckboxPrimitive.CheckedState) => void",
        "required": false
      },
      {
        "name": "required",
        "type": "boolean",
        "required": false
      }
    ],
    "domNote": true
  },
  "Badge": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/badge.tsx",
    "props": [
      {
        "name": "asChild",
        "type": "boolean",
        "required": false
      },
      {
        "name": "variant",
        "type": "\"link\" | \"default\" | \"outline\" | \"secondary\" | \"ghost\" | \"destructive\"",
        "required": false
      }
    ],
    "domNote": true
  },
  "Textarea": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/textarea.tsx",
    "props": [],
    "domNote": true
  },
  "Card": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/card.tsx",
    "props": [
      {
        "name": "size",
        "type": "\"default\" | \"sm\"",
        "required": false
      }
    ],
    "domNote": true
  },
  "CardHeader": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/card.tsx",
    "props": [],
    "domNote": true
  },
  "CardTitle": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/card.tsx",
    "props": [],
    "domNote": true
  },
  "CardDescription": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/card.tsx",
    "props": [],
    "domNote": true
  },
  "CardAction": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/card.tsx",
    "props": [],
    "domNote": true
  },
  "CardContent": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/card.tsx",
    "props": [],
    "domNote": true
  },
  "CardFooter": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/card.tsx",
    "props": [],
    "domNote": true
  },
  "ComboboxValue": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/combobox.tsx",
    "props": [
      {
        "name": "children",
        "type": "React.ReactNode | ((selectedValue: any) => React.ReactNode)",
        "required": false
      },
      {
        "name": "placeholder",
        "type": "React.ReactNode",
        "required": false,
        "doc": "The placeholder value to display when no value is selected."
      }
    ],
    "domNote": false
  },
  "ComboboxTrigger": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/combobox.tsx",
    "props": [
      {
        "name": "className",
        "type": "string | ((state: ComboboxTriggerState) => string)",
        "required": false,
        "doc": "CSS class applied to the element, or a function that"
      },
      {
        "name": "disabled",
        "type": "boolean",
        "required": false,
        "doc": "Whether the component should ignore user interaction."
      },
      {
        "name": "nativeButton",
        "type": "boolean",
        "required": false,
        "doc": "Whether the component renders a native `<button>` element when replacing it"
      },
      {
        "name": "render",
        "type": "React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | ComponentRenderFn<HTMLProps, ComboboxTriggerState>",
        "required": false,
        "doc": "Allows you to replace the component's HTML element"
      },
      {
        "name": "style",
        "type": "React.CSSProperties | ((state: ComboboxTriggerState) => React.CSSProperties)",
        "required": false,
        "doc": "Style applied to the element, or a function that"
      }
    ],
    "domNote": true
  },
  "ComboboxClear": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/combobox.tsx",
    "props": [
      {
        "name": "className",
        "type": "string | ((state: AutocompleteClearState) => string)",
        "required": false,
        "doc": "CSS class applied to the element, or a function that"
      },
      {
        "name": "disabled",
        "type": "boolean",
        "required": false,
        "doc": "Whether the component should ignore user interaction."
      },
      {
        "name": "keepMounted",
        "type": "boolean",
        "required": false,
        "doc": "Whether the component should remain mounted in the DOM when not visible."
      },
      {
        "name": "nativeButton",
        "type": "boolean",
        "required": false,
        "doc": "Whether the component renders a native `<button>` element when replacing it"
      },
      {
        "name": "render",
        "type": "React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | ComponentRenderFn<HTMLProps, AutocompleteClearState>",
        "required": false,
        "doc": "Allows you to replace the component's HTML element"
      },
      {
        "name": "style",
        "type": "React.CSSProperties | ((state: AutocompleteClearState) => React.CSSProperties)",
        "required": false,
        "doc": "Style applied to the element, or a function that"
      }
    ],
    "domNote": true
  },
  "ComboboxInput": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/combobox.tsx",
    "props": [
      {
        "name": "className",
        "type": "string | ((state: AutocompleteInputState) => string)",
        "required": false,
        "doc": "CSS class applied to the element, or a function that"
      },
      {
        "name": "disabled",
        "type": "boolean",
        "required": false,
        "doc": "Whether the component should ignore user interaction."
      },
      {
        "name": "render",
        "type": "React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | ComponentRenderFn<HTMLProps, AutocompleteInputState>",
        "required": false,
        "doc": "Allows you to replace the component's HTML element"
      },
      {
        "name": "showClear",
        "type": "boolean",
        "required": false
      },
      {
        "name": "showTrigger",
        "type": "boolean",
        "required": false
      },
      {
        "name": "style",
        "type": "React.CSSProperties | ((state: AutocompleteInputState) => React.CSSProperties)",
        "required": false,
        "doc": "Style applied to the element, or a function that"
      }
    ],
    "domNote": true
  },
  "ComboboxContent": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/combobox.tsx",
    "props": [
      {
        "name": "align",
        "type": "Align",
        "required": false,
        "doc": "How to align the popup relative to the specified side."
      },
      {
        "name": "alignOffset",
        "type": "number | OffsetFunction",
        "required": false,
        "doc": "Additional offset along the alignment axis in pixels."
      },
      {
        "name": "anchor",
        "type": "Element | VirtualElement | React.RefObject<Element> | (() => Element | VirtualElement)",
        "required": false,
        "doc": "An element to position the popup against."
      },
      {
        "name": "className",
        "type": "string | ((state: AutocompletePopupState) => string)",
        "required": false,
        "doc": "CSS class applied to the element, or a function that"
      },
      {
        "name": "finalFocus",
        "type": "boolean | React.RefObject<HTMLElement> | ((closeType: InteractionType) => boolean | void | HTMLElement)",
        "required": false,
        "doc": "Determines the element to focus when the popup is closed."
      },
      {
        "name": "initialFocus",
        "type": "boolean | React.RefObject<HTMLElement> | ((openType: InteractionType) => boolean | void | HTMLElement)",
        "required": false,
        "doc": "Determines the element to focus when the popup is opened."
      },
      {
        "name": "render",
        "type": "React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | ComponentRenderFn<HTMLProps, AutocompletePopupState>",
        "required": false,
        "doc": "Allows you to replace the component's HTML element"
      },
      {
        "name": "side",
        "type": "Side",
        "required": false,
        "doc": "Which side of the anchor element to align the popup against."
      },
      {
        "name": "sideOffset",
        "type": "number | OffsetFunction",
        "required": false,
        "doc": "Distance between the anchor and the popup in pixels."
      },
      {
        "name": "style",
        "type": "React.CSSProperties | ((state: AutocompletePopupState) => React.CSSProperties)",
        "required": false,
        "doc": "Style applied to the element, or a function that"
      }
    ],
    "domNote": true
  },
  "ComboboxList": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/combobox.tsx",
    "props": [
      {
        "name": "children",
        "type": "React.ReactNode | ((item: any, index: number) => React.ReactNode)",
        "required": false
      },
      {
        "name": "className",
        "type": "string | ((state: AutocompleteListState) => string)",
        "required": false,
        "doc": "CSS class applied to the element, or a function that"
      },
      {
        "name": "render",
        "type": "React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | ComponentRenderFn<HTMLProps, AutocompleteListState>",
        "required": false,
        "doc": "Allows you to replace the component's HTML element"
      },
      {
        "name": "style",
        "type": "React.CSSProperties | ((state: AutocompleteListState) => React.CSSProperties)",
        "required": false,
        "doc": "Style applied to the element, or a function that"
      }
    ],
    "domNote": true
  },
  "ComboboxItem": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/combobox.tsx",
    "props": [
      {
        "name": "children",
        "type": "React.ReactNode",
        "required": false
      },
      {
        "name": "className",
        "type": "string | ((state: ComboboxItemState) => string)",
        "required": false,
        "doc": "CSS class applied to the element, or a function that"
      },
      {
        "name": "disabled",
        "type": "boolean",
        "required": false,
        "doc": "Whether the component should ignore user interaction."
      },
      {
        "name": "index",
        "type": "number",
        "required": false,
        "doc": "The index of the item in the list. Improves performance when specified by avoiding the need to calculate the index automatically from the DOM."
      },
      {
        "name": "nativeButton",
        "type": "boolean",
        "required": false,
        "doc": "Whether the component renders a native `<button>` element when replacing it"
      },
      {
        "name": "onClick",
        "type": "(event: BaseUIEvent<React.MouseEvent<HTMLDivElement, MouseEvent>>) => void",
        "required": false,
        "doc": "An optional click handler for the item when selected."
      },
      {
        "name": "render",
        "type": "React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | ComponentRenderFn<HTMLProps, ComboboxItemState>",
        "required": false,
        "doc": "Allows you to replace the component's HTML element"
      },
      {
        "name": "style",
        "type": "React.CSSProperties | ((state: ComboboxItemState) => React.CSSProperties)",
        "required": false,
        "doc": "Style applied to the element, or a function that"
      },
      {
        "name": "value",
        "type": "any",
        "required": false,
        "doc": "A unique value that identifies this item."
      }
    ],
    "domNote": true
  },
  "ComboboxGroup": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/combobox.tsx",
    "props": [
      {
        "name": "className",
        "type": "string | ((state: AutocompleteGroupState) => string)",
        "required": false,
        "doc": "CSS class applied to the element, or a function that"
      },
      {
        "name": "items",
        "type": "readonly any[]",
        "required": false,
        "doc": "Items to be rendered within this group."
      },
      {
        "name": "render",
        "type": "React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | ComponentRenderFn<HTMLProps, AutocompleteGroupState>",
        "required": false,
        "doc": "Allows you to replace the component's HTML element"
      },
      {
        "name": "style",
        "type": "React.CSSProperties | ((state: AutocompleteGroupState) => React.CSSProperties)",
        "required": false,
        "doc": "Style applied to the element, or a function that"
      }
    ],
    "domNote": true
  },
  "ComboboxLabel": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/combobox.tsx",
    "props": [
      {
        "name": "className",
        "type": "string | ((state: AutocompleteGroupLabelState) => string)",
        "required": false,
        "doc": "CSS class applied to the element, or a function that"
      },
      {
        "name": "render",
        "type": "React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | ComponentRenderFn<HTMLProps, AutocompleteGroupLabelState>",
        "required": false,
        "doc": "Allows you to replace the component's HTML element"
      },
      {
        "name": "style",
        "type": "React.CSSProperties | ((state: AutocompleteGroupLabelState) => React.CSSProperties)",
        "required": false,
        "doc": "Style applied to the element, or a function that"
      }
    ],
    "domNote": true
  },
  "ComboboxCollection": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/combobox.tsx",
    "props": [
      {
        "name": "children",
        "type": "(item: any, index: number) => React.ReactNode",
        "required": true
      }
    ],
    "domNote": false
  },
  "ComboboxEmpty": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/combobox.tsx",
    "props": [
      {
        "name": "className",
        "type": "string | ((state: AutocompleteEmptyState) => string)",
        "required": false,
        "doc": "CSS class applied to the element, or a function that"
      },
      {
        "name": "render",
        "type": "React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | ComponentRenderFn<HTMLProps, AutocompleteEmptyState>",
        "required": false,
        "doc": "Allows you to replace the component's HTML element"
      },
      {
        "name": "style",
        "type": "React.CSSProperties | ((state: AutocompleteEmptyState) => React.CSSProperties)",
        "required": false,
        "doc": "Style applied to the element, or a function that"
      }
    ],
    "domNote": true
  },
  "ComboboxSeparator": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/combobox.tsx",
    "props": [
      {
        "name": "className",
        "type": "string | ((state: SeparatorState) => string)",
        "required": false,
        "doc": "CSS class applied to the element, or a function that"
      },
      {
        "name": "orientation",
        "type": "Orientation",
        "required": false,
        "doc": "The orientation of the separator."
      },
      {
        "name": "render",
        "type": "React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | ComponentRenderFn<HTMLProps, SeparatorState>",
        "required": false,
        "doc": "Allows you to replace the component's HTML element"
      },
      {
        "name": "style",
        "type": "React.CSSProperties | ((state: SeparatorState) => React.CSSProperties)",
        "required": false,
        "doc": "Style applied to the element, or a function that"
      }
    ],
    "domNote": true
  },
  "ComboboxChips": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/combobox.tsx",
    "props": [
      {
        "name": "className",
        "type": "string | ((state: ComboboxChipsState) => string)",
        "required": false,
        "doc": "CSS class applied to the element, or a function that"
      },
      {
        "name": "render",
        "type": "React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | ComponentRenderFn<HTMLProps, ComboboxChipsState>",
        "required": false,
        "doc": "Allows you to replace the component's HTML element"
      },
      {
        "name": "style",
        "type": "React.CSSProperties | ((state: ComboboxChipsState) => React.CSSProperties)",
        "required": false,
        "doc": "Style applied to the element, or a function that"
      }
    ],
    "domNote": true
  },
  "ComboboxChip": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/combobox.tsx",
    "props": [
      {
        "name": "className",
        "type": "string | ((state: ComboboxChipState) => string)",
        "required": false,
        "doc": "CSS class applied to the element, or a function that"
      },
      {
        "name": "render",
        "type": "React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | ComponentRenderFn<HTMLProps, ComboboxChipState>",
        "required": false,
        "doc": "Allows you to replace the component's HTML element"
      },
      {
        "name": "showRemove",
        "type": "boolean",
        "required": false
      },
      {
        "name": "style",
        "type": "React.CSSProperties | ((state: ComboboxChipState) => React.CSSProperties)",
        "required": false,
        "doc": "Style applied to the element, or a function that"
      }
    ],
    "domNote": true
  },
  "ComboboxChipsInput": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/combobox.tsx",
    "props": [
      {
        "name": "className",
        "type": "string | ((state: AutocompleteInputState) => string)",
        "required": false,
        "doc": "CSS class applied to the element, or a function that"
      },
      {
        "name": "disabled",
        "type": "boolean",
        "required": false,
        "doc": "Whether the component should ignore user interaction."
      },
      {
        "name": "render",
        "type": "React.ReactElement<unknown, string | React.JSXElementConstructor<any>> | ComponentRenderFn<HTMLProps, AutocompleteInputState>",
        "required": false,
        "doc": "Allows you to replace the component's HTML element"
      },
      {
        "name": "style",
        "type": "React.CSSProperties | ((state: AutocompleteInputState) => React.CSSProperties)",
        "required": false,
        "doc": "Style applied to the element, or a function that"
      }
    ],
    "domNote": true
  },
  "DropdownMenuSubTrigger": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/dropdown-menu.tsx",
    "props": [
      {
        "name": "asChild",
        "type": "boolean",
        "required": false
      },
      {
        "name": "disabled",
        "type": "boolean",
        "required": false
      },
      {
        "name": "inset",
        "type": "boolean",
        "required": false
      },
      {
        "name": "textValue",
        "type": "string",
        "required": false
      }
    ],
    "domNote": true
  },
  "DropdownMenuSubContent": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/dropdown-menu.tsx",
    "props": [
      {
        "name": "alignOffset",
        "type": "number",
        "required": false
      },
      {
        "name": "arrowPadding",
        "type": "number",
        "required": false
      },
      {
        "name": "asChild",
        "type": "boolean",
        "required": false
      },
      {
        "name": "avoidCollisions",
        "type": "boolean",
        "required": false
      },
      {
        "name": "collisionBoundary",
        "type": "Element | Element[]",
        "required": false
      },
      {
        "name": "collisionPadding",
        "type": "number | Partial<Record<\"top\" | \"right\" | \"bottom\" | \"left\", number>>",
        "required": false
      },
      {
        "name": "forceMount",
        "type": "true",
        "required": false,
        "doc": "Used to force mounting when more control is needed. Useful when"
      },
      {
        "name": "hideWhenDetached",
        "type": "boolean",
        "required": false
      },
      {
        "name": "loop",
        "type": "boolean",
        "required": false,
        "doc": "Whether keyboard navigation should loop around"
      },
      {
        "name": "onEscapeKeyDown",
        "type": "(event: KeyboardEvent) => void",
        "required": false
      },
      {
        "name": "onFocusOutside",
        "type": "(event: CustomEvent<{ originalEvent: FocusEvent; }>) => void",
        "required": false
      },
      {
        "name": "onInteractOutside",
        "type": "(event: CustomEvent<{ originalEvent: PointerEvent; }> | CustomEvent<{ originalEvent: FocusEvent; }>) => void",
        "required": false
      },
      {
        "name": "onPointerDownOutside",
        "type": "(event: CustomEvent<{ originalEvent: PointerEvent; }>) => void",
        "required": false
      },
      {
        "name": "sideOffset",
        "type": "number",
        "required": false
      },
      {
        "name": "sticky",
        "type": "\"always\" | \"partial\"",
        "required": false
      },
      {
        "name": "updatePositionStrategy",
        "type": "\"always\" | \"optimized\"",
        "required": false
      }
    ],
    "domNote": true
  },
  "DropdownMenuContent": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/dropdown-menu.tsx",
    "props": [
      {
        "name": "align",
        "type": "\"center\" | \"start\" | \"end\"",
        "required": false
      },
      {
        "name": "alignOffset",
        "type": "number",
        "required": false
      },
      {
        "name": "arrowPadding",
        "type": "number",
        "required": false
      },
      {
        "name": "asChild",
        "type": "boolean",
        "required": false
      },
      {
        "name": "avoidCollisions",
        "type": "boolean",
        "required": false
      },
      {
        "name": "collisionBoundary",
        "type": "Element | Element[]",
        "required": false
      },
      {
        "name": "collisionPadding",
        "type": "number | Partial<Record<\"top\" | \"right\" | \"bottom\" | \"left\", number>>",
        "required": false
      },
      {
        "name": "forceMount",
        "type": "true",
        "required": false,
        "doc": "Used to force mounting when more control is needed. Useful when"
      },
      {
        "name": "hideWhenDetached",
        "type": "boolean",
        "required": false
      },
      {
        "name": "loop",
        "type": "boolean",
        "required": false,
        "doc": "Whether keyboard navigation should loop around"
      },
      {
        "name": "onCloseAutoFocus",
        "type": "(event: Event) => void",
        "required": false,
        "doc": "Event handler called when auto-focusing on close."
      },
      {
        "name": "onEscapeKeyDown",
        "type": "(event: KeyboardEvent) => void",
        "required": false
      },
      {
        "name": "onFocusOutside",
        "type": "(event: CustomEvent<{ originalEvent: FocusEvent; }>) => void",
        "required": false
      },
      {
        "name": "onInteractOutside",
        "type": "(event: CustomEvent<{ originalEvent: PointerEvent; }> | CustomEvent<{ originalEvent: FocusEvent; }>) => void",
        "required": false
      },
      {
        "name": "onPointerDownOutside",
        "type": "(event: CustomEvent<{ originalEvent: PointerEvent; }>) => void",
        "required": false
      },
      {
        "name": "side",
        "type": "\"top\" | \"right\" | \"bottom\" | \"left\"",
        "required": false
      },
      {
        "name": "sideOffset",
        "type": "number",
        "required": false
      },
      {
        "name": "sticky",
        "type": "\"always\" | \"partial\"",
        "required": false
      },
      {
        "name": "updatePositionStrategy",
        "type": "\"always\" | \"optimized\"",
        "required": false
      }
    ],
    "domNote": true
  },
  "DropdownMenuItem": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/dropdown-menu.tsx",
    "props": [
      {
        "name": "asChild",
        "type": "boolean",
        "required": false
      },
      {
        "name": "disabled",
        "type": "boolean",
        "required": false
      },
      {
        "name": "inset",
        "type": "boolean",
        "required": false
      },
      {
        "name": "onSelect",
        "type": "(event: Event) => void",
        "required": false
      },
      {
        "name": "textValue",
        "type": "string",
        "required": false
      },
      {
        "name": "variant",
        "type": "\"default\" | \"destructive\"",
        "required": false
      }
    ],
    "domNote": true
  },
  "DropdownMenuCheckboxItem": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/dropdown-menu.tsx",
    "props": [
      {
        "name": "asChild",
        "type": "boolean",
        "required": false
      },
      {
        "name": "checked",
        "type": "boolean | \"indeterminate\"",
        "required": false
      },
      {
        "name": "disabled",
        "type": "boolean",
        "required": false
      },
      {
        "name": "onCheckedChange",
        "type": "(checked: boolean) => void",
        "required": false
      },
      {
        "name": "onSelect",
        "type": "(event: Event) => void",
        "required": false
      },
      {
        "name": "textValue",
        "type": "string",
        "required": false
      }
    ],
    "domNote": true
  },
  "DropdownMenuRadioItem": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/dropdown-menu.tsx",
    "props": [
      {
        "name": "value",
        "type": "string",
        "required": true
      },
      {
        "name": "asChild",
        "type": "boolean",
        "required": false
      },
      {
        "name": "disabled",
        "type": "boolean",
        "required": false
      },
      {
        "name": "onSelect",
        "type": "(event: Event) => void",
        "required": false
      },
      {
        "name": "textValue",
        "type": "string",
        "required": false
      }
    ],
    "domNote": true
  },
  "DropdownMenuLabel": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/dropdown-menu.tsx",
    "props": [
      {
        "name": "asChild",
        "type": "boolean",
        "required": false
      },
      {
        "name": "inset",
        "type": "boolean",
        "required": false
      }
    ],
    "domNote": true
  },
  "DropdownMenuSeparator": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/dropdown-menu.tsx",
    "props": [
      {
        "name": "asChild",
        "type": "boolean",
        "required": false
      }
    ],
    "domNote": true
  },
  "DropdownMenuShortcut": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/dropdown-menu.tsx",
    "props": [],
    "domNote": true
  },
  "Accordion": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/accordion.tsx",
    "props": [
      {
        "name": "type",
        "type": "\"single\" | \"multiple\"",
        "required": true
      },
      {
        "name": "asChild",
        "type": "boolean",
        "required": false
      },
      {
        "name": "defaultValue",
        "type": "string | string[]",
        "required": false,
        "doc": "The value of the item whose content is expanded when the accordion is initially rendered. Use"
      },
      {
        "name": "dir",
        "type": "\"ltr\" | \"rtl\"",
        "required": false,
        "doc": "The language read direction."
      },
      {
        "name": "disabled",
        "type": "boolean",
        "required": false,
        "doc": "Whether or not an accordion is disabled from user interaction."
      },
      {
        "name": "onValueChange",
        "type": "((value: string) => void) | ((value: string[]) => void)",
        "required": false,
        "doc": "The callback that fires when the state of the accordion changes."
      },
      {
        "name": "orientation",
        "type": "\"horizontal\" | \"vertical\"",
        "required": false,
        "doc": "The layout in which the Accordion operates."
      },
      {
        "name": "value",
        "type": "string | string[]",
        "required": false,
        "doc": "The controlled stateful value of the accordion item whose content is expanded."
      }
    ],
    "domNote": true
  },
  "AccordionItem": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/accordion.tsx",
    "props": [
      {
        "name": "value",
        "type": "string",
        "required": true,
        "doc": "A string value for the accordion item. All items within an accordion should use a unique value."
      },
      {
        "name": "asChild",
        "type": "boolean",
        "required": false
      },
      {
        "name": "disabled",
        "type": "boolean",
        "required": false,
        "doc": "Whether or not an accordion item is disabled from user interaction."
      }
    ],
    "domNote": true
  },
  "AccordionTrigger": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/accordion.tsx",
    "props": [
      {
        "name": "asChild",
        "type": "boolean",
        "required": false
      }
    ],
    "domNote": true
  },
  "AccordionContent": {
    "import": "@axiom/components/ui",
    "source": "src/shared/lib/shadcn/ui/accordion.tsx",
    "props": [
      {
        "name": "asChild",
        "type": "boolean",
        "required": false
      },
      {
        "name": "forceMount",
        "type": "true",
        "required": false,
        "doc": "Used to force mounting when more control is needed. Useful when"
      }
    ],
    "domNote": true
  }
};
