// 일일 코스 시간 배분 (AI 호출 없는 순수 로직)
export type Area = "words" | "listening" | "speaking" | "writing" | "review";
export const AREAS: Area[] = ["words", "listening", "speaking", "writing", "review"];
export const AREA_LABEL: Record<Area, string> = { words: "단어·표현", listening: "듣기", speaking: "말하기", writing: "쓰기·한자", review: "복습" };
// 말하기·쓰기·복습은 아직 학습 화면이 없다. 선택은 가능하지만 UI에서 미구현으로 표시한다.
export const AREA_HREF: Partial<Record<Area, string>> = { words: "/daily/words", listening: "/daily/listening" };
export type Mode = "balanced" | "listening" | "speaking";
export const MODE_LABEL: Record<Mode, string> = { balanced: "균형 학습", listening: "듣기 집중", speaking: "말하기 집중" };
export const MIN_MINUTES = 5;
export const MAX_MINUTES = 180;
export const PRESETS = [10, 20, 30, 50, 60, 90];

const WEIGHTS: Record<Mode, Record<Area, number>> = {
  balanced: { words: 3, listening: 3, speaking: 2, writing: 1, review: 1 },
  listening: { words: 1, listening: 6, speaking: 1, writing: 1, review: 1 },
  speaking: { words: 1, listening: 2, speaking: 6, writing: 1, review: 1 },
};

export function validateMinutes(v: number): string | null {
  if (!Number.isFinite(v) || !Number.isInteger(v)) return "정수 분을 입력해 주세요.";
  if (v < MIN_MINUTES || v > MAX_MINUTES) return `${MIN_MINUTES}~${MAX_MINUTES}분 사이로 입력해 주세요.`;
  return null;
}

// 선택된 영역에만 배분하고, 최대잉여법으로 합계를 목표 시간과 정확히 일치시킨다.
export function allocate(total: number, mode: Mode, areas: Area[]): Partial<Record<Area, number>> {
  if (areas.length === 0) return {};
  const w = areas.map((a) => WEIGHTS[mode][a]);
  const sum = w.reduce((a, b) => a + b, 0);
  const raw = w.map((x) => (x / sum) * total);
  const base = raw.map(Math.floor);
  let rest = total - base.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f);
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) base[order[k].i]++;
  return Object.fromEntries(areas.map((a, i) => [a, base[i]]));
}
