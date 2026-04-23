---
title: Dialog / Sheet 컴포넌트
tags: [dialog, modal, 모달, popup, 팝업, sheet, 사이드패널, 다이얼로그]
scope: component
---

# Dialog / Sheet 컴포넌트

## 임포트

```typescript
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@axiom/components/ui';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@axiom/components/ui';
```

## Dialog (모달) 기본 사용

```tsx
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter,
} from '@axiom/components/ui';
import { Button } from '@axiom/components/ui';

function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>삭제 확인</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">정말 삭제하시겠습니까?</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            삭제
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

## Dialog 상태 관리 패턴

```tsx
function UserListPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const handleDeleteClick = (id: number) => {
    setSelectedId(id);
    setDialogOpen(true);
  };

  return (
    <>
      <Button variant="destructive" onClick={() => handleDeleteClick(1)}>
        삭제
      </Button>
      <DeleteConfirmDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={() => {
          // 삭제 로직
          setDialogOpen(false);
        }}
      />
    </>
  );
}
```

## Sheet (사이드 패널) 사용

```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@axiom/components/ui';

function UserDetailSheet({
  open,
  onOpenChange,
  userId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: number | null;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px]">
        <SheetHeader>
          <SheetTitle>사용자 상세</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          {/* 상세 내용 */}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

## 주의사항

- `DialogTrigger`보다 `open` + `onOpenChange` 제어 방식을 선호한다 (상태가 명시적)
- Dialog 내부에서 form submit 시 `onOpenChange(false)`로 닫아준다
