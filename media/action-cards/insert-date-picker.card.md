---
schemaVersion: 1
id: insert-date-picker
title: 날짜 선택(Calendar) 삽입
icon: 📅
triggers: [달력, 캘린더, 날짜 선택, 날짜 입력, datepicker, date picker]
preconditions: [file-open, scaffold-detected]
action:
  type: recipe
  # 기존 날짜 입력을 **갈아끼우는** 레시피다(추가가 아니라 교체) — 위치 찾기가 잡은 요소를 대체한다.
  mode: replace
  # 이 레시피가 겨냥하는 것 — 사용자 문장("달력으로 바꿔줘")에는 코드와 겹치는 글자가 없으므로
  # 카드가 자기 대상을 직접 말해준다(위치 찾기 힌트).
  target: date 날짜 입력 input
priority: 10
---

## 설명
날짜 입력을 Calendar(@axiom/components/ui) 드롭다운 패턴으로 삽입합니다.
4부품(import·열림 state+ref·바깥클릭 닫기 effect·버튼+조건부 Calendar JSX)을 한 번에 —
기존 날짜 문자열 state(서버 전송 포맷)는 유지하고 선택 결과만 반영합니다
(ScaffoldContracts date-picker 계약카드와 동일 패턴).

## 골격
```tsx
import { Calendar, Button } from '@axiom/components/ui';

const [pickerOpen, setPickerOpen] = useState(false);
const pickerRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  const h = (e: MouseEvent): void => {
    if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
  };
  document.addEventListener('mousedown', h);
  return () => document.removeEventListener('mousedown', h);
}, []);

<div ref={pickerRef} className="relative">
  <Button variant="outline" onClick={() => setPickerOpen((v) => !v)}>
    {/* 기존 날짜 문자열 state 표시 */}
  </Button>
  {pickerOpen && (
    <Calendar mode="single" onSelect={(d) => { /* 기존 state에 yyyy-MM-dd로 반영 */ setPickerOpen(false); }} />
  )}
</div>
```
