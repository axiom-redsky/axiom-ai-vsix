import React, { useEffect, useState } from 'react';
import { vscode } from '../vscodeApi';
import type { HostToWebviewMessage, ProjectConfig } from '../../types/messages';

const EMPTY_CONFIG: ProjectConfig = {
  projectName: '',
  designGuideUrl: '',
  publisherConventions: '',
  layoutPatterns: { listPage: '', detailPage: '', formPage: '' },
  notes: '',
};

export function ProjectConfigApp(): React.ReactElement {
  const [config, setConfig] = useState<ProjectConfig>(EMPTY_CONFIG);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    vscode.postMessage({ type: 'loadProjectConfig' });

    const handler = (event: MessageEvent<HostToWebviewMessage>) => {
      const msg = event.data;
      if (msg.type === 'projectConfigLoaded') {
        setConfig(msg.config ?? EMPTY_CONFIG);
        setLoading(false);
      } else if (msg.type === 'projectConfigSaved') {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const update = (field: keyof ProjectConfig, value: string) => {
    setSaved(false);
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const updateLayout = (key: keyof ProjectConfig['layoutPatterns'], value: string) => {
    setSaved(false);
    setConfig((prev) => ({
      ...prev,
      layoutPatterns: { ...prev.layoutPatterns, [key]: value },
    }));
  };

  const handleSave = () => {
    vscode.postMessage({ type: 'saveProjectConfig', config });
  };

  if (loading) {
    return <div className="loading">불러오는 중…</div>;
  }

  return (
    <div className="project-config">
      <div className="section-header">
        <span className="section-title">프로젝트 설정</span>
        <span className="section-hint">SI 프로젝트 투입 시 작성 · .axiom/knowledge/ 에 저장됩니다</span>
      </div>

      {/* 기본 정보 */}
      <section className="config-section">
        <h3 className="config-section-title">기본 정보</h3>

        <label className="field-label" htmlFor="projectName">프로젝트명</label>
        <input
          id="projectName"
          className="field-input"
          type="text"
          value={config.projectName}
          onChange={(e) => update('projectName', e.target.value)}
          placeholder="예: ○○은행 차세대 시스템"
        />

        <label className="field-label" htmlFor="designGuideUrl">디자인 가이드 URL</label>
        <input
          id="designGuideUrl"
          className="field-input"
          type="text"
          value={config.designGuideUrl}
          onChange={(e) => update('designGuideUrl', e.target.value)}
          placeholder="예: https://www.figma.com/... 또는 사내 위키 URL"
        />
      </section>

      {/* 퍼블리셔 마크업 컨벤션 */}
      <section className="config-section">
        <h3 className="config-section-title">퍼블리셔 마크업 컨벤션</h3>
        <p className="field-hint">
          퍼블리셔가 납품하는 HTML/CSS의 클래스 네이밍 규칙이나 마크업 구조를 작성하세요.
        </p>
        <textarea
          className="field-textarea"
          rows={5}
          value={config.publisherConventions}
          onChange={(e) => update('publisherConventions', e.target.value)}
          placeholder={'예:\n- 버튼: .btn .btn-primary .btn-sm\n- 카드 래퍼: .card-wrap > .card-header + .card-body\n- 폼 라벨: <label class="form-label"> 항상 input 위에 위치'}
        />
      </section>

      {/* 레이아웃 패턴 */}
      <section className="config-section">
        <h3 className="config-section-title">레이아웃 패턴</h3>
        <p className="field-hint">
          AI가 페이지 구조를 추천할 때 참조합니다. 화면 유형별로 채택한 레이아웃을 간략히 설명하세요.
        </p>

        <label className="field-label" htmlFor="listPage">목록 화면</label>
        <textarea
          id="listPage"
          className="field-textarea"
          rows={3}
          value={config.layoutPatterns.listPage}
          onChange={(e) => updateLayout('listPage', e.target.value)}
          placeholder="예: 상단 검색 필터 카드 + 하단 테이블 카드 2단 구조. 페이지 패딩 p-6."
        />

        <label className="field-label" htmlFor="detailPage">상세 화면</label>
        <textarea
          id="detailPage"
          className="field-textarea"
          rows={3}
          value={config.layoutPatterns.detailPage}
          onChange={(e) => updateLayout('detailPage', e.target.value)}
          placeholder="예: 헤더(뒤로가기 + 제목) + 탭(기본정보/이력) 구조. max-w-4xl 제한."
        />

        <label className="field-label" htmlFor="formPage">폼 화면</label>
        <textarea
          id="formPage"
          className="field-textarea"
          rows={3}
          value={config.layoutPatterns.formPage}
          onChange={(e) => updateLayout('formPage', e.target.value)}
          placeholder="예: 단일 카드 안에 react-hook-form. 하단 고정 저장/취소 버튼. max-w-2xl."
        />
      </section>

      {/* 특이사항 */}
      <section className="config-section">
        <h3 className="config-section-title">특이사항</h3>
        <p className="field-hint">
          위 항목에 맞지 않는 프로젝트 특이사항을 자유롭게 작성하세요.
        </p>
        <textarea
          className="field-textarea"
          rows={4}
          value={config.notes}
          onChange={(e) => update('notes', e.target.value)}
          placeholder={'예: GNB는 RootLayout 헤더 영역을 프로젝트 전용 컴포넌트로 교체함.\n예: 다크모드 미지원. 라이트 모드 고정.'}
        />
      </section>

      {/* 저장 */}
      <div className="save-row">
        <button className="save-btn" onClick={handleSave}>
          저장
        </button>
        {saved && <span className="save-ok">✓ 저장되었습니다</span>}
      </div>
    </div>
  );
}
