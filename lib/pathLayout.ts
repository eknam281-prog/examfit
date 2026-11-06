// 지그재그 학습 경로 배치 계산(px). 단계 이름·상태 설명 영역과 점선이 겹치지 않도록 점선은 라벨 아래에서 시작한다.
export const ROW = 220; // 단계 한 줄 높이
export const NODE = 96; // 노드 영역 높이(현재 단계 기준)
export const LABEL_GAP = 8; // 노드와 라벨 사이
export const LABEL_H = 44; // 단계 이름(20) + 상태 설명(16) + 여유
export const PATH_PAD = 12; // 라벨·노드와 점선 사이 여백
export const NODE_TOP = 4;
export const XS = [28, 72, 28, 72]; // 지그재그 x 위치(%)

export const nodeTop = (i: number) => i * ROW + NODE_TOP;
export const labelRange = (i: number) => [nodeTop(i) + NODE + LABEL_GAP, nodeTop(i) + NODE + LABEL_GAP + LABEL_H] as const;
export const nodeRange = (i: number) => [nodeTop(i) - 8, nodeTop(i) + NODE + 8] as const; // 현재 단계 테두리(-inset-2) 포함

// 구간 i → i+1 점선의 y 범위
export const segment = (i: number) => ({ y1: labelRange(i)[1] + PATH_PAD, y2: nodeRange(i + 1)[0] - PATH_PAD });

export function pathD(count: number): string {
  const parts: string[] = [];
  for (let i = 0; i < count - 1; i++) {
    const { y1, y2 } = segment(i);
    const m = (y1 + y2) / 2;
    parts.push(`M ${XS[i]} ${y1} C ${XS[i]} ${m}, ${XS[i + 1]} ${m}, ${XS[i + 1]} ${y2}`);
  }
  return parts.join(" ");
}
