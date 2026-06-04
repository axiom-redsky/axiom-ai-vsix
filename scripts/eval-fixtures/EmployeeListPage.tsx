import { useApi } from '@axiom/hooks';
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@axiom/components/ui';
import PageHeader from '@/shared/components/ui/PageHeader';
//import StatusBadge from '@/shared/components/ui/StatusBadge';
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

// 직원 타입 정의 — 실제 API response 구조에 맞춤
type TEmployee = {
	id: number;
	name: string;
	email: string;
	phone: string;
	department: string;
	position: string;
	skills: string[];
	employment_status: 'active' | 'leave' | 'resign';
	hire_date: string;
	created_at: string;
	updated_at: string;
};

// API 응답 wrapper 타입
type TEmployeeListResponse = {
	success: boolean;
	data: TEmployee[];
	meta: {
		total: number;
		page: number;
		limit: number;
	};
};

const EMPLOYEES_ENDPOINT = '/api/employees' as const;
const PAGE_LIMIT = 10; // 페이지당 표시할 항목 수

type TDepartment = {
	id: number;
	name: string;
};

type TDepartmentListResponse = {
	success: boolean;
	data: TDepartment[];
};

const DEPARTMENTS_ENDPOINT = '/api/departments';

type TCommonCode = {
	id: number;
	group_code: string;
	code: string;
	code_name: string;
	sort_order: number;
	use_yn: boolean;
	extra1: string | null;
	extra2: string | null;
	extra3: string | null;
};

type TCommonCodesResponse = {
	success: boolean;
	data: {
		EMPLOYMENT_STATUS: TCommonCode[];
		DEPLOYMENT_STATUS: TCommonCode[];
	};
};

export default function EmployeeListPage(): React.ReactNode {
	/** 페이지네이션 상태 */
	const [currentPage, setCurrentPage] = useState<number>(1);

	/** 검색어 상태 */
	const [searchQuery, setSearchQuery] = useState<string>('');

	/** 검색 타이머 ID — Debounce 구현용 */
	const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	/** GET 조회 - 직원 목록 (페이지네이션 + 검색 파라미터 포함) */
	const {
		data: response,
		isPending,
		error,
		refetch,
		isFetching,
	} = useApi<TEmployeeListResponse>(EMPLOYEES_ENDPOINT, {
		params: {
			page: currentPage,
			limit: PAGE_LIMIT,
			search: searchQuery || undefined,
		},
	});

	// 검색어 변경 핸들러 (Debounce 적용)
	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		setSearchQuery(value);

		// 검색어 변경 시 페이지 1 로 리셋
		setCurrentPage(1);

		// 이전 타이머가 있으면 취소
		if (searchTimeoutRef.current) {
			clearTimeout(searchTimeoutRef.current);
		}

		// 800ms 후 API 재요청
		searchTimeoutRef.current = setTimeout(() => {
			refetch();
		}, 800);
	};

	const [employees, setEmployees] = useState<TEmployee[]>([]);

	useEffect(() => {
		console.log('>>>>>>> response::', response);
		setEmployees(response?.data ?? []);
	}, [response]);

	// 총 페이지 수 계산
	const totalPages = Math.ceil((response?.meta.total ?? 0) / PAGE_LIMIT);

	// 페이지 변경 핸들러
	const handlePageChange = (page: number) => {
		if (page >= 1 && page <= totalPages) {
			setCurrentPage(page);
		}
	};

	// 직원등록 화면이동
	const handleMoveEmployeeForm = () => {
		$router.push('/employee/employee-form');
	};

	// 컴포넌트 언마운트 시 타이머 정리
	useEffect(() => {
		return () => {
			if (searchTimeoutRef.current) {
				clearTimeout(searchTimeoutRef.current);
			}
		};
	}, []);
	const [selectedDepartment, setSelectedDepartment] = useState<string>('all');

	const { data: deptResponse } = useApi<TDepartmentListResponse>(DEPARTMENTS_ENDPOINT);
	const [selectedStatus, setSelectedStatus] = useState<string>('all');
	const [employmentStatusCodes, setEmploymentStatusCodes] = useState<TCommonCode[]>([]);

	const { data: commonCodesResponse } = useApi<TCommonCodesResponse>('/api/common-codes', {
		params: {
			groups: 'EMPLOYMENT_STATUS',
			include_disabled: 'true',
		},
	});

	useEffect(() => {
		if (commonCodesResponse?.data?.EMPLOYMENT_STATUS) {
			setEmploymentStatusCodes(commonCodesResponse.data.EMPLOYMENT_STATUS);
		}
	}, [commonCodesResponse]);
	const { data: deploymentResponse } = useApi<TCommonCodesResponse>('/api/common-codes', {
		params: {
			groups: 'DEPLOYMENT_STATUS',
		},
	});

	const deploymentStatuses = deploymentResponse?.data?.DEPLOYMENT_STATUS ?? [];

	const [selectedDeployment, setSelectedDeployment] = useState<string>('all');

	const departments = deptResponse?.data ?? [];

	return (
		<div className="p-5">
			<PageHeader
				title="직원 관리"
				actions={
					<Button
						size="lg"
						onClick={handleMoveEmployeeForm}
					>
						<UserPlus className="w-4 h-4 mr-1.5" />
						직원 등록
					</Button>
				}
			/>

			{/* 필터바 */}
			<div className="flex flex-wrap gap-2 mb-4">
				<div className="relative flex-1 min-w-48">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
					<Input
						onChange={handleSearchChange}
						value={searchQuery}
						className="h-9 pl-9 bg-muted/60 border-slate-300 dark:border-slate-600 shadow-sm focus-visible:border-primary focus-visible:ring-primary/20"
						placeholder="이름 검색..."
					/>
				</div>
				<Select
					value={selectedDepartment}
					onValueChange={(value) => {
						setSelectedDepartment(value);
						setCurrentPage(1);
						searchTimeoutRef.current = setTimeout(() => {
							refetch();
						}, 800);
					}}
				>
					<SelectTrigger
						size="lg"
						className="bg-muted/60 border-slate-300 dark:border-slate-600 shadow-sm"
					>
						<SelectValue placeholder="부서 선택" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">부서 전체</SelectItem>
						{departments.map((dept) => (
							<SelectItem
								key={dept.id}
								value={dept.name}
							>
								{dept.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select
					value={selectedStatus}
					onValueChange={(value) => setSelectedStatus(value)}
				>
					<SelectTrigger
						size="lg"
						className="bg-muted/60 border-slate-300 dark:border-slate-600 shadow-sm"
					>
						<SelectValue placeholder="재직상태 선택" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">재직상태 전체</SelectItem>
						{employmentStatusCodes.map((code) => (
							<SelectItem
								key={code.code}
								value={code.code}
							>
								{code.code_name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select
					value={selectedDeployment}
					onValueChange={setSelectedDeployment}
				>
					<SelectTrigger
						size="lg"
						className="bg-muted/60 border-slate-300 dark:border-slate-600 shadow-sm"
					>
						<SelectValue placeholder="투입상태 선택" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">투입상태 전체</SelectItem>
						{deploymentStatuses.map((status) => (
							<SelectItem
								key={status.code}
								value={status.code}
							>
								{status.code_name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Button
					variant="outline"
					size="lg"
					onClick={() => {
						setSearchQuery('');
						setCurrentPage(1);
						refetch();
					}}
					className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg text-muted-foreground hover:bg-muted transition-colors"
				>
					<SlidersHorizontal className="w-4 h-4" />
					초기화
				</Button>
			</div>

			{/* 테이블 */}
			<div className="bg-card rounded-xl border overflow-hidden">
				{/* 로딩 상태 */}
				{isPending ? (
					<div className="p-8 text-center text-muted-foreground">
						<p>로딩 중…</p>
					</div>
				) : error ? (
					<div className="p-8 text-center text-red-600">
						<p>에러: {error.message}</p>
						<button
							onClick={() => refetch()}
							disabled={isFetching}
							className="mt-2 px-4 py-2 text-sm border rounded-lg hover:bg-muted"
						>
							{isFetching ? '다시 가져오는 중…' : '다시 가져오기'}
						</button>
					</div>
				) : (
					<>
						<table className="w-full text-sm">
							<thead className="bg-muted/50">
								<tr>
									<th className="text-left py-3 px-4 font-medium text-muted-foreground">이름</th>
									<th className="text-left py-3 px-4 font-medium text-muted-foreground">부서</th>
									<th className="text-left py-3 px-4 font-medium text-muted-foreground">직급</th>
									<th className="text-left py-3 px-4 font-medium text-muted-foreground">이메일</th>
									<th className="text-left py-3 px-4 font-medium text-muted-foreground">입사일</th>
									<th className="text-left py-3 px-4 font-medium text-muted-foreground">상태</th>
									<th className="text-left py-3 px-4 font-medium text-muted-foreground">액션</th>
								</tr>
							</thead>
							<tbody>
								{employees.length > 0 ? (
									employees.map((emp: TEmployee) => (
										<tr
											key={emp.id}
											className="border-t hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors cursor-pointer"
										>
											<td className="py-3 px-4">
												<div className="flex items-center gap-2">
													<div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-500/20 flex items-center justify-center text-brand-600 dark:text-brand-300 font-semibold text-xs">
														{emp.name[0]}
													</div>
													<span className="font-medium text-foreground">{emp.name}</span>
												</div>
											</td>
											<td className="py-3 px-4 text-muted-foreground">{emp.department}</td>
											<td className="py-3 px-4 text-muted-foreground">{emp.position}</td>
											<td className="py-3 px-4 text-muted-foreground">{emp.email}</td>
											<td className="py-3 px-4 text-muted-foreground">{emp.hire_date.split('T')[0]}</td>
											<td className="py-3 px-4">{/*<StatusBadge status={emp.employment_status} />*/}</td>
											<td className="py-3 px-4">
												<Button
													variant="link"
													className="text-primary hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 px-0"
													onClick={() => $router.push(`/employee/employee-detail/${emp.id}`)}
												>
													상세보기
												</Button>
											</td>
										</tr>
									))
								) : (
									<tr>
										<td
											colSpan={7}
											className="py-8 text-center text-muted-foreground"
										>
											등록된 직원이 없습니다.
										</td>
									</tr>
								)}
							</tbody>
						</table>

						{/* 페이지네이션 */}
						<div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
							<div className="text-sm text-muted-foreground">
								총 {response?.meta.total ?? 0}개 중 {currentPage}페이지
							</div>
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									disabled={currentPage === 1}
									onClick={() => handlePageChange(currentPage - 1)}
								>
									<ChevronLeft className="w-4 h-4" />
								</Button>
								<div className="flex items-center gap-1">
									{Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
										<Button
											key={page}
											variant={currentPage === page ? 'default' : 'outline'}
											size="sm"
											onClick={() => handlePageChange(page)}
											className="w-8 h-8 p-0"
										>
											{page}
										</Button>
									))}
								</div>
								<Button
									variant="outline"
									size="sm"
									disabled={currentPage === totalPages}
									onClick={() => handlePageChange(currentPage + 1)}
								>
									<ChevronRight className="w-4 h-4" />
								</Button>
							</div>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
