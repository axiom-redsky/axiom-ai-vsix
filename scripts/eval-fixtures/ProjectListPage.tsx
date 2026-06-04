import type React from 'react';
import { useState } from 'react';
import { useApi } from '@axiom/hooks';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@axiom/components/ui';
import {
	Button,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Skeleton,
} from '@axiom/components/ui';
import PageHeader from '@/shared/components/ui/PageHeader';
import StatusBadge from '@/shared/components/ui/StatusBadge';
import type { StatusType } from '@/shared/components/ui/StatusBadge';

import { Search, Plus, Calendar, Users } from 'lucide-react';

// 프로젝트 타입 정의 (API 응답 구조에 맞춤)
interface Project {
	id: number;
	name: string;
	client: string;
	start_date: string;
	end_date: string;
	status: StatusType;
	tech_stack: string[];
}

// 날짜 포맷팅 유틸리티
const formatDate = (dateString: string): string => {
	const date = new Date(dateString);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}.${month}.${day}`;
};

export default function ProjectListPage(): React.ReactNode {
	// 프로젝트 목록 API 호출
	const { data: projects, isLoading, error } = useApi<{ data: Project[] }>('/api/projects');

	// 상태 탭 선택 상태
	const [activeTab, setActiveTab] = useState(0);

	// 검색어 상태
	const [searchQuery, setSearchQuery] = useState('');

	// 탭 정의 (레이블만 고정, count 는 동적 계산)
	const tabs = [{ label: '전체' }, { label: '진행 중' }, { label: '완료' }, { label: '예정' }];

	// 탭별 카운트 계산 (API 데이터 기반)
	const getTabCount = (tabIndex: number): number => {
		if (!projects?.data) return 0;

		switch (tabIndex) {
			case 0: // 전체
				return projects.data.length;
			case 1: // 진행 중 (active)
				return projects.data.filter((p) => p.status === 'active').length;
			case 2: // 완료 (complete)
				return projects.data.filter((p) => p.status === 'complete').length;
			case 3: // 예정 (planned)
				return projects.data.filter((p) => p.status === 'planned').length;
			default:
				return 0;
		}
	};

	// 프로젝트 상세보기 버튼 클릭
	const handleDetailProject = (id: any) => {
		$router.push(`/project/${id}`);
	};

	// 탭 클릭 핸들러
	const handleTabClick = (index: number) => {
		setActiveTab(index);
	};

	// 검색어 변경 핸들러
	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		setSearchQuery(value);
	};

	// 필터링 로직: 상태 탭 + 검색어
	const filteredProjects = projects?.data?.filter((proj: Project) => {
		// 상태 필터링
		const statusMatch =
			activeTab === 0 || // 전체
			(activeTab === 1 && proj.status === 'active') || // 진행 중
			(activeTab === 2 && proj.status === 'complete') || // 완료
			(activeTab === 3 && proj.status === 'planned'); // 예정

		// 검색어 필터링
		const searchMatch =
			searchQuery === '' ||
			proj.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			proj.client.toLowerCase().includes(searchQuery.toLowerCase());

		return statusMatch && searchMatch;
	});

	// 로딩 상태
	if (isLoading) {
		return (
			<div className="p-5 space-y-4">
				<PageHeader
					title="프로젝트 목록"
					breadcrumb={[{ label: '프로젝트관리', path: '/projects' }, { label: '목록' }]}
				/>
				<div className="bg-card rounded-xl border p-5">
					<div className="flex justify-between items-center mb-4">
						<Skeleton className="h-6 w-48" />
						<Skeleton className="h-9 w-32" />
					</div>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-16">번호</TableHead>
								<TableHead>프로젝트명</TableHead>
								<TableHead>담당자</TableHead>
								<TableHead>상태</TableHead>
								<TableHead>시작일</TableHead>
								<TableHead>종료일</TableHead>
								<TableHead className="w-32">액션</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{Array.from({ length: 5 }).map((_, i) => (
								<TableRow key={i}>
									<TableCell>
										<Skeleton className="h-4 w-8" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-4 w-48" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-4 w-24" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-4 w-16" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-4 w-24" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-4 w-24" />
									</TableCell>
									<TableCell>
										<Skeleton className="h-8 w-20" />
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			</div>
		);
	}

	// 에러 상태
	if (error) {
		return (
			<div className="p-5">
				<PageHeader
					title="프로젝트 목록"
					breadcrumb={[{ label: '프로젝트관리', path: '/projects' }, { label: '목록' }]}
				/>
				<div className="bg-card rounded-xl border p-5">
					<div className="text-center text-red-500 py-8">
						<p>데이터를 불러오지 못했습니다.</p>
						<p className="text-sm text-muted-foreground mt-2">{error.message}</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="p-5">
			<PageHeader
				title="프로젝트 관리"
				actions={
					<Button size="lg">
						<Plus className="w-4 h-4 mr-1.5" />
						프로젝트 등록
					</Button>
				}
			/>

			{/* 상태 탭 */}
			<div className="flex gap-1 mb-4 border-b">
				{tabs.map((tab, idx) => (
					<button
						key={tab.label}
						onClick={() => handleTabClick(idx)}
						className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
							idx === activeTab
								? 'border-brand-600 text-brand-600'
								: 'border-transparent text-muted-foreground hover:text-foreground'
						}`}
					>
						{tab.label}
						<span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
							{getTabCount(idx)}
						</span>
					</button>
				))}
			</div>

			{/* 검색/필터 */}
			<div className="flex flex-wrap gap-2 mb-4">
				<div className="relative flex-1 min-w-48">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
					<Input
						className="h-9 pl-9 bg-muted/60 border-slate-300 dark:border-slate-600 shadow-sm focus-visible:border-brand-500 focus-visible:ring-brand-500/20"
						placeholder="프로젝트명·고객사 검색..."
						value={searchQuery}
						onChange={handleSearchChange}
					/>
				</div>
				<Select defaultValue="all">
					<SelectTrigger
						size="lg"
						className="bg-muted/60 border-slate-300 dark:border-slate-600 shadow-sm"
					>
						<SelectValue placeholder="기술스택" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">기술스택 전체</SelectItem>
						<SelectItem value="java">Java</SelectItem>
						<SelectItem value="react">React</SelectItem>
						<SelectItem value="python">Python</SelectItem>
						<SelectItem value="sap">SAP</SelectItem>
					</SelectContent>
				</Select>
				<Select defaultValue="all">
					<SelectTrigger
						size="lg"
						className="bg-muted/60 border-slate-300 dark:border-slate-600 shadow-sm"
					>
						<SelectValue placeholder="PM" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">PM 전체</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{/* 카드형 목록 */}
			<div className="grid grid-cols-1 gap-3">
				{filteredProjects?.map((proj) => {
					const period = `${formatDate(proj.start_date)} ~ ${formatDate(proj.end_date)}`;
					const tech = proj.tech_stack;
					return (
						<div
							key={proj.id}
							className="bg-card rounded-xl border p-4 hover:border-brand-200 dark:hover:border-brand-700 hover:shadow-sm transition-all"
						>
							<div className="flex items-start justify-between gap-3">
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2 mb-1">
										<h3 className="font-semibold text-foreground truncate">{proj.name}</h3>
										<StatusBadge status={proj.status} />
									</div>
									<p className="text-sm text-muted-foreground mb-2">{proj.client}</p>
									<div className="flex flex-wrap gap-4 text-sm">
										<span className="flex items-center gap-1 text-muted-foreground">
											<Calendar className="w-3.5 h-3.5" />
											{period}
										</span>
										<span className="flex items-center gap-1 text-muted-foreground">
											<Users className="w-3.5 h-3.5" />
											투입 {tech.length}명
										</span>
									</div>
									<div className="flex flex-wrap gap-1.5 mt-2">
										{tech.map((t) => (
											<span
												key={t}
												className="px-2 py-0.5 text-xs rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
											>
												{t}
											</span>
										))}
									</div>
								</div>
								<Button
									variant="outline"
									size="sm"
									className="shrink-0"
									onClick={() => handleDetailProject(proj.id)}
								>
									상세
								</Button>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
