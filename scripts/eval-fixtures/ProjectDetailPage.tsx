import { Button } from '@axiom/components/ui';
import PageHeader from '@/shared/components/ui/PageHeader';
import StatusBadge, { type StatusType } from '@/shared/components/ui/StatusBadge';
import { Edit, UserPlus } from 'lucide-react';
import { useParams } from 'react-router';
import { useApi } from '@axiom/hooks';
import dayjs from 'dayjs';
import { useState, useEffect } from 'react';

type TProjectAssignment = {
	id: number;
	role: string;
	rate_pct: number;
	start_date: string;
	end_date: string | null;
	employee_id: number;
	employee_name: string;
	department: string;
	position: string;
};

// API 응답 데이터 타입 정의
type TProjectDetailData = {
	id: number;
	name: string;
	client: string;
	start_date: string;
	end_date: string;
	description: string;
	progress_pct: number;
	status: string;
	tech_stack: string[];
};

type TProjectDetail = {
	assignments: TProjectAssignment[];
	client: string;
	created_at: string;
	description: string;
	end_date: string;
	id: number;
	name: string;
	progress_pct: number;
	start_date: string;
	status: string;
	tech_stack: any[];
	updated_at: string;
};

// API 응답 wrapper 타입
type TProjectDetailResponse = {
	success: boolean;
	data: TProjectDetail;
};

const tabs = ['개요', '투입 인력', '일정', '계약'];

export default function ProjectDetailPage(): React.ReactNode {
	const { id } = useParams<{ id: string }>();
	const PROJECTS_ENDPOINT = `/api/projects/${id}` as const;

	const { data, isPending, error } = useApi<TProjectDetailResponse>(PROJECTS_ENDPOINT);

	// 상태 관리
	const [project, setProject] = useState<TProjectDetailData | undefined>(undefined);
	const [assignments, setAssignments] = useState<TProjectAssignment[]>([]);
	const [client, setClient] = useState<string>('');
	const [members, setMembers] = useState<{ name: string; role: string; rate: string; start: string; end: string }[]>(
		[],
	);

	// 데이터 추출 및 members 변환
	useEffect(() => {
		if (data?.data) {
			setProject(data.data);
			setAssignments(data.data.assignments ?? []);
			setClient(data.data.client);
		}
	}, [data]);

	// members 변환 (assignments가 undefined일 경우 빈 배열로 처리)
	useEffect(() => {
		const transformedMembers = Array.isArray(assignments)
			? assignments.map((a) => ({
					name: a.employee_name,
					role: a.position,
					rate: `${a.rate_pct}%`,
					start: a.start_date,
					end: a.end_date ?? '미정',
				}))
			: [];
		setMembers(transformedMembers);
	}, [assignments]);

	// 기술스택
	const techStack = project?.tech_stack ?? [];

	// 날짜 포맷팅
	const formatDate = (dateStr: string) => {
		const date = new Date(dateStr);
		console.log('날짜 dayjs 확인::', dateStr, dayjs(dateStr).format('YYYY-MM-DD'));
		return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
	};

	// 인력 배정 버튼 클릭
	const handleAssignEmployeeProj = () => {
		$router.push(`/project/${id}/assign`);
	};

	return (
		<div className="p-5">
			<PageHeader
				title={project?.name ?? '프로젝트 상세'}
				breadcrumb={[{ label: '프로젝트', path: '/projects' }, { label: project?.name ?? '로딩 중...' }]}
				actions={
					<div className="flex gap-2">
						<Button
							variant="outline"
							onClick={() => $router.back()}
						>
							목록으로
						</Button>
						<Button
							variant="outline"
							size="lg"
						>
							<Edit className="w-4 h-4 mr-1.5" />
							수정
						</Button>
						<Button
							size="lg"
							onClick={handleAssignEmployeeProj}
						>
							<UserPlus className="w-4 h-4 mr-1.5" />
							인력 배정
						</Button>
					</div>
				}
			/>

			{/* 개요 카드 */}
			<div className="bg-card rounded-xl border p-5 mb-4">
				{isPending ? (
					<p className="text-sm text-gray-500">로딩 중…</p>
				) : error ? (
					<p className="text-sm text-red-600">에러: {error.message}</p>
				) : project ? (
					<>
						<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
							<div>
								<p className="text-xs text-muted-foreground mb-0.5">프로젝트명</p>
								<p className="font-semibold text-foreground">{project.name}</p>
							</div>
							<div>
								<p className="text-xs text-muted-foreground mb-0.5">고객사</p>
								<p className="font-semibold text-foreground">{client}</p>
							</div>
							<div>
								<p className="text-xs text-muted-foreground mb-0.5">프로젝트 기간</p>
								<p className="font-semibold text-foreground">
									{formatDate(project.start_date)} ~ {formatDate(project.end_date)}
								</p>
							</div>
							<div>
								<p className="text-xs text-muted-foreground mb-0.5">상태</p>
								<StatusBadge status={project.status as StatusType} />
							</div>
							<div>
								<p className="text-xs text-muted-foreground mb-0.5">진척도</p>
								<p className="font-semibold text-foreground">{project.progress_pct}%</p>
							</div>
							<div className="col-span-2">
								<p className="text-xs text-muted-foreground mb-0.5">프로젝트 설명</p>
								<p className="text-sm text-foreground">{project.description}</p>
							</div>
						</div>
						{/* 진척도 바 */}
						<div>
							<div className="flex justify-between text-sm mb-1">
								<span className="text-muted-foreground">현재 진척도</span>
								<span className="font-semibold text-brand-600">{project.progress_pct}%</span>
							</div>
							<div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
								<div
									className="h-full bg-brand-500 rounded-full transition-all duration-300"
									style={{ width: `${project.progress_pct}%` }}
								/>
							</div>
						</div>
					</>
				) : (
					<p className="text-sm text-gray-500">데이터를 불러올 수 없습니다</p>
				)}
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
						</button>
					))}
				</div>
			</div>

			{/* 투입 인력 탭 */}
			<div className="bg-card rounded-xl border overflow-hidden mb-4">
				<div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
					<h3 className="font-semibold text-foreground text-sm">투입 인력 ({members.length}명)</h3>
				</div>
				<table className="w-full text-sm">
					<thead className="bg-muted/50">
						<tr>
							<th className="text-left py-2.5 px-4 font-medium text-muted-foreground">이름</th>
							<th className="text-left py-2.5 px-4 font-medium text-muted-foreground">역할</th>
							<th className="text-left py-2.5 px-4 font-medium text-muted-foreground">투입률</th>
							<th className="text-left py-2.5 px-4 font-medium text-muted-foreground">투입일</th>
							<th className="text-left py-2.5 px-4 font-medium text-muted-foreground">철수예정</th>
						</tr>
					</thead>
					<tbody>
						{members.length > 0 ? (
							members.map((m) => (
								<tr
									key={m.name}
									className="border-t hover:bg-muted/20 transition-colors"
								>
									<td className="py-2.5 px-4">
										<div className="flex items-center gap-2">
											<div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-semibold text-xs">
												{m.name[0]}
											</div>
											<span className="font-medium text-foreground">{m.name}</span>
										</div>
									</td>
									<td className="py-2.5 px-4">
										<span className="px-2 py-0.5 rounded text-xs bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 font-medium">
											{m.role}
										</span>
									</td>
									<td className="py-2.5 px-4 font-medium text-muted-foreground">{m.rate}</td>
									<td className="py-2.5 px-4 text-muted-foreground">{dayjs(m.start).format('YYYY.MM.DD')}</td>
									<td className="py-2.5 px-4 text-muted-foreground">{dayjs(m.end).format('YYYY.MM.DD')}</td>
								</tr>
							))
						) : (
							<tr>
								<td
									colSpan={5}
									className="py-8 text-center text-muted-foreground"
								>
									아직 투입 인력이 없습니다
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			{/* 기술스택 */}
			<div className="bg-card rounded-xl border p-4">
				<h3 className="font-semibold text-foreground text-sm mb-3">기술 스택</h3>
				<div className="flex flex-wrap gap-2">
					{techStack.map((t) => (
						<span
							key={t}
							className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium"
						>
							{t}
						</span>
					))}
				</div>
			</div>
		</div>
	);
}
