import { useApi } from '@axiom/hooks';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@axiom/components/ui';
import PageHeader from '@/shared/components/ui/PageHeader';
import StatusBadge, { type StatusType } from '@/shared/components/ui/StatusBadge';
import { Download, SlidersHorizontal } from 'lucide-react';

// API 응답 타입 정의 (개별 항목)
type TAssignmentItem = {
	id: number;
	role: string;
	rate_pct: number;
	start_date: string;
	end_date: string | null;
	is_current: boolean;
	employee_id: number;
	employee_name: string;
	department: string;
	project_id: number;
	project_name: string;
	client: string;
};

// 날짜 포맷팅 헬퍼 (ISO 8601 → YY.MM.DD)
const formatDate = (dateStr: string | null): string => {
	if (!dateStr) return '—';
	const date = new Date(dateStr);
	const year = date.getFullYear().toString().slice(-2);
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}.${month}.${day}`;
};

// UI 에서 사용하는 데이터 형식으로 변환하는 헬퍼 함수
const mapAssignmentsToMembers = (assignments: TAssignmentItem[]) => {
	return assignments.map((a) => ({
		name: a.employee_name,
		dept: a.department,
		project: a.project_name,
		role: a.role,
		rate: `${a.rate_pct}%`,
		start: formatDate(a.start_date),
		end: formatDate(a.end_date),
		status: a.is_current ? 'active' : 'complete', // is_current 기준 상태 매핑
	}));
};

// 초기 상태용 더미 데이터 (로딩 중 또는 에러 시 fallback)
const initialMembers = [
	{
		name: '김민준',
		dept: '개발팀',
		project: 'A금융 차세대',
		role: '백엔드 개발자',
		rate: '100%',
		start: '25.03.01',
		end: '26.09.30',
		status: 'active' as const,
	},
	{
		name: '이서연',
		dept: '디자인',
		project: '벤치',
		role: '—',
		rate: '0%',
		start: '—',
		end: '—',
		status: 'bench' as const,
	},
];

const summaryCards = [
	{ label: '전체', value: '32 명', color: 'text-foreground' },
	{ label: '투입 중', value: '26 명', color: 'text-emerald-600' },
	{ label: '벤치', value: '6 명', color: 'text-amber-600' },
	{ label: '휴가', value: '1 명', color: 'text-sky-600' },
];

export default function ProjectStatusPage(): React.ReactNode {
	// 현재 투입 중인 인원만 조회
	const {
		data: apiResponse,
		isPending,
		error,
		refetch,
		isFetching,
	} = useApi<{ success: boolean; data: TAssignmentItem[] }>('/api/assignments', {
		params: { current_only: true },
	});

	// API 응답에서 실제 데이터 추출
	const assignments = apiResponse?.data ?? [];
	const members = assignments.length > 0 ? mapAssignmentsToMembers(assignments) : initialMembers;

	return (
		<div className="p-5">
			<PageHeader
				title="전체 투입 현황"
				actions={
					<Button
						variant="outline"
						size="sm"
					>
						<Download className="w-4 h-4 mr-1.5" />
						엑셀 저장
					</Button>
				}
			/>

			{/* 요약 수치 */}
			<div className="flex flex-wrap gap-3 mb-4">
				{summaryCards.map((card) => (
					<div
						key={card.label}
						className="bg-card rounded-lg border px-4 py-2 flex items-center gap-2"
					>
						<span className={`text-lg font-bold ${card.color}`}>{card.value}</span>
						<span className="text-sm text-muted-foreground">{card.label}</span>
					</div>
				))}
			</div>

			{/* 필터 */}
			<div className="flex flex-wrap gap-2 mb-4">
				<Select defaultValue="all">
					<SelectTrigger
						size="lg"
						className="bg-muted/60 border-slate-300 dark:border-slate-600 shadow-sm"
					>
						<SelectValue placeholder="상태" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">상태 전체</SelectItem>
						<SelectItem value="active">투입중</SelectItem>
						<SelectItem value="bench">벤치</SelectItem>
						<SelectItem value="leave">휴가</SelectItem>
					</SelectContent>
				</Select>
				<Select defaultValue="all">
					<SelectTrigger
						size="lg"
						className="bg-muted/60 border-slate-300 dark:border-slate-600 shadow-sm"
					>
						<SelectValue placeholder="부서" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">부서 전체</SelectItem>
					</SelectContent>
				</Select>
				<Select defaultValue="all">
					<SelectTrigger
						size="lg"
						className="bg-muted/60 border-slate-300 dark:border-slate-600 shadow-sm"
					>
						<SelectValue placeholder="철수 임박 (30 일)" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">철수 임박 전체</SelectItem>
						<SelectItem value="30">30 일 이내</SelectItem>
					</SelectContent>
				</Select>
				<button className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg text-muted-foreground hover:bg-muted transition-colors">
					<SlidersHorizontal className="w-4 h-4" />
					초기화
				</button>
				<Button
					size="sm"
					onClick={() => refetch()}
					disabled={isFetching}
				>
					{isFetching ? '조회 중…' : '조회'}
				</Button>
			</div>

			{/* 로딩/에러 상태 처리 */}
			{isPending ? (
				<div className="flex items-center justify-center py-12 text-muted-foreground">로딩 중…</div>
			) : error ? (
				<div className="flex items-center justify-center py-12 text-red-600 bg-red-50 rounded-lg border border-red-200">
					에러 발생: {error.message}
				</div>
			) : (
				/* 테이블 */
				<div className="bg-card rounded-xl border overflow-hidden">
					<table className="w-full text-sm">
						<thead className="bg-muted/50">
							<tr>
								<th className="text-left py-3 px-4 font-medium text-muted-foreground">이름</th>
								<th className="text-left py-3 px-4 font-medium text-muted-foreground">부서</th>
								<th className="text-left py-3 px-4 font-medium text-muted-foreground">현재 프로젝트</th>
								<th className="text-left py-3 px-4 font-medium text-muted-foreground">역할</th>
								<th className="text-left py-3 px-4 font-medium text-muted-foreground">투입률</th>
								<th className="text-left py-3 px-4 font-medium text-muted-foreground">투입일</th>
								<th className="text-left py-3 px-4 font-medium text-muted-foreground">철수 예정일</th>
								<th className="text-left py-3 px-4 font-medium text-muted-foreground">상태</th>
							</tr>
						</thead>
						<tbody>
							{members.map((m) => (
								<tr
									key={m.name}
									className={`border-t transition-colors hover:bg-muted/20 ${
										m.status === 'warning' ? 'bg-orange-50/50 dark:bg-orange-900/10' : ''
									}`}
								>
									<td className="py-2.5 px-4">
										<div className="flex items-center gap-2">
											<div className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-700 dark:text-brand-300 font-semibold text-xs">
												{m.name[0]}
											</div>
											<span className="font-medium text-foreground">{m.name}</span>
										</div>
									</td>
									<td className="py-2.5 px-4 text-muted-foreground">{m.dept}</td>
									<td className="py-2.5 px-4 font-medium text-foreground">{m.project}</td>
									<td className="py-2.5 px-4">
										{m.role !== '—' && (
											<span className="px-2 py-0.5 rounded text-xs bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 font-medium">
												{m.role}
											</span>
										)}
										{m.role === '—' && <span className="text-muted-foreground">—</span>}
									</td>
									<td className="py-2.5 px-4 font-medium">{m.rate}</td>
									<td className="py-2.5 px-4 text-muted-foreground">{m.start}</td>
									<td className="py-2.5 px-4 text-muted-foreground">{m.end}</td>
									<td className="py-2.5 px-4">
										<StatusBadge status={m.status as StatusType} />
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
