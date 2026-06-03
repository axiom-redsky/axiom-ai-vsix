import { useState } from 'react';
import { useApi } from '@axiom/hooks';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Input,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@axiom/components/ui';

const EMPLOYEES_ENDPOINT = '/api/employees';

type TEmploymentStatus = '재직' | '휴직' | '퇴사';

interface TEmployee {
  id: number;
  name: string;
  departmentName: string;
  employmentStatus: TEmploymentStatus;
  deploymentStatus: string;
}

interface TEmployeeListResponse {
  items: TEmployee[];
  total: number;
}

export default function EmployeeListPage(): React.ReactNode {
  // 검색 키워드와 두 가지 상태 필터를 로컬 상태로 둔다
  const [keyword, setKeyword] = useState('');
  const [employmentStatus, setEmploymentStatus] = useState('all');
  const [deploymentStatus, setDeploymentStatus] = useState('all');
  // 라벨 상수
  const deploymentSelectLabel = '투입상태';

  const { data, isPending } = useApi<TEmployeeListResponse>(EMPLOYEES_ENDPOINT, {
    params: { keyword, employmentStatus, deploymentStatus },
  });

  const employees = data?.items ?? [];

  return (
    <div className="employee-list-page">
      <header className="page-header">
        <h1>직원 목록</h1>
        <p className="count">총 {data?.total ?? 0}명</p>
      </header>

      <div className="toolbar">
        <Input
          placeholder="이름으로 검색"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />

        <Select value={employmentStatus} onValueChange={setEmploymentStatus}>
          <SelectTrigger>
            <SelectValue placeholder="재직상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">재직상태 전체</SelectItem>
            <SelectItem value="재직">재직</SelectItem>
            <SelectItem value="휴직">휴직</SelectItem>
            <SelectItem value="퇴사">퇴사</SelectItem>
          </SelectContent>
        </Select>

        <Select defaultValue="all">
          <SelectTrigger
            size="lg"
            className="bg-muted/60 border-slate-300 dark:border-slate-600 shadow-sm"
          >
            <SelectValue placeholder="투입상태 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">투입상태 전체</SelectItem>
            <SelectItem value="active">투입중</SelectItem>
            <SelectItem value="bench">벤치</SelectItem>
            <SelectItem value="warning">철수임박</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>이름</TableHead>
            <TableHead>부서</TableHead>
            <TableHead>재직상태</TableHead>
            <TableHead>투입상태</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending ? (
            <TableRow>
              <TableCell colSpan={4}>불러오는 중…</TableCell>
            </TableRow>
          ) : (
            employees.map((emp) => (
              <TableRow key={emp.id}>
                <TableCell>{emp.name}</TableCell>
                <TableCell>{emp.departmentName}</TableCell>
                <TableCell>{emp.employmentStatus}</TableCell>
                <TableCell>{emp.deploymentStatus}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
