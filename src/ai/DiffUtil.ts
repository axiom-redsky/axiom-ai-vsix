export type DiffLineType = 'ctx' | 'add' | 'del' | 'sep';

export interface DiffLine {
  type: DiffLineType;
  oldNo?: number;
  newNo?: number;
  content: string;
}

const MAX_LINES = 400;

/**
 * LCS(최장 공통 부분 수열) 기반 라인 diff를 계산한다.
 * 변경된 라인 주변 ctxLines 줄만 추출하고, 그 사이 생략 구간에는 sep 마커를 삽입한다.
 * 파일이 MAX_LINES 초과이거나 변경사항이 없으면 빈 배열을 반환한다.
 */
export function computeDiffHunks(original: string, updated: string, ctxLines = 3): DiffLine[] {
  const oldLines = original.split('\n');
  const newLines = updated.split('\n');

  if (oldLines.length > MAX_LINES || newLines.length > MAX_LINES) {
    return [];
  }

  const m = oldLines.length;
  const n = newLines.length;

  // DP 테이블 (Uint16Array로 메모리 절약)
  const dp: Uint16Array[] = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // traceback → raw diff
  type RawLine = { type: 'ctx' | 'add' | 'del'; oldNo?: number; newNo?: number; content: string };
  const raw: RawLine[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      raw.unshift({ type: 'ctx', oldNo: i, newNo: j, content: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.unshift({ type: 'add', newNo: j, content: newLines[j - 1] });
      j--;
    } else {
      raw.unshift({ type: 'del', oldNo: i, content: oldLines[i - 1] });
      i--;
    }
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
