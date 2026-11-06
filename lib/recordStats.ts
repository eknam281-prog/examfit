// 기록 화면용 통계: 저장된 실제 기록(examfit.daily·words·listening)만 집계한다. 없는 값은 만들지 않는다.
import { speakingQuiz, STEPS, todayKey, type DailySession, type DailyStore, type Step } from "./daily";
import { DAILY_SENTENCES, DAILY_WORDS } from "./dailyData";

export type ListenRec = { plays: number; quizTried: number; quizCorrect: number; xpGiven?: boolean };
export type DayStep = { sessionId: string; step: Step; at: number | null };
export type DayInfo = { date: string; steps: DayStep[]; sessions: DailySession[] };

const sessionsOf = (store: DailyStore) => Object.values(store.sessions ?? {});

// 날짜별로 '완료한 단계'를 모은다. 완료 시각이 없는 이전 데이터는 세션 시작일에 넣는다. 접속만으로는 기록되지 않는다.
export function learnedDays(store: DailyStore): Map<string, DayInfo> {
  const map = new Map<string, DayInfo>();
  for (const s of sessionsOf(store)) {
    for (const step of STEPS) {
      if (!s.steps[step].done) continue;
      const at = s.doneAt?.[step] ?? null;
      const date = at ? todayKey(new Date(at)) : s.date;
      const d = map.get(date) ?? { date, steps: [], sessions: [] };
      d.steps.push({ sessionId: s.id, step, at });
      if (!d.sessions.includes(s)) d.sessions.push(s);
      map.set(date, d);
    }
  }
  return map;
}

const prevDay = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return todayKey(new Date(y, m - 1, d - 1));
};

// 연속 학습 일수: 오늘 학습했으면 오늘부터, 아직이면 어제부터 이어서 센다(오늘 안 했다고 바로 끊기지 않음).
export function streak(days: Set<string>, today: string): number {
  let cur = days.has(today) ? today : prevDay(today);
  let n = 0;
  while (days.has(cur)) {
    n++;
    cur = prevDay(cur);
  }
  return n;
}

export function lastDays(n: number, today: string): string[] {
  const out: string[] = [];
  let cur = today;
  for (let i = 0; i < n; i++) {
    out.unshift(cur);
    cur = prevDay(cur);
  }
  return out;
}

// 달력(일요일 시작). 날짜가 없는 칸은 null.
export function monthGrid(year: number, month0: number): (string | null)[][] {
  const first = new Date(year, month0, 1).getDay();
  const count = new Date(year, month0 + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => todayKey(new Date(year, month0, i + 1)))];
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export type ReviewItem = { id: string; label: string; sub: string; sessionId: string; current: boolean };

export function computeStats(store: DailyStore, words: Record<string, string>, listening: Record<string, ListenRec>, today = todayKey()) {
  const sessions = sessionsOf(store);
  const days = learnedDays(store);
  const daySet = new Set(days.keys());

  const learnedWordIds = new Set<string>([...Object.keys(words ?? {}), ...sessions.flatMap((s) => Object.keys(s.steps.words.marked))]);
  const knownWords = Object.values(words ?? {}).filter((v) => v === "known").length;
  const studiedSentences = new Set(sessions.flatMap((s) => s.steps.speaking.studied));

  let speakAnswered = 0;
  let speakCorrect = 0;
  let speakTotal = 0;
  for (const s of sessions) {
    if (s.sentenceIds.length === 0) continue;
    const qs = speakingQuiz(s);
    const a = s.steps.speaking.quiz.answers;
    speakTotal += qs.length;
    speakAnswered += qs.filter((q) => a[q.id] !== undefined).length;
    speakCorrect += qs.filter((q) => a[q.id] === q.answer).length;
  }

  const learnedChars = new Set(sessions.flatMap((s) => s.steps.writing.learned));
  const writeResults = sessions.flatMap((s) => Object.values(s.steps.writing.results));
  const recs = Object.values(listening ?? {});
  const tried = recs.reduce((a, r) => a + r.quizTried, 0);
  const correct = recs.reduce((a, r) => a + r.quizCorrect, 0);

  // 복습 목록: 오답으로 저장된 항목(중복 제거). 현재 세션 항목은 해당 단계에서 바로 다시 연습할 수 있다.
  const active = store.activeId;
  const uniq = (rows: ReviewItem[]) => [...new Map(rows.map((r) => [r.id, r])).values()];
  const wordInfo = (id: string) => DAILY_WORDS.find((w) => w.id === id);
  const review = {
    words: uniq(sessions.flatMap((s) => s.review.words.map((id) => ({ id, label: wordInfo(id)?.hanzi ?? id, sub: wordInfo(id) ? `${wordInfo(id)!.pinyin} · ${wordInfo(id)!.ko}` : "", sessionId: s.id, current: s.id === active })))),
    listening: uniq(sessions.flatMap((s) => s.review.listening.map((id) => ({ id, label: wordInfo(id)?.hanzi ?? id, sub: wordInfo(id) ? `${wordInfo(id)!.pinyin} · ${wordInfo(id)!.ko}` : "", sessionId: s.id, current: s.id === active })))),
    sentences: uniq(sessions.flatMap((s) => s.review.sentences.map((id) => { const st = DAILY_SENTENCES.find((x) => x.id === id); return { id, label: st?.zh ?? id, sub: st ? `${st.pinyin} · ${st.ko}` : "", sessionId: s.id, current: s.id === active }; }))),
    chars: uniq(sessions.flatMap((s) => s.review.chars.map((ch) => ({ id: ch, label: ch, sub: s.steps.writing.results[ch]?.note ?? "", sessionId: s.id, current: s.id === active })))),
  };

  const week = lastDays(7, today).map((date) => ({ date, steps: days.get(date)?.steps.length ?? 0 }));
  return {
    sessionCount: sessions.length,
    hasAny: sessions.length > 0 || Object.keys(words ?? {}).length > 0 || recs.length > 0,
    learnedWords: learnedWordIds.size,
    knownWords,
    studiedSentences: studiedSentences.size,
    speaking: { answered: speakAnswered, correct: speakCorrect, total: speakTotal },
    writing: { learned: learnedChars.size, tried: writeResults.length, passed: writeResults.filter((r) => r.passed).length },
    listening: { tried, correct, rate: tried ? correct / tried : null },
    days,
    daySet,
    streak: streak(daySet, today),
    week,
    weekDays: week.filter((d) => d.steps > 0).length,
    todayDone: days.get(today)?.steps.length ?? 0,
    review,
    reviewTotal: review.words.length + review.listening.length + review.sentences.length + review.chars.length,
    completedSessions: sessions.filter((s) => s.completedAt).length,
  };
}

// 지금까지의 최장 연속 학습 일수(실제 학습 완료일 기준)
export function maxStreak(days: Set<string>): number {
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && prevDay(d) === prev ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}
