export type DiffLineType = 'ctx' | 'add' | 'del' | 'sep';

export interface DiffLine {
  type: DiffLineType;
  oldNo?: number;
  newNo?: number;
  content: string;
}

// 변경 구간(공통 prefix/suffix 제외) 라인 수 상한. 전체 파일이 아니라 "바뀐 가운데 토막"에만 적용된다.
// (종전 전체 400줄 상한은 417줄짜리 실제 파일에서 diff를 통째로 빈 배열로 만들어 "변경 안 보임"을 유발했다.)
const MAX_LINES = 4000;

/**
 * LCS(최장 공통 부분 수열) 기반 라인 diff를 계산한다.
 * 변경된 라인 주변 ctxLines 줄만 추출하고, 그 사이 생략 구간에는 sep 마커를 삽입한다.
 *
 * 대형 파일을 위해 먼저 공통 prefix/suffix를 잘라 LCS DP를 **변경된 가운데 구간으로 한정**한다.
 * 파일 전체가 수천 줄이어도 실제 편집이 작으면 빠르고, 빈 배열로 떨어지지 않는다.
 * 변경사항이 없으면 빈 배열을 반환한다.
 */
export function computeDiffHunks(original: string, updated: string, ctxLines = 3): DiffLine[] {
  const oldLines = original.split('\n');
  const newLines = updated.split('\n');

  // 공통 prefix/suffix 트림
  let pre = 0;
  const maxPre = Math.min(oldLines.length, newLines.length);
  while (pre < maxPre && oldLines[pre] === newLines[pre]) pre++;
  let suf = 0;
  const maxSuf = Math.min(oldLines.length - pre, newLines.length - pre);
  while (suf < maxSuf && oldLines[oldLines.length - 1 - suf] === newLines[newLines.length - 1 - suf]) suf++;

  const oldMid = oldLines.slice(pre, oldLines.length - suf);
  const newMid = newLines.slice(pre, newLines.length - suf);
  if (oldMid.length === 0 && newMid.length === 0) return []; // 변경 없음
  if (oldMid.length > MAX_LINES || newMid.length > MAX_LINES) return []; // 변경 구간 자체가 과대 → 포기

  const m = oldMid.length;
  const n = newMid.length;

  // DP 테이블 (Uint16Array로 메모리 절약) — 변경 구간만 대상
  const dp: Uint16Array[] = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldMid[i - 1] === newMid[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // traceback → raw diff (라인 번호는 prefix 오프셋 pre 만큼 보정)
  type RawLine = { type: 'ctx' | 'add' | 'del'; oldNo?: number; newNo?: number; content: string };
  const raw: RawLine[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldMid[i - 1] === newMid[j - 1]) {
      raw.unshift({ type: 'ctx', oldNo: pre + i, newNo: pre + j, content: oldMid[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.unshift({ type: 'add', newNo: pre + j, content: newMid[j - 1] });
      j--;
    } else {
      raw.unshift({ type: 'del', oldNo: pre + i, content: oldMid[i - 1] });
      i--;
    }
  }

  // 잘라낸 공통 prefix/suffix 중 ctxLines 만큼을 맥락(ctx)으로 앞뒤에 덧붙인다 — 변경 주변 문맥 보존.
  const preCtx = Math.min(ctxLines, pre);
  const preLines: RawLine[] = [];
  for (let k = preCtx; k >= 1; k--) {
    const idx = pre - k; // 0-based, 오름차순(pre-preCtx … pre-1)
    preLines.push({ type: 'ctx', oldNo: idx + 1, newNo: idx + 1, content: oldLines[idx] });
  }
  raw.unshift(...preLines);
  const sufCtx = Math.min(ctxLines, suf);
  for (let k = 0; k < sufCtx; k++) {
    const oldIdx = oldLines.length - suf + k;
    const newIdx = newLines.length - suf + k;
    raw.push({ type: 'ctx', oldNo: oldIdx + 1, newNo: newIdx + 1, content: oldLines[oldIdx] });
  }

  // 변경 라인 인덱스 주변 ctxLines 범위를 visible 셋에 등록
  const visible = new Set<number>();
  raw.forEach((line, idx) => {
    if (line.type !== 'ctx') {
      for (let k = Math.max(0, idx - ctxLines); k <= Math.min(raw.length - 1, idx + ctxLines); k++) {
        visible.add(k);
      }
    }
  });

  if (visible.size === 0) return [];

  // visible 인덱스 순서대로 결과를 조립하고 갭에 sep 삽입
  const result: DiffLine[] = [];
  let prevIdx = -1;

  for (const idx of [...visible].sort((a, b) => a - b)) {
    if (prevIdx !== -1 && idx > prevIdx + 1) {
      result.push({ type: 'sep', content: '...' });
    }
    result.push(raw[idx] as DiffLine);
    prevIdx = idx;
  }

  return result;
}
