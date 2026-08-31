/**
 * 행동 카드 관리 패널 (Phase 3, 계획서 §5 "편집은 파일, 관리는 패널").
 *
 * 화면 = ① 계층별 카드 목록(상태·검증 ⚠·켜기끄기·파일 열기) ② 새 카드 만들기 ③ 드라이런.
 * 편집 폼은 없다 — 카드 내용은 `.card.md`에서 고치고 저장하면 이 목록이 즉시 갱신된다.
 */

import React, { useEffect, useState } from 'react';
import { vscode } from '../vscodeApi';
import type {
  ActionCatalogDryrunResult, ActionCatalogDryrunRow, ActionCatalogEntryView, ActionCatalogIssueView,
  ActionCatalogLayer, ActionCatalogPayload, ActionCatalogStatus, HostToWebviewMessage,
} from '../../types/messages';

const box: React.CSSProperties = {
  border: '1px solid var(--vscode-panel-border, #444)',
  borderRadius: 6,
  padding: 10,
  marginTop: 10,
};
const mono: React.CSSProperties = {
  fontFamily: 'var(--vscode-editor-font-family, monospace)',
  fontSize: 11,
};
const chip: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 6px',
  borderRadius: 10,
  fontSize: 11,
  background: 'rgba(127,127,127,0.18)',
  marginRight: 4,
  marginTop: 2,
};

const LAYER_LABEL: Record<ActionCatalogLayer, string> = {
  builtin: '내장 (Axiom)',
  project: '프로젝트 (.axiom/actions — git 팀 공유)',
  personal: '개인 (이 PC에만)',
};

const STATUS_LABEL: Record<ActionCatalogStatus, { text: string; color: string }> = {
  active: { text: '활성', color: 'rgba(46,160,67,0.9)' },
  disabled: { text: '꺼짐', color: 'rgba(127,127,127,0.9)' },
  invalid: { text: '오류', color: 'var(--vscode-errorForeground, #f48771)' },
  overridden: { text: '덮임', color: 'rgba(204,167,0,0.95)' },
};

function IssueList({ issues }: { issues: ActionCatalogIssueView[] }): React.ReactElement | null {
  if (issues.length === 0) return null;
  return (
    <div style={{ marginTop: 4 }}>
      {issues.map((i, idx) => (
        <div
          key={idx}
          style={{
            fontSize: 11,
            color: i.severity === 'error' ? 'var(--vscode-errorForeground, #f48771)' : 'rgba(204,167,0,0.95)',
          }}
        >
          {i.severity === 'error' ? '⛔' : '⚠'} {i.message}
          {i.field ? <span style={{ opacity: 0.6 }}> ({i.field})</span> : null}
        </div>
      ))}
    </div>
  );
}

function CardRow({ entry }: { entry: ActionCatalogEntryView }): React.ReactElement {
  const status = STATUS_LABEL[entry.status];
  const canToggle = entry.status === 'active' || entry.status === 'disabled';
  return (
    <div
      style={{
        borderTop: '1px solid var(--vscode-panel-border, #444)',
        padding: '8px 0',
        opacity: entry.status === 'active' ? 1 : 0.75,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span>{entry.icon}</span>
        <span style={{ fontWeight: 600 }}>{entry.title}</span>
        <span style={{ ...mono, opacity: 0.6 }}>{entry.cardId}</span>
        <span style={{ ...chip, color: status.color }}>{status.text}</span>
        {entry.actionType ? <span style={chip}>{entry.actionType}</span> : null}
        <span style={{ flex: 1 }} />
        {canToggle && (
          <button
            onClick={() =>
              vscode.postMessage({
                type: 'actionCatalogToggle',
                cardId: entry.cardId,
                enabled: entry.status === 'disabled',
              })
            }
          >
            {entry.status === 'disabled' ? '켜기' : '끄기'}
          </button>
        )}
        <button onClick={() => vscode.postMessage({ type: 'actionCatalogOpenCard', sourcePath: entry.sourcePath })}>
          파일 열기
        </button>
      </div>
      {entry.description && (
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{entry.description.split('\n')[0]}</div>
      )}
      <div style={{ marginTop: 2 }}>
        {entry.triggers.map((t) => (
          <span key={t} style={chip}>{t}</span>
        ))}
        {entry.triggers.length === 0 && <span style={{ fontSize: 11, opacity: 0.5 }}>트리거 없음</span>}
      </div>
      <div style={{ ...mono, opacity: 0.5, marginTop: 2 }}>{entry.displayPath}</div>
      <IssueList issues={entry.issues} />
    </div>
  );
}

function DryrunRows({ rows, title }: { rows: ActionCatalogDryrunRow[]; title: string }): React.ReactElement | null {
  if (rows.length === 0) return null;
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{title}</div>
      {rows.map((r, i) => (
        <div key={r.cardId} style={{ fontSize: 12, marginTop: 4 }}>
          {i + 1}. {r.icon} <b>{r.title}</b>{' '}
          <span style={{ ...mono, opacity: 0.6 }}>
            {r.cardId} · {r.layer} · {r.actionType} · 점수 {r.score}
          </span>
          <div style={{ fontSize: 11, opacity: 0.8 }}>
            근거: {r.matchedTriggers.length ? r.matchedTriggers.join(', ') : '없음(안전망 목록)'}
          </div>
          {r.prefill.length > 0 && (
            <div style={{ fontSize: 11, opacity: 0.8 }}>
              프리필: {r.prefill.map((p) => `${p.name}=${p.value}`).join('  ')}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ActionCardsApp(): React.ReactElement {
  const [payload, setPayload] = useState<ActionCatalogPayload | null>(null);
  const [dryrun, setDryrun] = useState<ActionCatalogDryrunResult | null>(null);
  const [notice, setNotice] = useState<{ message: string; severity: 'info' | 'error' } | null>(null);
  const [query, setQuery] = useState('');
  const [fileOpen, setFileOpen] = useState(true);
  const [scaffold, setScaffold] = useState(true);
  const [gap, setGap] = useState('');

  useEffect(() => {
    const handler = (event: MessageEvent<HostToWebviewMessage>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'actionCatalog':
          setPayload(msg.payload);
          break;
        case 'actionCatalogDryrunResult':
          setDryrun(msg.result);
          break;
        case 'actionCatalogNotice':
          setNotice({ message: msg.message, severity: msg.severity });
          break;
      }
    };
    window.addEventListener('message', handler);
    vscode.postMessage({ type: 'actionCatalogLoad' });
    return () => window.removeEventListener('message', handler);
  }, []);

  // 호스트가 읽은 실제 상황을 드라이런 기본값으로 한 번 맞춘다(그 뒤엔 사용자가 실험할 수 있게 자유).
  const [ctxSynced, setCtxSynced] = useState(false);
  useEffect(() => {
    if (!payload || ctxSynced) return;
    setFileOpen(payload.context.fileOpen);
    setScaffold(payload.context.scaffoldDetected);
    setCtxSynced(true);
  }, [payload, ctxSynced]);

  const run = () => {
    setNotice(null);
    const parsed = Number(gap);
    vscode.postMessage({
      type: 'actionCatalogDryrun',
      query,
      fileOpen,
      scaffoldDetected: scaffold,
      ...(gap.trim() && !Number.isNaN(parsed) ? { gapRatio: parsed } : {}),
    });
  };

  const layers = payload?.layers ?? [];
  const entries = payload?.entries ?? [];

  return (
    <div style={{ padding: 12, fontSize: 13, height: '100vh', overflowY: 'auto' }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>오프라인 행동 카드 관리</div>
      <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 8 }}>
        <b>오프라인 모드에서만</b> 뜨는 추천 카드의 카탈로그입니다(온라인은 자연어 실행 유지).{' '}
        <b>편집은 파일, 관리는 패널</b> — 카드 내용은{' '}
        <code>.card.md</code>를 직접 고치고 저장하면 즉시 반영되고, 여기서는 켜기/끄기·검증·드라이런을 합니다.
        끄기는 <b>카드 파일을 건드리지 않고</b> 설정(<code>axiom-ai.actionCards.disabled</code>)에만 기록됩니다.
      </div>

      {notice && (
        <div
          style={{
            ...box,
            marginTop: 0,
            borderColor: notice.severity === 'error' ? 'var(--vscode-errorForeground, #f48771)' : 'rgba(46,160,67,0.6)',
            fontSize: 12,
          }}
        >
          {notice.message}
        </div>
      )}

      {/* ── 계층 ── */}
      <div style={box}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <div style={{ fontWeight: 700 }}>카탈로그 3계층</div>
          <span style={{ flex: 1 }} />
          <button onClick={() => vscode.postMessage({ type: 'actionCatalogLoad' })}>새로고침</button>
        </div>
        {layers.map((l) => (
          <div key={l.layer} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 4 }}>
            <span style={{ minWidth: 250 }}>{LAYER_LABEL[l.layer]}</span>
            <span style={{ ...mono, opacity: 0.6, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {l.dir}
              {!l.exists && <span style={{ opacity: 0.7 }}> (아직 없음)</span>}
            </span>
            <span style={chip}>{l.count}장</span>
            {l.editable && (
              <button onClick={() => vscode.postMessage({ type: 'actionCatalogNewCard', layer: l.layer })}>
                + 새 카드
              </button>
            )}
          </div>
        ))}
        {payload && payload.issues.length > 0 && <IssueList issues={payload.issues} />}
      </div>

      {/* ── 목록 ── */}
      <div style={box}>
        <div style={{ fontWeight: 700, marginBottom: 2 }}>카드 목록 ({entries.length}장)</div>
        <div style={{ fontSize: 11, opacity: 0.65 }}>
          활성 = 매칭에 참여 · 꺼짐 = 사용자가 끔 · 오류 = 검증/충돌로 비활성(고치면 살아남) ·
          덮임 = 같은 id의 상위 계층 카드가 대체
        </div>
        {entries.length === 0 && (
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 8 }}>카드가 없습니다.</div>
        )}
        {entries.map((e) => (
          <CardRow key={e.sourcePath} entry={e} />
        ))}
      </div>

      {/* ── 드라이런 ── */}
      <div style={box}>
        <div style={{ fontWeight: 700, marginBottom: 2 }}>드라이런 — 이 질문에 어떤 카드가 뜨나</div>
        <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 6 }}>
          운영과 같은 매처를 호출합니다. 트리거가 겹쳐 엉뚱한 카드가 위로 오는 문제를 등록 시점에 확인하세요.
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input
            style={{ flex: 1, minWidth: 0 }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
            placeholder="예: 직원 목록 페이지 만들어줘"
          />
          <button onClick={run} disabled={!query.trim()} style={{ fontWeight: 600 }}>실행</button>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12 }}>
          <label>
            <input type="checkbox" checked={fileOpen} onChange={(e) => setFileOpen(e.target.checked)} /> 파일 열림
          </label>
          <label>
            <input type="checkbox" checked={scaffold} onChange={(e) => setScaffold(e.target.checked)} /> 스캐폴드 감지
          </label>
          <label>
            확신도 임계{' '}
            <input
              style={{ width: 60 }}
              value={gap}
              onChange={(e) => setGap(e.target.value)}
              placeholder="0.5"
            />
          </label>
          {payload && (
            <span style={{ opacity: 0.6 }}>
              도메인 {payload.context.domainCount} · 엔드포인트 {payload.context.endpointCount} · 컴포넌트{' '}
              {payload.context.componentCount}
            </span>
          )}
        </div>

        {dryrun && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12 }}>
              모드: <b>{dryrun.mode}</b>{' '}
              <span style={{ opacity: 0.7 }}>
                {dryrun.mode === 'plan' ? '(계획 카드 1장)' : dryrun.mode === 'list' ? '(컴팩트 리스트)' : '(매칭 없음 — 안전망으로)'}
              </span>
              {dryrun.gap !== null && <span style={{ opacity: 0.7 }}> · top1−top2 격차 {dryrun.gap}</span>}
            </div>
            <DryrunRows rows={dryrun.rows} title="뜨는 카드" />
            <DryrunRows rows={dryrun.fallback} title="매칭 0 → 안전망 목록(전제조건 통과 카드)" />
            {dryrun.excluded.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 11, opacity: 0.75 }}>
                <div style={{ fontWeight: 600 }}>상황 필터로 빠진 카드</div>
                {dryrun.excluded.map((x) => (
                  <div key={x.cardId}>· {x.title} — {x.reason}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
