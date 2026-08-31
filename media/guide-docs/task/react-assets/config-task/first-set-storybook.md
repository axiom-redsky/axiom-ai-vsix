---
sidebar_position: 1
displayed_sidebar: "taskDocSidebar"
title: "Storybook 초기 세팅"
---

# Storybook 초기 세팅

* **Storybook** 세팅 연관 디렉토리 구조는 다음과 같습니다.
```sh
react-app-scaffold/
├── src/
│   ├── __stories__/              ← NEW (Storybook 전용)
│   │   ├── _docs/
│   │   │   └── introduction.mdx  ← 소개 문서
│   │   ├── shared/
│   │   │   └── ui/
│   │   │       ├── Button.stories.tsx
│   │   │       └── Badge.stories.tsx
│   │   └── core/
│   │       └── hooks/
│   │           └── useApi.stories.tsx
│   ├── shared/
│   ├── core/
│   └── ...
├── .storybook/                   ← 자동 생성 후 수정
│   ├── main.ts
│   └── preview.ts
├── tsconfig.app.json             ← exclude 추가
└── package.json                  ← storybook 스크립트 추가
```




## 단계별 작업
---
### Step 1: Storybook 설치

```bash
npm create storybook@latest
```

- 자동으로 `.storybook/main.ts`, `.storybook/preview.ts`, 예시 스토리 파일 생성
- `package.json`에 `storybook`, `build-storybook` 스크립트 추가됨
- 자동 생성된 예시 스토리 파일(`src/stories/` 폴더)은 **삭제**

### Step 2: `.storybook/main.ts` 수정

stories 경로를 `src/__stories__/`로 변경:

```ts
import type { StorybookConfig } from '@storybook/react-vite';
import type { Plugin } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve, relative } from 'path';
import { normalizePath } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = normalizePath(resolve(__dirname, '..'));

/**
 * Windows 경로 버그 수정:
 * Storybook builder-vite 내부의 pathe 라이브러리에서
 * cwd()가 소문자 드라이브 'c:'를 반환하고
 * normalizeWindowsPath가 대문자 'C:'를 반환해서
 * importers 키가 './C:/...' 형태(절대 경로)가 되는 버그를 수정합니다.
 * 키를 './src/__stories__/...' 형태(프로젝트 루트 기준 상대 경로)로 교체합니다.
 */
function fixWindowsStorybookPaths(): Plugin {
	return {
		name: 'fix-windows-storybook-paths',
		enforce: 'post',
		transform(code, id) {
			if (!id.includes('storybook-stories')) return;
			const rootWithSlash = root + '/';
			return code.replace(/"(\.\/[A-Za-z]:[^"]+)"/g, (match, absKey: string) => {
				const absPath = absKey.startsWith('./') ? absKey.slice(2) : absKey;
				const normalized = normalizePath(absPath);
				if (!normalized.includes(rootWithSlash)) return match;
				const relPath = './' + normalized.slice(rootWithSlash.length);
				return `"${relPath}"`;
			});
		},
	};
}

const config: StorybookConfig = {
	stories: [
		'../src/__stories__/**/*.mdx',
		'../src/__stories__/**/*.stories.@(ts|tsx)',
	],
	addons: [
		'@storybook/addon-docs',
		'@storybook/addon-a11y',
		'@storybook/addon-onboarding',
		'@chromatic-com/storybook',
	],
	framework: '@storybook/react-vite',
	async viteFinal(config) {
		return {
			...config,
			plugins: [...(config.plugins ?? []), fixWindowsStorybookPaths()],
			resolve: {
				...config.resolve,
				alias: {
					...config.resolve?.alias,
					'@': normalizePath(resolve(root, 'src')),
					'@axiom/components/ui': normalizePath(resolve(root, 'src/shared/ui')),
					'@axiom/hooks': normalizePath(resolve(root, 'src/core/hooks/index.ts')),
					'@app-types': normalizePath(resolve(root, 'src/types')),
				},
			},
		};
	},
};

export default config;
```

> path alias(`@/`, `@axiom/*`)는 `@storybook/react-vite`가 `vite.config.ts`를 자동으로 읽어 적용되므로 별도 `viteFinal` 설정 불필요.

### Step 3: `.storybook/preview.ts` 수정

Tailwind CSS 연결 + QueryClientProvider 글로벌 Decorator 추가:

```ts
import type { Preview, ReactRenderer } from '@storybook/react-vite';
import type { DecoratorFunction } from 'storybook/internal/types';
import { createElement } from 'react';
import { QueryProvider } from '../src/core/providers/query-client/QueryProvider';
import '../src/assets/styles/app.css';

const withQueryProvider: DecoratorFunction<ReactRenderer> = (Story) =>
	createElement(QueryProvider, null, createElement(Story));

const preview: Preview = {
	decorators: [withQueryProvider],
	parameters: {
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i,
			},
		},
		a11y: {
			test: 'todo',
		},
	},
};

export default preview;
```

> 기존 `QueryProvider`를 재사용하므로 별도 QueryClient 설정 없이 프로젝트 설정과 동일한 환경으로 스토리 실행.

### Step 4: `tsconfig.app.json` 수정

프로덕션 빌드에서 `__stories__` 제외:

```json
{
  "include": ["src"],
  "exclude": ["src/__stories__"]
}
```

### Step 5: 초기 스토리 파일 작성 (예시)

**UI 컴포넌트** (`src/__stories__/shared/ui/Button.stories.tsx`):
```ts
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '@axiom/components/ui';

const meta = {
	title: 'Shared/UI/Button',
	component: Button,
	tags: ['autodocs'],
	argTypes: {
		variant: {
			control: 'select',
			options: ['default', 'outline', 'secondary', 'ghost', 'destructive', 'link'],
			description: '버튼 스타일 변형',
		},
		size: {
			control: 'select',
			options: ['default', 'xs', 'sm', 'lg', 'icon', 'icon-xs', 'icon-sm', 'icon-lg'],
			description: '버튼 크기',
		},
		disabled: {
			control: 'boolean',
			description: '비활성화 여부',
		},
		children: {
			control: 'text',
			description: '버튼 내용',
		},
	},
	args: {
		children: '버튼',
		variant: 'default',
		size: 'default',
		disabled: false,
	},
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Outline: Story = {
	args: { variant: 'outline' },
};

export const Secondary: Story = {
	args: { variant: 'secondary' },
};

export const Ghost: Story = {
	args: { variant: 'ghost' },
};

export const Destructive: Story = {
	args: { variant: 'destructive' },
};

export const Link: Story = {
	args: { variant: 'link' },
};

export const Disabled: Story = {
	args: { disabled: true },
};

export const AllVariants: Story = {
	name: '전체 변형 모음',
	render: () => (
		<div className="flex flex-wrap gap-3 p-4">
			<Button variant="default">Default</Button>
			<Button variant="outline">Outline</Button>
			<Button variant="secondary">Secondary</Button>
			<Button variant="ghost">Ghost</Button>
			<Button variant="destructive">Destructive</Button>
			<Button variant="link">Link</Button>
		</div>
	),
};

export const AllSizes: Story = {
	name: '전체 크기 모음',
	render: () => (
		<div className="flex flex-wrap items-center gap-3 p-4">
			<Button size="xs">XS</Button>
			<Button size="sm">SM</Button>
			<Button size="default">Default</Button>
			<Button size="lg">LG</Button>
		</div>
	),
};
```

**Hooks** (`src/__stories__/core/hooks/useApi.stories.tsx`):

`useApi`는 실제 HTTP 호출을 하므로 **래퍼 컴포넌트** 방식으로 작성:
```ts
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useApi } from '@axiom/hooks';

/**
 * useApi — GET 조회 (type: 'query') 데모
 *
 * 실제 API 호출을 시뮬레이션합니다.
 * 실서버 없이 테스트하려면 MSW(Mock Service Worker) 연동을 권장합니다.
 */
function UseApiQueryDemo() {
	const { data, isLoading, isError, error } = useApi<{ userId: number; id: number; title: string }>(
		'https://jsonplaceholder.typicode.com/todos/1',
	);

	if (isLoading) {
		return (
			<div className="flex items-center gap-2 p-4 text-muted-foreground">
				<span className="animate-spin">⏳</span>
				<span>데이터 로딩 중...</span>
			</div>
		);
	}

	if (isError) {
		return (
			<div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive">
				에러: {error?.message}
			</div>
		);
	}

	return (
		<div className="rounded-lg border border-border bg-card p-4">
			<p className="mb-2 text-sm font-semibold text-muted-foreground">응답 데이터</p>
			<pre className="text-sm text-foreground">{JSON.stringify(data, null, 2)}</pre>
		</div>
	);
}

/**
 * useApi — Mutation (type: 'mutation') 데모
 */
function UseApiMutationDemo() {
	const { mutate, isPending, data, isSuccess } = useApi<
		{ id: number; title: string; body: string; userId: number },
		{ title: string; body: string; userId: number }
	>('https://jsonplaceholder.typicode.com/posts', {
		type: 'mutation',
		method: 'POST',
	});

	return (
		<div className="flex flex-col gap-4 p-4">
			<button
				className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
				onClick={() => mutate({ title: '테스트 제목', body: '테스트 내용', userId: 1 })}
				disabled={isPending}
			>
				{isPending ? '전송 중...' : 'POST 요청 실행'}
			</button>

			{isSuccess && (
				<div className="rounded-lg border border-border bg-card p-4">
					<p className="mb-2 text-sm font-semibold text-muted-foreground">생성된 데이터</p>
					<pre className="text-sm text-foreground">{JSON.stringify(data, null, 2)}</pre>
				</div>
			)}
		</div>
	);
}

const meta = {
	title: 'Core/Hooks/useApi',
	tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Query: Story = {
	name: 'useApi — GET 조회 (query)',
	render: () => <UseApiQueryDemo />,
};

export const Mutation: Story = {
	name: 'useApi — POST 생성 (mutation)',
	render: () => <UseApiMutationDemo />,
};
```

## 추가 권장 addon

```bash
npm install --save-dev @storybook/addon-a11y
```

- `addon-essentials`: Controls, Actions, Docs, Viewport, Backgrounds (기본 포함)
- `addon-a11y`: 접근성 자동 검사
- `addon-interactions`: play 함수 기반 인터랙션 테스트

## 실행

```bash
npm run storybook       # 개발 서버 (http://localhost:6006)
npm run build-storybook # 정적 빌드 (storybook-static/)
```
