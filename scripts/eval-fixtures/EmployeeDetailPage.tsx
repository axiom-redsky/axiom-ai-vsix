import { useParams } from 'react-router';
import { useApi } from '@axiom/hooks';
import { Button } from '@axiom/components/ui';
import PageHeader from '@/shared/components/ui/PageHeader';
//import StatusBadge from '@/shared/components/ui/StatusBadge';
import { Mail, Phone, Calendar, Edit, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

// 날짜 포맷팅 유틸리티
const formatDate = (dateString: string | null): string => {
	if (!dateString) return '-';
	return new Date(dateString).toLocaleDateString('ko-KR', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});
};

// 투입률 포맷팅
const formatRate = (ratePct: number): string => {
	return `${ratePct}%`;
};

// API 응답 타입 정의
type TAssignmentHistory = {
	id: number;
	role: string;
	rate_pct: number;
	start_date: string;
	end_date: string | null;
	project_name: string;
	client: string;
	project_status: string;
	created_at: string;
	updated_at: string;
};

type TEmployeeDetail = {
	id: number;
	name: string;
	email: string;
	phone: string;
	department: string;
	position: string;
	employment_status: string;
	hire_date: string;
	skills: string[];
	assignment_history: TAssignmentHistory[];
};

// API 응답 wrapper 타입
type TEmployeeListResponse = {
	success: boolean;
	data: TEmployeeDetail;
	meta: {
		total: number;
		page: number;
		limit: number;
	};
};

const tabs = ['기본정보', '투입 이력', '기술스택', '계약정보'];

export default function EmployeeDetailPage(): React.ReactNode {
	const { id } = useParams<{ id: string }>();

	// API 조회
	const {
		data: response,
		isPending,
		error,
		refetch,
		isFetching,
	} = useApi<TEmployeeListResponse>(`/api/employees/${id}`, {
		params: { id },
	});

	const [employee, setEmployee] = useState<TEmployeeDetail | any>({});

	useEffect(() => {
		console.log('>>>>>>> response::', response);
		setEmployee(response?.data ?? []);
	}, [response]);

	// 로딩 중
	if (isPending) {
		return (
			<div className="p-5">
				<PageHeader
					title="직원 상세"
					breadcrumb={[{ label: '직원관리', path: '/employees' }, { label: '로딩 중...' }]}
				/>
				<p className="text-sm text-gray-500">데이터를 불러오는 중…</p>
			</div>
		);
	}

	// 에러 처리
	if (error) {
		return (
			<div className="p-5">
				<PageHeader
					title="직원 상세"
					breadcrumb={[{ label: '직원관리', path: '/employees' }, { label: '에러 발생' }]}
				/>
				<p className="text-sm text-red-600">에러: {error.message}</p>
				<Button
					onClick={() => refetch()}
					disabled={isFetching}
					className="mt-4"
				>
					{isFetching ? '다시 가져오는 중…' : '다시 가져오기'}
				</Button>
			</div>
		);
	}

	// 데이터 없음 처리
	if (!employee) {
		return (
			<div className="p-5">
				<PageHeader
					title="직원 상세"
					breadcrumb={[{ label: '직원관리', path: '/employees' }, { label: '데이터 없음' }]}
				/>
				<p className="text-sm text-gray-500">해당 직원을 찾을 수 없습니다.</p>
			</div>
		);
	}

	return (
		<div className="p-5">
			<PageHeader
				title="직원 상세"
				breadcrumb={[{ label: '직원관리', path: '/employees' }, { label: employee.name }]}
				actions={
					<div className="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => $router.push(`/employee/employee-edit/${employee.id}`)}
						>
							<Edit className="w-4 h-4 mr-1.5" />
							수정
						</Button>
						<Button
							variant="outline"
							size="sm"
							className="text-destructive hover:text-destructive"
							onClick={() => $router.push(`/employees/${employee.id}/delete`)}
						>
							<Trash2 className="w-4 h-4 mr-1.5" />
							삭제
						</Button>
					</div>
				}
			/>

			{/* 직원 요약 카드 */}
			<div className="bg-card rounded-xl border p-5 mb-4 flex flex-col sm:flex-row sm:items-center gap-4">
				<div className="w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-2xl font-bold">
					{String(employee.name).charAt(0)}
				</div>
				<div className="flex-1">
					<div className="flex items-center gap-2 mb-1">
						<h2 className="text-xl font-bold text-foreground">{employee.name}</h2>
						<span className="text-sm text-muted-foreground">
							{employee.department} · {employee.position}
						</span>
						{/*<StatusBadge status={employee.employment_status} />*/}
					</div>
					<div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
						<span className="flex items-center gap-1.5">
							<Mail className="w-3.5 h-3.5" />
							{employee.email}
						</span>
						<span className="flex items-center gap-1.5">
							<Phone className="w-3.5 h-3.5" />
							{employee.phone}
						</span>
						<span className="flex items-center gap-1.5">
							<Calendar className="w-3.5 h-3.5" />
							입사 {formatDate(employee.hire_date)}
						</span>
					</div>
				</div>
				<div className="text-right">
					<p className="text-sm text-muted-foreground">현 투입 프로젝트</p>
					<p className="font-semibold text-foreground">{employee.assignment_history?.[0]?.project_name || '-'}</p>
					<p className="text-sm text-brand-600 font-medium">
						{employee.assignment_history?.[0]?.rate_pct
							? `투입률 ${employee.assignment_history[0].rate_pct}%`
							: '미투입'}
					</p>
				</div>
			</div>

			{/* 탭 */}
			<div className="border-b mb-4">
				<div className="flex gap-0">
					{tabs.map((tab, idx) => (
						<button
							key={tab}
							className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
								idx === 1
									? 'border-brand-600 text-brand-600'
									: 'border-transparent text-muted-foreground hover:text-foreground'
							}`}
						>
							{tab}
							{tab === '투입 이력' && <span className="ml-1 text-xs text-brand-500">★</span>}
						</button>
					))}
				</div>
			</div>

			{/* 투입 이력 탭 내용 */}
			<div className="bg-card rounded-xl border overflow-hidden">
				<div className="px-4 py-3 border-b bg-muted/30">
					<h3 className="font-semibold text-foreground text-sm">프로젝트 투입 이력</h3>
				</div>
				<table className="w-full text-sm">
					<thead className="bg-muted/50">
						<tr>
							<th className="text-left py-2.5 px-4 font-medium text-muted-foreground">프로젝트</th>
							<th className="text-left py-2.5 px-4 font-medium text-muted-foreground">고객사</th>
							<th className="text-left py-2.5 px-4 font-medium text-muted-foreground">역할</th>
							<th className="text-left py-2.5 px-4 font-medium text-muted-foreground">투입기간</th>
							<th className="text-left py-2.5 px-4 font-medium text-muted-foreground">투입률</th>
							<th className="text-left py-2.5 px-4 font-medium text-muted-foreground">상태</th>
						</tr>
					</thead>
					<tbody>
						{employee.assignment_history && employee.assignment_history.length > 0 ? (
							employee.assignment_history.map((proj: TAssignmentHistory, idx: number) => (
								<tr
									key={idx}
									className="border-t hover:bg-muted/20 transition-colors"
								>
									<td className="py-2.5 px-4 font-medium text-foreground">{proj.project_name}</td>
									<td className="py-2.5 px-4 text-muted-foreground">{proj.client}</td>
									<td className="py-2.5 px-4">
										<span className="px-2 py-0.5 rounded text-xs bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 font-medium">
											{proj.role}
										</span>
									</td>
									<td className="py-2.5 px-4 text-muted-foreground">
										{formatDate(proj.start_date)} ~ {proj.end_date ? formatDate(proj.end_date) : '현재'}
									</td>
									<td className="py-2.5 px-4 font-medium">{formatRate(proj.rate_pct)}</td>
									<td className="py-2.5 px-4">{/*<StatusBadge status={proj.project_status} />*/}</td>
								</tr>
							))
						) : (
							<tr>
								<td
									colSpan={6}
									className="py-8 text-center text-muted-foreground"
								>
									투입 이력이 없습니다.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			{/* 하단 버튼 */}
			<div className="flex justify-end gap-2 mt-4">
				<Button
					variant="outline"
					onClick={() => $router.back()}
				>
					목록으로
				</Button>
				<Button onClick={() => $router.push(`/employee/employee-edit/${employee.id}`)}>수정</Button>
			</div>
		</div>
	);
}
