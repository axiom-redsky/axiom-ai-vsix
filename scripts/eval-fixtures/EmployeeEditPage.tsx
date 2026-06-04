import type React from 'react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@axiom/components/ui';
import PageHeader from '@/shared/components/ui/PageHeader';
import { Plus, X } from 'lucide-react';
import { useApi } from '@axiom/hooks';

const depts = ['개발팀', '디자인', '마케팅', 'HR', '영업', '기획'];
const grades = ['사원', '대리', '과장', '차장', '부장', '이사'];
const statuses = [
	{ value: 'active', label: '재직' },
	{ value: 'on_leave', label: '휴직' },
	{ value: 'resigned', label: '퇴사' },
];
const skillSuggestions = ['Java', 'Spring Boot', 'React', 'Vue', 'Python', 'Oracle', 'MySQL', 'AWS', 'Docker', 'Git'];

// 수정 요청 body 타입
type TUpdateEmployee = {
	name: string;
	email: string;
	phone: string;
	department: string;
	position: string;
	hire_date: string;
	employment_status: string;
	resign_date?: string | null;
	skills?: string[];
};

// 조회 응답 타입
type TEmployeeDetail = TUpdateEmployee & {
	id: number;
	resign_date: string | null;
	skills: string[];
};

type TEmployeeResponse = {
	success: boolean;
	data: TEmployeeDetail;
};

export default function EmployeeEditPage(): React.ReactNode {
	const { id } = useParams<{ id: string }>();

	// 입력 필드 상태 관리
	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [phone, setPhone] = useState('');
	const [hireDate, setHireDate] = useState('');
	const [department, setDepartment] = useState('');
	const [position, setPosition] = useState('');
	const [employmentStatus, setEmploymentStatus] = useState('active');
	const [resignDate, setResignDate] = useState('');
	const [skills, setSkills] = useState<string[]>([]);
	const [newSkillInput, setNewSkillInput] = useState('');

	// 기존 데이터 조회 (GET)
	const {
		data: response,
		isPending: isLoading,
		error: loadError,
	} = useApi<TEmployeeResponse>(`/api/employees/${id}`, {
		params: { id },
	});

	// 조회 결과로 폼 초기화
	useEffect(() => {
		const emp = response?.data;
		if (!emp) return;
		setName(emp.name ?? '');
		setEmail(emp.email ?? '');
		setPhone(emp.phone ?? '');
		setHireDate(emp.hire_date ?? '');
		setDepartment(emp.department ?? '');
		setPosition(emp.position ?? '');
		setEmploymentStatus(emp.employment_status ?? 'active');
		setResignDate(emp.resign_date ?? '');
		setSkills(emp.skills ?? []);
	}, [response]);

	// PUT API 호출
	const {
		mutate,
		isPending: isSubmitting,
		error: updateError,
		invalidateQueries,
	} = useApi<TUpdateEmployee, TUpdateEmployee>(`/api/employees/${id}`, {
		method: 'PUT',
		type: 'mutation',
	});

	// 스킬 추가 핸들러
	const handleAddSkill = (): void => {
		const trimmed = newSkillInput.trim();
		if (trimmed && !skills.includes(trimmed)) {
			setSkills([...skills, trimmed]);
			setNewSkillInput('');
		}
	};

	// 스킬 제거 핸들러
	const handleRemoveSkill = (skill: string): void => {
		setSkills(skills.filter((s) => s !== skill));
	};

	// 추천 스킬 추가
	const handleAddSuggestedSkill = (skill: string): void => {
		if (!skills.includes(skill)) {
			setSkills([...skills, skill]);
		}
	};

	// 퇴사 상태 여부
	const isResigned = employmentStatus === 'resigned';

	// 폼 제출 핸들러
	const handleSubmit = async (e: React.FormEvent): Promise<void> => {
		e.preventDefault();

		// 필수 필드 검증
		if (!name || !email || !phone || !hireDate || !department || !position) {
			alert('모든 필수 항목을 입력해주세요.');
			return;
		}

		// 퇴사 상태일 때 퇴사일 필수
		if (isResigned && !resignDate) {
			alert('퇴사 상태인 경우 퇴사일을 입력해주세요.');
			return;
		}

		// API 호출
		mutate(
			{
				name,
				email,
				phone,
				department,
				position,
				hire_date: hireDate,
				employment_status: employmentStatus,
				// 퇴사 상태가 아니면 퇴사일은 null로 정리
				resign_date: isResigned ? resignDate : null,
				skills,
			},
			{
				onSuccess: async () => {
					// 목록 및 상세 캐시 무효화
					await invalidateQueries('/api/employees');
					await invalidateQueries(`/api/employees/${id}`);
					// 성공 후 상세 페이지로 이동
					$router.push(`/employee/employee-detail/${id}`);
				},
				onError: (error) => {
					console.error('직원 수정 실패:', error.message);
				},
			},
		);
	};

	// 로딩 중
	if (isLoading) {
		return (
			<div className="p-5">
				<PageHeader
					title="직원 수정"
					breadcrumb={[{ label: '직원관리', path: '/employees' }, { label: '로딩 중...' }]}
				/>
				<p className="text-sm text-gray-500">데이터를 불러오는 중…</p>
			</div>
		);
	}

	// 조회 에러
	if (loadError) {
		return (
			<div className="p-5">
				<PageHeader
					title="직원 수정"
					breadcrumb={[{ label: '직원관리', path: '/employees' }, { label: '에러 발생' }]}
				/>
				<p className="text-sm text-red-600">에러: {loadError.message}</p>
			</div>
		);
	}

	return (
		<div className="p-5">
			<PageHeader
				title="직원 수정"
				breadcrumb={[{ label: '직원관리', path: '/employees' }, { label: name || '직원 수정' }]}
			/>

			<div className="max-w-2xl w-full">
				{/* 기본정보 섹션 */}
				<div className="bg-card rounded-xl border p-5 mb-4">
					<h2 className="font-semibold text-foreground mb-4 text-sm flex items-center gap-2">
						<span className="w-5 h-5 rounded-full bg-brand-600 text-white text-xs flex items-center justify-center">
							1
						</span>
						기본 정보
					</h2>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<label className="block text-sm font-medium text-foreground mb-1">이름 *</label>
							<Input
								value={name}
								onChange={(e) => setName(e.target.value)}
								className="h-9 bg-muted/60 border-slate-300 dark:border-slate-600 shadow-sm focus-visible:border-brand-500 focus-visible:ring-brand-500/20"
								placeholder="홍길동"
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-foreground mb-1">이메일 *</label>
							<Input
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								className="h-9 bg-muted/60 border-slate-300 dark:border-slate-600 shadow-sm focus-visible:border-brand-500 focus-visible:ring-brand-500/20"
								placeholder="name@company.com"
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-foreground mb-1">연락처 *</label>
							<Input
								value={phone}
								onChange={(e) => setPhone(e.target.value)}
								className="h-9 bg-muted/60 border-slate-300 dark:border-slate-600 shadow-sm focus-visible:border-brand-500 focus-visible:ring-brand-500/20"
								placeholder="010-0000-0000"
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-foreground mb-1">입사일 *</label>
							<Input
								type="date"
								value={hireDate}
								onChange={(e) => setHireDate(e.target.value)}
								className="h-9 bg-muted/60 border-slate-300 dark:border-slate-600 shadow-sm focus-visible:border-brand-500 focus-visible:ring-brand-500/20"
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-foreground mb-1">부서 *</label>
							<Select
								value={department}
								onValueChange={setDepartment}
							>
								<SelectTrigger
									size="lg"
									className="w-full bg-muted/60 border-slate-300 dark:border-slate-600 shadow-sm"
								>
									<SelectValue placeholder="부서 선택" />
								</SelectTrigger>
								<SelectContent>
									{depts.map((d) => (
										<SelectItem
											key={d}
											value={d}
										>
											{d}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div>
							<label className="block text-sm font-medium text-foreground mb-1">직급 *</label>
							<Select
								value={position}
								onValueChange={setPosition}
							>
								<SelectTrigger
									size="lg"
									className="w-full bg-muted/60 border-slate-300 dark:border-slate-600 shadow-sm"
								>
									<SelectValue placeholder="직급 선택" />
								</SelectTrigger>
								<SelectContent>
									{grades.map((g) => (
										<SelectItem
											key={g}
											value={g}
										>
											{g}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
				</div>

				{/* 재직 상태 섹션 */}
				<div className="bg-card rounded-xl border p-5 mb-4">
					<h2 className="font-semibold text-foreground mb-4 text-sm flex items-center gap-2">
						<span className="w-5 h-5 rounded-full bg-brand-600 text-white text-xs flex items-center justify-center">
							2
						</span>
						재직 상태
					</h2>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<label className="block text-sm font-medium text-foreground mb-1">재직 상태 *</label>
							<Select
								value={employmentStatus}
								onValueChange={setEmploymentStatus}
							>
								<SelectTrigger
									size="lg"
									className="w-full bg-muted/60 border-slate-300 dark:border-slate-600 shadow-sm"
								>
									<SelectValue placeholder="상태 선택" />
								</SelectTrigger>
								<SelectContent>
									{statuses.map((s) => (
										<SelectItem
											key={s.value}
											value={s.value}
										>
											{s.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						{/* 퇴사 상태일 때만 퇴사일 노출 */}
						{isResigned && (
							<div>
								<label className="block text-sm font-medium text-foreground mb-1">퇴사일 *</label>
								<Input
									type="date"
									value={resignDate}
									onChange={(e) => setResignDate(e.target.value)}
									min={hireDate || undefined}
									className="h-9 bg-muted/60 border-slate-300 dark:border-slate-600 shadow-sm focus-visible:border-brand-500 focus-visible:ring-brand-500/20"
								/>
							</div>
						)}
					</div>
				</div>

				{/* 기술스택 섹션 */}
				<div className="bg-card rounded-xl border p-5 mb-4">
					<h2 className="font-semibold text-foreground mb-4 text-sm flex items-center gap-2">
						<span className="w-5 h-5 rounded-full bg-brand-600 text-white text-xs flex items-center justify-center">
							3
						</span>
						기술스택
					</h2>

					{/* 선택된 스킬 태그 */}
					<div className="flex flex-wrap gap-2 mb-3 min-h-10 p-2 border border-dashed rounded-lg bg-muted/20">
						{skills.map((skill) => (
							<span
								key={skill}
								className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 text-sm font-medium"
							>
								{skill}
								<Button
									variant="ghost"
									size="icon-xs"
									className="rounded-full hover:bg-brand-200/50 dark:hover:bg-brand-800/50 hover:text-brand-900 dark:hover:text-brand-100"
									onClick={() => handleRemoveSkill(skill)}
								>
									<X />
								</Button>
							</span>
						))}
					</div>

					{/* 스킬 추가 입력 */}
					<div className="flex gap-2 mb-3">
						<Input
							value={newSkillInput}
							onChange={(e) => setNewSkillInput(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									handleAddSkill();
								}
							}}
							className="flex-1 h-9 bg-muted/60 border-slate-300 dark:border-slate-600 shadow-sm focus-visible:border-brand-500 focus-visible:ring-brand-500/20"
							placeholder="기술스택 직접 입력..."
						/>
						<Button
							size="sm"
							variant="outline"
							onClick={handleAddSkill}
						>
							<Plus className="w-4 h-4" />
						</Button>
					</div>

					{/* 추천 스킬 */}
					<div>
						<p className="text-xs text-muted-foreground mb-2">자주 사용되는 기술스택:</p>
						<div className="flex flex-wrap gap-1.5">
							{skillSuggestions.map((skill) => (
								<button
									key={skill}
									className="px-2.5 py-1 text-xs border rounded-full hover:border-brand-400 hover:text-brand-600 dark:hover:border-brand-500 dark:hover:text-brand-400 transition-colors text-muted-foreground border-slate-300 dark:border-slate-600"
									onClick={() => handleAddSuggestedSkill(skill)}
								>
									+ {skill}
								</button>
							))}
						</div>
					</div>
				</div>

				{/* 에러 메시지 */}
				{updateError && (
					<div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
						<p className="text-sm text-red-600 dark:text-red-400">{updateError.message}</p>
					</div>
				)}

				{/* 액션 버튼 */}
				<div className="flex justify-end gap-3">
					<Button
						variant="outline"
						onClick={() => $router.back()}
					>
						취소
					</Button>
					<Button
						onClick={handleSubmit}
						disabled={isSubmitting}
					>
						{isSubmitting ? '저장 중...' : '저장'}
					</Button>
				</div>
			</div>
		</div>
	);
}
