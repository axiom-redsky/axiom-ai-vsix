---
title: 디자인 시스템 — 전체 컴포넌트 목록
tags: [design-system, 디자인시스템, 컴포넌트목록, component-list, variants, shadcn, axiom/components/ui, 전체컴포넌트, tbd, 추가예정, 확정컴포넌트]
scope: design-system
status: in-progress
---

# 디자인 시스템 — 전체 컴포넌트 목록

> **운영 규칙**
> - 새 컴포넌트는 **섹션 B(추가 예정)**에 먼저 등록 → 명세(상세 문서) 완료 후 **섹션 A(확정)**으로 이동
> - 각 행의 `status` 컬럼: `confirmed` = 명세 완료 / `tbd` = 검토·작업 중 / `deprecated` = 사용 중단
> - 개별 상세 문서는 `knowledge/components/` 폴더에 별도 파일로 관리
> - 디자인 시스템 명세가 추가·변경될 때마다 이 파일을 함께 업데이트한다

## 임포트

```typescript
import { Button, Input, Card } from '@axiom/components/ui';
```

모든 UI 컴포넌트는 `@axiom/components/ui`에서 임포트한다. 내부 경로 직접 임포트 금지.

---

## 섹션 A — 확정 컴포넌트

현재 명세(상세 문서)가 완료된 컴포넌트. 바로 사용 가능.

### Form (입력)

| 컴포넌트 | 주요 variants / props | status | 상세 문서 |
|---------|---------------------|--------|---------|
| `Button` | variant: default / secondary / outline / ghost / destructive / link · size: sm / md / lg / icon | confirmed | [Button.md](../components/Button.md) |
| `Input` | type: text / password / email / number · disabled · placeholder | confirmed | [Input.md](../components/Input.md) |
| `Label` | htmlFor | confirmed | [Input.md](../components/Input.md) |
| `Select`, `SelectTrigger`, `SelectContent`, `SelectItem` | placeholder · disabled | confirmed | [Select.md](../components/Select.md) |
| `Form`, `FormField`, `FormItem`, `FormLabel`, `FormMessage` | react-hook-form + zod 연동 | confirmed | [Form.md](../components/Form.md) |

### Layout (레이아웃)

| 컴포넌트 | 주요 variants / props | status | 상세 문서 |
|---------|---------------------|--------|---------|
| `Card`, `CardHeader`, `CardContent`, `CardFooter`, `CardTitle`, `CardDescription` | — | confirmed | [layout.md](layout.md) |
| `Separator` | orientation: horizontal / vertical | confirmed | — |
| `ScrollArea` | — | confirmed | — |

### Feedback (피드백)

| 컴포넌트 | 주요 variants / props | status | 상세 문서 |
|---------|---------------------|--------|---------|
| `Badge` | variant: default / secondary / outline / destructive | confirmed | — |
| `Skeleton` | className으로 크기 지정 | confirmed | — |
| `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` | side: top / bottom / left / right | confirmed | — |

### Data Display (데이터 표시)

| 컴포넌트 | 주요 variants / props | status | 상세 문서 |
|---------|---------------------|--------|---------|
| `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` | — | confirmed | [Table.md](../components/Table.md) |
| `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | — | confirmed | — |
| `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent` | type: single / multiple | confirmed | — |

### Overlay (오버레이)

| 컴포넌트 | 주요 variants / props | status | 상세 문서 |
|---------|---------------------|--------|---------|
| `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter` | — | confirmed | [Dialog.md](../components/Dialog.md) |
| `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle` | side: top / bottom / left / right | confirmed | [Dialog.md](../components/Dialog.md) |

---

## 섹션 B — 추가 예정 / 검토 중

명세 미완성 항목. 컴포넌트명과 간략한 용도만 기재. 명세 완료 시 섹션 A로 이동.

| 컴포넌트 | 용도 (초안) | status |
|---------|-----------|--------|
| `Checkbox` | 체크박스 단일 선택 | tbd |
| `RadioGroup`, `RadioGroupItem` | 라디오 그룹 선택 | tbd |
| `Switch` | 토글 스위치 | tbd |
| `Textarea` | 멀티라인 텍스트 입력 | tbd |
| `Calendar`, `DatePicker` | 날짜 선택 | tbd |
| `Popover`, `PopoverTrigger`, `PopoverContent` | 팝오버 레이어 | tbd |
| `Command`, `CommandInput`, `CommandList` | 커맨드 팔레트 / 검색 | tbd |
| `DropdownMenu` | 드롭다운 메뉴 | tbd |
| `Alert`, `AlertTitle`, `AlertDescription` | 인라인 알림 메시지 | tbd |
| `AlertDialog` | 확인 요청 다이얼로그 | tbd |
| `Avatar`, `AvatarImage`, `AvatarFallback` | 사용자 아바타 | tbd |
| `Progress` | 진행률 바 | tbd |
| `Collapsible` | 접기/펼치기 | tbd |
| `HoverCard` | 마우스 오버 카드 | tbd |
| `NavigationMenu` | 네비게이션 메뉴 | tbd |
| `Breadcrumb` | 브레드크럼 | tbd |
| `Toggle`, `ToggleGroup` | 토글 버튼 / 그룹 | tbd |
| `Menubar` | 메뉴바 | tbd |
