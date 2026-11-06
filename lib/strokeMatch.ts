// 한자 쓰기 최종 퀴즈용 획 판정(제출 후에만 사용). Hanzi Writer의 퀴즈 모드는 정답 글자를 미리 알고 획마다 즉시 피드백을 주므로
// (정답 힌트가 될 수 있음) 최종 퀴즈에서는 쓰지 않고, 사용자가 쓴 획을 모아 두었다가 제출 후 획 데이터(medians)와 비교한다.
// 획의 위치·크기·방향·순서를 근사적으로 비교할 뿐이며 전문 손글씨 평가가 아니다.
export type Pt = [number, number];
export type CharData = { strokes: string[]; medians: Pt[][] };
export type Reason = "ok" | "shape" | "start" | "end" | "direction" | "order" | "extra" | "missing";
export type StrokeVerdict = { ok: boolean; reason: Reason };
export type Judgement = { passed: boolean; strokeCountOk: boolean; verdicts: StrokeVerdict[]; strokesOk: number; strokesTotal: number };

const T_AVG = 0.16; // 모양: 대응점 평균 거리(글자 칸 대비)
const T_START = 0.24;
const T_END = 0.3;
const T_COS = 0.3; // 방향: 시작→끝 벡터의 코사인 유사도

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// hanzi-writer-data 좌표(원점 좌하단, 글자 영역 y 최대 900) → 0~1 화면 좌표(원점 좌상단)
export const normalizeMedian = (m: Pt[]): Pt[] => m.map(([x, y]) => [x / 1024, (900 - y) / 1024]);

export function resample(pts: Pt[], n = 16): Pt[] {
  if (pts.length === 0) return [];
  if (pts.length === 1) return Array.from({ length: n }, () => pts[0]);
  const seg: number[] = [0];
  for (let i = 1; i < pts.length; i++) seg.push(seg[i - 1] + dist(pts[i - 1], pts[i]));
  const total = seg[seg.length - 1];
  if (total === 0) return Array.from({ length: n }, () => pts[0]);
  const out: Pt[] = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    while (j < pts.length - 1 && seg[j] < target) j++;
    const span = seg[j] - seg[j - 1] || 1;
    const t = Math.min(1, Math.max(0, (target - seg[j - 1]) / span));
    out.push([pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * t, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * t]);
  }
  return out;
}

const bbox = (strokes: Pt[][]) => {
  const all = strokes.flat();
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};

// 사용자의 전체 필기를 정답 글자의 영역에 맞춘다(크기·위치 차이에 관대). 폭이나 높이가 거의 0이면(예: 一) 그 축은 크기 보정 없이 중심만 맞춘다.
export function fitToExpected(user: Pt[][], expected: Pt[][]): Pt[][] {
  const u = bbox(user);
  const e = bbox(expected);
  const axis = (u0: number, u1: number, e0: number, e1: number) => {
    const us = u1 - u0;
    const es = e1 - e0;
    if (us < 0.03 || es < 0.03) return { scale: 1, off: (e0 + e1) / 2 - (u0 + u1) / 2 };
    return { scale: es / us, off: 0, u0, e0 };
  };
  const ax = axis(u.x0, u.x1, e.x0, e.x1);
  const ay = axis(u.y0, u.y1, e.y0, e.y1);
  const map = (v: number, a: ReturnType<typeof axis>) => ("u0" in a ? (a.e0 as number) + (v - (a.u0 as number)) * a.scale : v + a.off);
  return user.map((s) => s.map(([x, y]) => [map(x, ax), map(y, ay)] as Pt));
}

function compare(user: Pt[], exp: Pt[]): Reason {
  const a = resample(user);
  const b = resample(exp);
  if (dist(a[0], b[0]) > T_START) return "start";
  if (dist(a[a.length - 1], b[b.length - 1]) > T_END) return "end";
  const avg = a.reduce((sum, p, i) => sum + dist(p, b[i]), 0) / a.length;
  if (avg > T_AVG) return "shape";
  const va: Pt = [a[a.length - 1][0] - a[0][0], a[a.length - 1][1] - a[0][1]];
  const vb: Pt = [b[b.length - 1][0] - b[0][0], b[b.length - 1][1] - b[0][1]];
  const na = Math.hypot(...va);
  const nb = Math.hypot(...vb);
  if (na > 0.05 && nb > 0.05 && (va[0] * vb[0] + va[1] * vb[1]) / (na * nb) < T_COS) return "direction";
  return "ok";
}

// user: 0~1로 정규화한 사용자 획(그린 순서). data: 정답 글자의 획 데이터.
export function judgeStrokes(user: Pt[][], data: CharData): Judgement {
  const expected = data.medians.map(normalizeMedian);
  const total = expected.length;
  if (user.length === 0 || user.every((s) => s.length < 2)) {
    return { passed: false, strokeCountOk: false, verdicts: expected.map(() => ({ ok: false, reason: "missing" as Reason })), strokesOk: 0, strokesTotal: total };
  }
  const fitted = fitToExpected(user, expected);
  const verdicts: StrokeVerdict[] = [];
  for (let i = 0; i < Math.max(total, fitted.length); i++) {
    if (i >= total) {
      verdicts.push({ ok: false, reason: "extra" });
      continue;
    }
    if (i >= fitted.length) {
      verdicts.push({ ok: false, reason: "missing" });
      continue;
    }
    const r = compare(fitted[i], expected[i]);
    if (r === "ok") verdicts.push({ ok: true, reason: "ok" });
    else {
      // 다른 자리 획과 잘 맞으면 순서 문제로 본다
      const other = expected.findIndex((e, j) => j !== i && compare(fitted[i], e) === "ok");
      verdicts.push({ ok: false, reason: other >= 0 ? "order" : r });
    }
  }
  const strokesOk = verdicts.slice(0, total).filter((v) => v.ok).length;
  const strokeCountOk = fitted.length === total;
  return { passed: strokeCountOk && strokesOk === total, strokeCountOk, verdicts, strokesOk, strokesTotal: total };
}

export const REASON_TEXT: Record<Reason, string> = {
  ok: "맞음",
  shape: "모양이 달라요",
  start: "시작 위치가 달라요",
  end: "끝 위치가 달라요",
  direction: "방향이 반대예요",
  order: "획순이 달라요",
  extra: "필요 없는 획이에요",
  missing: "빠진 획이에요",
};
