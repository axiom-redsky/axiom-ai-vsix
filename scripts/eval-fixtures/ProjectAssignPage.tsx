import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@axiom/components/ui';
import PageHeader from '@/shared/components/ui/PageHeader';
import { SlidersHorizontal, CheckSquare } from 'lucide-react';
import { useApi } from '@axiom/hooks';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';

// API 응답 타입 정의
interface BenchMember {
	id: number;
	name: string;
	department: string;
	position: string;
	hire_date: string;
	skills: string[];
}

interface FilterState {
	techStack: string;
	rate: string;
	experience: string;
	dept: string;
}

// API 응답 wrapper 타입
type TBenchMemberListResponse = {
	success: boolean;
	data: BenchMember[];
};

const roles = ['PM', 'PL', '개발', 'QA', '디자인', 'BA'];

export default function ProjectAssignPage(): React.ReactNode {
	const { id } = useParams<{ id: string }>();
	// 필터 상태
	const [filters, setFilters] = useState<FilterState>({
		techStack: 'all',
		rate: 'all',
		experience: 'all',
		dept: 'all',
	});

	// 선택된 인력 ID 목록
	const [selectedIds, setSelectedIds] = useState<number[]>([]);
	const [benchMembers, setBenchMembers] = useState<any>([]);
	// 역할
	const [position, setPosition] = useState('');

	// 인력 목록 조회 API
	const { data: benchResp, isLoading, error } = useApi<TBenchMemberListResponse>('/api/dashboard/bench-members');

	// 프로젝트 배정 API
	const { mutate: assignMembers, isPending: isAssigning } = useApi<{
		employee_id: string;
		project_id: string;
		role: string;
		rate_pct: string;
		start_date: string;
		end_date: string;
	}>('/api/assignments', {
		method: 'POST',
		type: 'mutation',
	});

	// 필터 변경 시 API 재요청
	useEffect(() => {
		// params 변경 시 useApi 가 자동으로 재요청됨
	}, [filters]);

	useEffect(() => {
		if (benchResp) {
			setBenchMembers(benchResp?.data);
		}
	}, [benchResp]);

	// 인력 선택 토글
	const toggleMemberSelection = (id: number) => {
		setSelectedIds((prev) => (prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id]));
	};

	// 필터 변경 핸들러
	const handleFilterChange = (key: keyof FilterState, value: string) => {
		setFilters((prev) => ({ ...prev, [key]: value }));
	};

	// 배정 확정 핸들러
	const handleAssignConfirm = () => {
		if (selectedIds.length === 0) {
			alert('인력을 선택해주세요.');
			return;
		}
		// 실제 구현에서는 역할, 투입률, 날짜 등을 폼에서 가져와야 함
		assignMembers({
			project_id: id, // 현재 프로젝트 ID
			employee_id: selectedIds,
			role: position, // 예시
			rate_pct: 100,
			start_date: '2026-06-01',
			end_date: '2026-12-31',
		});
	};

	// 선택된 인력 이름 추출
	const selectedMembers = benchMembers?.filter((m: any) => selectedIds.includes(m.id));

	return (
		<div className="p-5">
			<PageHeader
				title="인력 배정"
				breadcrumb={[
					{ label: '프로젝트', path: '/projects' },
					{ label: 'A 금융 차세대 코어뱅킹', path: '/projects/1' },
					{ label: '인력 배정' },
				]}
			/>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
				{/* 가용 인력 목록 */}
				<div className="lg:col-span-2">
					{/* 필터 */}
					<div className="flex flex-wrap gap-2 mb-3">
						<Select
							value={filters.techStack}
							onValueChange={(value) => handleFilterChange('techStack', value)}
						>
							<SelectTrigger
								size="lg"
								className="bg-muted/60 border-slate-300 dark:border-slate-600 shadow-sm"
							>
								<SelectValue placeholder="기술스택" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">기술스택 전체</SelectItem>
							</SelectContent>
						</Select>
						<Select
							value={filters.rate}
							onValueChange={(value) => handleFilterChange('rate', value)}
						>
							<SelectTrigger
								size="lg"
								className="bg-muted/60 border-slate-300 dark:border-slate-600 shadow-sm"
							>
								<SelectValue placeholder="투입률 (현재)" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">투입률 전체</SelectItem>
							</SelectContent>
						</Select>
						<Select
							value={filters.experience}
							onValueChange={(value) => handleFilterChange('experience', value)}
						>
							<SelectTrigger
								size="lg"
								className="bg-muted/60 border-slate-300 dark:border-slate-600 shadow-sm"
							>
								<SelectValue placeholder="경력" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">경력 전체</SelectItem>
							</SelectContent>
						</Select>
						<Select
							value={filters.dept}
							onValueChange={(value) => handleFilterChange('dept', value)}
						>
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
						<button
							className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg text-muted-foreground hover:bg-muted transition-colors"
							onClick={() => setFilters({ techStack: 'all', rate: 'all', experience: 'all', dept: 'all' })}
						>
							<SlidersHorizontal className="w-4 h-4" />
							초기화
						</button>
					</div>

					{/* 로딩/에러 상태 처리 */}
					{isLoading && <div className="text-center py-8 text-muted-foreground">로딩 중...</div>}
					{error && <div className="text-center py-8 text-red-600">데이터를 불러오지 못했습니다</div>}

					{!isLoading && !error && (
						<div className="bg-card rounded-xl border overflow-hidden">
							<div className="px-4 py-3 border-b bg-muted/30">
								<h3 className="font-semibold text-foreground text-sm">
									가용 인력 목록 (벤치 {benchMembers?.length || 0}명)
								</h3>
							</div>
							<table className="w-full text-sm">
								<thead className="bg-muted/50">
									<tr>
										<th className="text-left py-2.5 px-4 font-medium text-muted-foreground">선택</th>
										<th className="text-left py-2.5 px-4 font-medium text-muted-foreground">이름</th>
										<th className="text-left py-2.5 px-4 font-medium text-muted-foreground">부서</th>
										<th className="text-left py-2.5 px-4 font-medium text-muted-foreground">기술스택</th>
										<th className="text-left py-2.5 px-4 font-medium text-muted-foreground">현 투입률</th>
									</tr>
								</thead>
								<tbody>
									{benchMembers?.map((m: any) => (
										<tr
											key={m.id}
											className={`border-t transition-colors ${selectedIds.includes(m.id) ? 'bg-brand-50 dark:bg-brand-900/20' : 'hover:bg-muted/20'}`}
										>
											<td className="py-2.5 px-4">
												<div
													className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${selectedIds.includes(m.id) ? 'bg-brand-600 border-brand-600' : 'border-slate-300 dark:border-slate-600'}`}
													onClick={() => toggleMemberSelection(m.id)}
												>
													{selectedIds.includes(m.id) && <CheckSquare className="w-3 h-3 text-white" />}
												</div>
											</td>
											<td className="py-2.5 px-4">
												<div className="flex items-center gap-2">
													<div className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-700 dark:text-brand-300 font-semibold text-xs">
														{m.name[0]}
													</div>
													<span
														className={`font-medium ${selectedIds.includes(m.id) ? 'text-brand-700 dark:text-brand-300' : 'text-foreground'}`}
													>
														{m.name}
													</span>
												</div>
											</td>
											<td className="py-2.5 px-4 text-muted-foreground">{m.department}</td>
											<td className="py-2.5 px-4 text-muted-foreground text-xs">{m.skills.join(', ')}</td>
											<td className="py-2.5 px-4 font-medium text-muted-foreground">0%</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>

				{/* 배정 설정 폼 */}
				<div className="bg-card rounded-xl border p-4 h-fit">
					<h3 className="font-semibold text-foreground mb-4 text-sm">배정 설정</h3>

					<div className="mb-3 p-2.5 bg-brand-50 dark:bg-brand-900/20 rounded-lg">
						<p className="text-xs text-brand-600 dark:text-brand-400 font-medium mb-1">선택 인력:</p>
						<p className="text-sm text-brand-800 dark:text-brand-200 font-semibold">
							{selectedMembers?.map((m: any) => m.name).join(', ') || '선택된 인력이 없습니다'}
						</p>
					</div>

					<div className="space-y-3">
						<div>
							<label className="block text-sm font-medium text-foreground mb-1">역할 *</label>
							<Select
								value={position}
								onValueChange={setPosition}
							>
								<SelectTrigger
									size="lg"
									className="w-full bg-muted/60 border-slate-300 dark:border-slate-600 shadow-sm"
								>
									<SelectValue placeholder="역할 선택" />
								</SelectTrigger>
								<SelectContent>
									{roles.map((r) => (
										<SelectItem
											key={r}
											value={r}
										>
											{r}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div>
							<label className="block text-sm font-medium text-foreground mb-1">투입률 *</label>
							<div className="flex gap-2">
								<button className="flex-1 py-2 text-sm border rounded-lg text-center bg-brand-600 text-white font-medium">
									100%
								</button>
								<button className="flex-1 py-2 text-sm border rounded-lg text-center hover:bg-muted transition-colors text-muted-foreground">
									50%
								</button>
							</div>
						</div>
						<div>
							<label className="block text-sm font-medium text-foreground mb-1">투입 시작일 *</label>
							<Input
								type="date"
								defaultValue="2026-06-01"
								className="h-9 bg-muted/60 border-slate-300 dark:border-slate-600 shadow-sm focus-visible:border-brand-500 focus-visible:ring-brand-500/20"
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-foreground mb-1">종료 예정일</label>
							<Input
								type="date"
								defaultValue="2026-12-31"
								className="h-9 bg-muted/60 border-slate-300 dark:border-slate-600 shadow-sm focus-visible:border-brand-500 focus-visible:ring-brand-500/20"
							/>
						</div>
					</div>

					<div className="mt-4 pt-4 border-t">
						<p className="text-xs text-orange-600 dark:text-orange-400 mb-3">
							⚠ 배정 확정 시 투입 현황 자동 갱신 · 해당 직원 이메일 알림 발송
						</p>
						<div className="flex gap-2">
							<Button
								variant="outline"
								className="flex-1"
								size="sm"
								onClick={() => setSelectedIds([])}
							>
								초기화
							</Button>
							<Button
								className="flex-1"
								size="sm"
								disabled={isAssigning || selectedIds.length === 0}
								onClick={handleAssignConfirm}
							>
								{isAssigning ? '배정 중...' : '배정 확정'}
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
