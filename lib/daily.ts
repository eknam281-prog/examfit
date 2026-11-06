// 일상 중국어 일일 학습 세션: 계획(단어·문장·한자 선택), 잠금 해제, 결정적 퀴즈 생성, 저장 구조. 순수 로직(AI 호출 없음).
import { DAILY_SENTENCES, DAILY_WORDS, TOPICS, type DSentence, type DWord, type TopicId } from "./dailyData";
import { HANZI_STROKES } from "./hanziChars";
import type { Level } from "./placement";

export const STEPS = ["words", "listening", "speaking", "writing"] as const;
export type Step = (typeof STEPS)[number];
export const STEP_LABEL: Record<Step, string> = { words: "단어·표현", listening: "듣기", speaking: "회화", writing: "한자 쓰기" };
export const STEP_HREF: Record<Step, string> = { words: "/daily/words", listening: "/daily/listening", speaking: "/daily/speaking", writing: "/daily/writing" };
export const UNLOCK_HINT: Record<Step, string> = {
  words: "",
  listening: "단어·표현 학습과 확인 퀴즈를 마치면 열려요",
  speaking: "듣기 학습과 퀴즈를 마치면 열려요",
  writing: "회화 문장 학습과 최종 퀴즈를 마치면 열려요",
};

export const MIN_WORDS = 4; // 퀴즈 보기(4지선다)를 만들 수 있는 최소 단어 수
export const MAX_WORDS = 100;
export const DEFAULT_WORDS = 20;
export const CHARS_PER_DAY = 5;
export const conversationCount = (wordCount: number) => Math.ceil(wordCount / 2);

export type DailyVocab = DWord & { date: string; sessionId: string }; // 날짜·세션 ID를 붙여 저장한 공통 단어
export type CharTask = { char: string; wordId: string; index: number; total: number };
export type QuizState = { answers: Record<string, number>; done: boolean };
export type WritingResult = { passed: boolean; strokesOk: number; strokesTotal: number; note: string };

export type DailySession = {
  id: string;
  date: string;
  createdAt: number;
  level: Level;
  topic: TopicId | "all";
  requestedWords: number;
  words: DailyVocab[];
  sentenceIds: string[];
  chars: CharTask[];
  steps: {
    words: { marked: Record<string, "known" | "again">; quiz: QuizState; done: boolean };
    listening: { quiz: QuizState; done: boolean };
    speaking: { studied: string[]; quiz: QuizState; done: boolean; spoken?: Record<string, "ok" | "skipped"> }; // spoken: 문장별 말하기 인식 성공/평가 없이 완료
    writing: { learned: string[]; results: Record<string, WritingResult>; done: boolean };
  };
  review: { words: string[]; listening: string[]; sentences: string[]; chars: string[] };
  xpLog: { kind: string; ref: string; xp: number; at: number }[];
  doneAt?: Partial<Record<Step, number>>; // 단계를 처음 완료한 시각(없으면 세션 시작일 기준으로 집계)
  completedAt: number | null;
};
export type DailyStore = { activeId: string | null; sessions: Record<string, DailySession> };
export const EMPTY_STORE: DailyStore = { activeId: null, sessions: {} };

export const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ───── 계획 ─────
export type Plan = { ok: true; words: DWord[]; sentences: DSentence[]; chars: CharTask[]; capped: boolean; maxWords: number } | { ok: false; maxWords: number; message: string };

const byProximity = <T extends { topic: TopicId; level: Level; id: string }>(topic: TopicId | "all", level: Level) => (a: T, b: T) => {
  const ta = topic !== "all" && a.topic === topic ? 0 : 1;
  const tb = topic !== "all" && b.topic === topic ? 0 : 1;
  if (ta !== tb) return ta - tb;
  const da = Math.abs(a.level - level);
  const db = Math.abs(b.level - level);
  if (da !== db) return da - db;
  if (a.level !== b.level) return a.level - b.level; // 같은 거리면 쉬운 쪽 먼저
  return a.id.localeCompare(b.id);
};

function tryPlan(topic: TopicId | "all", level: Level, n: number) {
  const c = conversationCount(n);
  const sPool = [...DAILY_SENTENCES].sort(byProximity(topic, level));
  const wPool = [...DAILY_WORDS].sort(byProximity(topic, level));
  const chosen = new Set<string>();
  const sentences: DSentence[] = [];
  for (const s of sPool) {
    if (sentences.length >= c) break;
    const next = new Set([...chosen, ...s.keys]);
    if (next.size <= n) {
      s.keys.forEach((k) => chosen.add(k));
      sentences.push(s);
    }
  }
  if (sentences.length < c || n > DAILY_WORDS.length) return null;
  for (const w of wPool) {
    if (chosen.size >= n) break;
    chosen.add(w.id);
  }
  // 단어 목록은 우선순위 순서를 유지한다
  const words = wPool.filter((w) => chosen.has(w.id));
  return { words, sentences };
}

export function pickChars(words: DWord[], level: Level): CharTask[] {
  const seen = new Set<string>();
  const cand: CharTask[] = [];
  for (const w of words) {
    const cs = [...w.hanzi];
    cs.forEach((ch, index) => {
      if (HANZI_STROKES[ch] && !seen.has(ch)) {
        seen.add(ch);
        cand.push({ char: ch, wordId: w.id, index, total: cs.length });
      }
    });
  }
  // 입문·초급은 획이 적은 글자부터, 중급·고급은 단어 순서대로(하루 5자까지)
  const ordered = level <= 2 ? [...cand].sort((a, b) => HANZI_STROKES[a.char] - HANZI_STROKES[b.char]) : cand;
  return ordered.slice(0, CHARS_PER_DAY);
}

export function planSession(topic: TopicId | "all", level: Level, requested: number): Plan {
  if (!Number.isInteger(requested) || requested < MIN_WORDS || requested > MAX_WORDS) {
    return { ok: false, maxWords: 0, message: `단어 수는 ${MIN_WORDS}~${MAX_WORDS}개의 정수여야 해요.` };
  }
  let maxWords = 0;
  for (let n = Math.min(requested, DAILY_WORDS.length); n >= MIN_WORDS; n--) {
    const p = tryPlan(topic, level, n);
    if (p) {
      maxWords = n;
      return { ok: true, words: p.words, sentences: p.sentences, chars: pickChars(p.words, level), capped: n < requested, maxWords: n };
    }
  }
  return { ok: false, maxWords, message: "제공할 수 있는 단어·문장이 부족해요." };
}

export function createSession(plan: Extract<Plan, { ok: true }>, topic: TopicId | "all", level: Level, requested: number, store: DailyStore, now = new Date()): DailySession {
  const date = todayKey(now);
  const seq = Object.keys(store.sessions).filter((k) => store.sessions[k].date === date).length + 1;
  const id = `${date}-${seq}`;
  return {
    id,
    date,
    createdAt: now.getTime(),
    level,
    topic,
    requestedWords: requested,
    words: plan.words.map((w) => ({ ...w, date, sessionId: id })),
    sentenceIds: plan.sentences.map((s) => s.id),
    chars: plan.chars,
    steps: {
      words: { marked: {}, quiz: { answers: {}, done: false }, done: false },
      listening: { quiz: { answers: {}, done: false }, done: false },
      speaking: { studied: [], quiz: { answers: {}, done: false }, done: false },
      writing: { learned: [], results: {}, done: false },
    },
    review: { words: [], listening: [], sentences: [], chars: [] },
    xpLog: [],
    completedAt: null,
  };
}

// 활성 세션: 오늘 세션이거나, 날짜가 지났어도 아직 끝나지 않은 세션(진행 중 학습이 날짜 변경으로 손상되지 않게 한다).
export function getActive(store: DailyStore, today = todayKey()): DailySession | null {
  const s = store.activeId ? store.sessions[store.activeId] : null;
  if (!s) return null;
  return s.date === today || !s.completedAt ? s : null;
}

export const sentencesOf = (s: DailySession) => s.sentenceIds.map((id) => DAILY_SENTENCES.find((x) => x.id === id)!).filter(Boolean);

// ───── 잠금 ─────
export const isDone = (s: DailySession, step: Step) => s.steps[step].done;
export const isUnlocked = (s: DailySession, step: Step) => {
  const i = STEPS.indexOf(step);
  return i === 0 || isDone(s, STEPS[i - 1]);
};
export const currentStep = (s: DailySession): Step | null => STEPS.find((st) => !isDone(s, st)) ?? null;

// ───── 결정적 퀴즈 ─────
function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: string) {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(arr: T[], seed: string): T[] {
  const r = rng(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type Question = { id: string; ref: string; kind: string; stem: string; sub?: string; speak?: string; choices: string[]; answer: number; explain: string };

function withChoices(seed: string, correct: string, pool: string[], n = 4) {
  const distract = shuffle(pool.filter((x) => x !== correct), seed + ":d").slice(0, n - 1);
  const choices = shuffle([correct, ...distract], seed + ":c");
  return { choices, answer: choices.indexOf(correct) };
}

export function wordQuiz(s: DailySession): Question[] {
  const picked = shuffle(s.words, `${s.id}:wq`).slice(0, Math.min(s.words.length, 10));
  return picked.map((w, i) => {
    const toHanzi = i % 2 === 1;
    const pool = s.words.map((x) => (toHanzi ? x.hanzi : x.ko));
    const c = withChoices(`${s.id}:wq:${w.id}`, toHanzi ? w.hanzi : w.ko, pool);
    return { id: `wq-${w.id}`, ref: w.id, kind: toHanzi ? "뜻 → 한자" : "한자 → 뜻", stem: toHanzi ? w.ko : w.hanzi, sub: toHanzi ? undefined : w.pinyin, speak: toHanzi ? undefined : w.hanzi, ...c, explain: `${w.hanzi} (${w.pinyin}) = ${w.ko}` };
  });
}

export function listeningQuiz(s: DailySession): Question[] {
  const picked = shuffle(s.words, `${s.id}:lq`).slice(0, Math.min(s.words.length, 8));
  return picked.map((w) => {
    const c = withChoices(`${s.id}:lq:${w.id}`, w.ko, s.words.map((x) => x.ko));
    return { id: `lq-${w.id}`, ref: w.id, kind: "듣고 뜻 고르기", stem: "소리를 듣고 알맞은 뜻을 고르세요", speak: w.hanzi, ...c, explain: `${w.hanzi} (${w.pinyin}) = ${w.ko}` };
  });
}

// 회화 최종 퀴즈: 학습한 문장 각각을 정확히 한 번씩, 순서는 무작위. 학습하지 않은 문장은 출제하지 않는다.
export function speakingQuiz(s: DailySession): Question[] {
  const sents = sentencesOf(s);
  const useChoiceTypes = sents.length >= 4;
  const order = shuffle(sents, `${s.id}:sq`);
  return order.map((st, i) => {
    const seed = `${s.id}:sq:${st.id}`;
    const explain = `${st.zh} (${st.pinyin}) = ${st.ko}`;
    const type = useChoiceTypes ? i % 4 : 3;
    if (type === 0) return { id: `sq-${st.id}`, ref: st.id, kind: "뜻 → 중국어 문장", stem: st.ko, ...withChoices(seed, st.zh, sents.map((x) => x.zh)), explain };
    if (type === 1) return { id: `sq-${st.id}`, ref: st.id, kind: "병음 → 중국어 문장", stem: st.pinyin, ...withChoices(seed, st.zh, sents.map((x) => x.zh)), explain };
    if (type === 2) return { id: `sq-${st.id}`, ref: st.id, kind: "문장의 뜻 고르기", stem: st.zh, speak: st.zh, ...withChoices(seed, st.ko, sents.map((x) => x.ko)), explain };
    // 빈칸 채우기: 핵심 단어를 가리고 오늘 배운 단어 중에서 고른다
    const key = s.words.find((w) => st.keys.includes(w.id) && st.zh.includes(w.hanzi))!;
    const blank = st.zh.replace(key.hanzi, "( )");
    return { id: `sq-${st.id}`, ref: st.id, kind: "빈칸 채우기", stem: blank, sub: st.ko, ...withChoices(seed, key.hanzi, s.words.map((x) => x.hanzi).filter((h) => !st.zh.includes(h) || h === key.hanzi)), explain };
  });
}

export const quizOf = (s: DailySession, step: "words" | "listening" | "speaking") => (step === "words" ? wordQuiz(s) : step === "listening" ? listeningQuiz(s) : speakingQuiz(s));

// ───── 진도·완료 계산(저장된 값에서 매번 다시 계산) ─────
export function quizProgress(s: DailySession, step: "words" | "listening" | "speaking") {
  const qs = quizOf(s, step);
  const answers = s.steps[step].quiz.answers;
  const answered = qs.filter((q) => answers[q.id] !== undefined).length;
  const correct = qs.filter((q) => answers[q.id] === q.answer).length;
  return { total: qs.length, answered, correct, finished: qs.length > 0 && answered === qs.length };
}

export function wordsLearned(s: DailySession) {
  return s.words.filter((w) => s.steps.words.marked[w.id]).length === s.words.length;
}
export function sentencesStudied(s: DailySession) {
  return s.sentenceIds.every((id) => s.steps.speaking.studied.includes(id));
}
export function charsLearned(s: DailySession) {
  return s.chars.length > 0 && s.chars.every((c) => s.steps.writing.learned.includes(c.char));
}
export function writingFinished(s: DailySession) {
  return s.chars.length > 0 && s.chars.every((c) => s.steps.writing.results[c.char]);
}

// 각 단계 완료는 '정해진 학습 + 퀴즈 전체 응답'일 때만 true. 만점은 요구하지 않고, 틀린 항목은 복습 목록에 저장한다.
export function recompute(s: DailySession, now = Date.now()): DailySession {
  const wq = quizProgress(s, "words");
  const lq = quizProgress(s, "listening");
  const sq = quizProgress(s, "speaking");
  const wordsDone = wordsLearned(s) && wq.finished;
  const listeningDone = wordsDone && lq.finished;
  const speakingDone = listeningDone && sentencesStudied(s) && sq.finished;
  const writingDone = speakingDone && charsLearned(s) && writingFinished(s);
  const wrong = (step: "words" | "listening" | "speaking") => quizOf(s, step).filter((q) => s.steps[step].quiz.answers[q.id] !== undefined && s.steps[step].quiz.answers[q.id] !== q.answer).map((q) => q.ref);
  const doneAt: Partial<Record<Step, number>> = { ...(s.doneAt ?? {}) };
  if (wordsDone && !doneAt.words) doneAt.words = now;
  if (listeningDone && !doneAt.listening) doneAt.listening = now;
  if (speakingDone && !doneAt.speaking) doneAt.speaking = now;
  if (writingDone && !doneAt.writing) doneAt.writing = now;
  return {
    ...s,
    doneAt,
    steps: {
      words: { ...s.steps.words, done: wordsDone, quiz: { ...s.steps.words.quiz, done: wq.finished } },
      listening: { ...s.steps.listening, done: listeningDone, quiz: { ...s.steps.listening.quiz, done: lq.finished } },
      speaking: { ...s.steps.speaking, done: speakingDone, quiz: { ...s.steps.speaking.quiz, done: sq.finished } },
      writing: { ...s.steps.writing, done: writingDone },
    },
    review: {
      words: wrong("words"),
      listening: wrong("listening"),
      sentences: wrong("speaking"),
      chars: s.chars.filter((c) => s.steps.writing.results[c.char] && !s.steps.writing.results[c.char].passed).map((c) => c.char),
    },
    completedAt: writingDone ? (s.completedAt ?? now) : null,
  };
}

// ───── 단어 수 검증 ─────
export function validateWordCount(text: string): { ok: true; n: number } | { ok: false; message: string } {
  if (!/^\d+$/.test(text.trim())) return { ok: false, message: "숫자(정수)만 입력해 주세요." };
  const n = Number(text);
  if (n < MIN_WORDS || n > MAX_WORDS) return { ok: false, message: `${MIN_WORDS}~${MAX_WORDS} 사이로 입력해 주세요.` };
  return { ok: true, n };
}

export { TOPICS };
