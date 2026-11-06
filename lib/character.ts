// 핏찹이 성장 단계. 경험치 구간은 개발용 임시 값이며 명세서에 확정 수치가 없다.
export type CharacterLevel = { level: 1 | 2 | 3 | 4; minXp: number; image: string };

export const LEVELS: CharacterLevel[] = [
  { level: 1, minXp: 0, image: "/characters/level-1.png" },
  { level: 2, minXp: 100, image: "/characters/level-2.png" },
  { level: 3, minXp: 300, image: "/characters/level-3.png" },
  { level: 4, minXp: 600, image: "/characters/level-4.png" },
];

export function getLevelInfo(xp: number) {
  const idx = LEVELS.reduce((acc, l, i) => (xp >= l.minXp ? i : acc), 0);
  const current = LEVELS[idx];
  const next = LEVELS[idx + 1] ?? null;
  const progress = next ? (xp - current.minXp) / (next.minXp - current.minXp) : 1;
  return { current, next, progress, xpToNext: next ? next.minXp - xp : 0 };
}

// 경험치는 학습 행동(복습한 카드/정답 문제)에만 연결한다. 단순 재생·방치는 보상하지 않는다.
export type XpEvent = "word-reviewed" | "listening-quiz-correct" | "exam-question-correct";
export const XP_REWARD: Record<XpEvent, number> = {
  "word-reviewed": 2,
  "listening-quiz-correct": 5,
  "exam-question-correct": 5,
};
