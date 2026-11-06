// 백업·복원·초기화 로직(저장소를 주입받아 테스트 가능). EXAMFIT이 만든 `examfit.` 키와 IndexedDB `examfit-materials`만 다룬다.
import { EMPTY_PLACEMENT } from "./placement";
import { EMPTY_STORE, getActive, type DailySession, type DailyStore } from "./daily";

export const BACKUP_FORMAT = 1;
export const KEY_PREFIX = "examfit.";
export const IDB_NAME = "examfit-materials";
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

// 이 앱이 쓰는 localStorage 키(백업·복원 허용 목록)
export const KNOWN_KEYS = [
  "examfit.xp",
  "examfit.words",
  "examfit.listening",
  "examfit.placement",
  "examfit.daily",
  "examfit.coursePlan",
  "examfit.course",
  "examfit.generatedQuestions",
  "examfit.oralQuestions",
  "examfit.examRewarded",
  "examfit.modes",
  "examfit.fitchapName",
] as const;

export type StorageLike = { readonly length: number; key(i: number): string | null; getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };

export const examfitKeys = (st: StorageLike) => {
  const out: string[] = [];
  for (let i = 0; i < st.length; i++) {
    const k = st.key(i);
    if (k && k.startsWith(KEY_PREFIX)) out.push(k);
  }
  return out.sort();
};

// 백업 파일에 들어가지 않는 것을 정확히 밝힌다(완전 백업이 아님).
export const BACKUP_EXCLUDES = [
  "시험 대비 PDF 원본·추출 텍스트·OCR 결과(브라우저 IndexedDB `examfit-materials`) — 이번 백업에는 포함되지 않아요",
  "API 키·토큰·서버 환경변수 — 브라우저에 저장되지 않으며 백업에도 없어요",
  "음성 원본 — 저장하지 않아요",
];

export type Backup = { app: "examfit"; format: number; exportedAt: number; data: Record<string, unknown>; excludes: string[] };

export function buildBackup(st: StorageLike, now = Date.now()): Backup {
  const data: Record<string, unknown> = {};
  for (const k of examfitKeys(st)) {
    if (!(KNOWN_KEYS as readonly string[]).includes(k)) continue;
    const raw = st.getItem(k);
    if (raw === null) continue;
    try {
      data[k] = JSON.parse(raw);
    } catch {
      /* 손상된 값은 백업에 넣지 않는다 */
    }
  }
  return { app: "examfit", format: BACKUP_FORMAT, exportedAt: now, data, excludes: BACKUP_EXCLUDES };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

// 키별 최소 구조 검사. 맞지 않으면 그 파일 전체를 거부한다.
const CHECK: Record<string, (v: unknown) => string | null> = {
  "examfit.xp": (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e7 ? null : "경험치 값이 올바르지 않아요"),
  "examfit.words": (v) => (isObj(v) && Object.values(v).every((x) => x === "known" || x === "again") ? null : "단어 기록 형식이 올바르지 않아요"),
  "examfit.listening": (v) => (isObj(v) && Object.values(v).every((r) => isObj(r) && typeof r.plays === "number" && typeof r.quizTried === "number" && typeof r.quizCorrect === "number") ? null : "듣기 기록 형식이 올바르지 않아요"),
  "examfit.placement": (v) => (isObj(v) && typeof v.completed === "boolean" ? null : "실력 설정 형식이 올바르지 않아요"),
  "examfit.daily": (v) => {
    if (!isObj(v) || !isObj(v.sessions) || !(v.activeId === null || typeof v.activeId === "string")) return "학습 세션 형식이 올바르지 않아요";
    for (const s of Object.values(v.sessions)) {
      if (!isObj(s) || typeof s.id !== "string" || typeof s.date !== "string" || !Array.isArray(s.words) || !Array.isArray(s.sentenceIds) || !isObj(s.steps) || !isObj(s.review)) return "학습 세션 내용이 올바르지 않아요";
      for (const k of ["words", "listening", "speaking", "writing"]) if (!isObj((s.steps as Record<string, unknown>)[k])) return "학습 단계 기록이 올바르지 않아요";
    }
    return null;
  },
  "examfit.coursePlan": (v) => (isObj(v) ? null : "코스 설정 형식이 올바르지 않아요"),
  "examfit.course": (v) => (isObj(v) ? null : "과목 정보 형식이 올바르지 않아요"),
  "examfit.generatedQuestions": (v) => (Array.isArray(v) ? null : "생성 문제 형식이 올바르지 않아요"),
  "examfit.oralQuestions": (v) => (Array.isArray(v) ? null : "말하기 문제 형식이 올바르지 않아요"),
  "examfit.examRewarded": (v) => (Array.isArray(v) ? null : "보상 기록 형식이 올바르지 않아요"),
  "examfit.modes": (v) => (isObj(v) ? null : "모드 설정 형식이 올바르지 않아요"),
  "examfit.fitchapName": (v) => (typeof v === "string" && v.length <= 20 ? null : "캐릭터 이름 형식이 올바르지 않아요"),
};

export type BackupSummary = { exportedAt: number; keys: string[]; xp: number | null; sessions: number; hasPlacement: boolean };
export type Validation = { ok: true; backup: Backup; summary: BackupSummary } | { ok: false; message: string };

export function validateBackup(text: string): Validation {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, message: "파일이 너무 커서 가져올 수 없어요." };
  // 비밀값이 섞인 파일은 거부한다(이 앱은 비밀값을 백업하지 않는다).
  if (/baze_[A-Za-z0-9]{8,}|FACTCHAT_API_KEY|Bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9]{16,}/.test(text)) return { ok: false, message: "API 키나 토큰처럼 보이는 내용이 들어 있어 가져올 수 없어요." };
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    return { ok: false, message: "JSON 파일이 손상되었거나 올바른 형식이 아니에요." };
  }
  if (!isObj(j) || j.app !== "examfit") return { ok: false, message: "EXAMFIT 백업 파일이 아니에요." };
  if (j.format !== BACKUP_FORMAT) return { ok: false, message: `지원하지 않는 백업 버전이에요(필요: ${BACKUP_FORMAT}, 파일: ${String(j.format)}).` };
  if (typeof j.exportedAt !== "number" || !isObj(j.data)) return { ok: false, message: "백업 파일의 구조가 올바르지 않아요." };
  const keys = Object.keys(j.data);
  if (keys.length === 0) return { ok: false, message: "백업에 가져올 데이터가 없어요." };
  for (const k of keys) {
    if (!(KNOWN_KEYS as readonly string[]).includes(k)) return { ok: false, message: `알 수 없는 항목(${k})이 들어 있어 가져올 수 없어요.` };
    const err = CHECK[k](j.data[k]);
    if (err) return { ok: false, message: `${k}: ${err}` };
  }
  const daily = j.data["examfit.daily"] as DailyStore | undefined;
  return {
    ok: true,
    backup: { app: "examfit", format: BACKUP_FORMAT, exportedAt: j.exportedAt, data: j.data, excludes: BACKUP_EXCLUDES },
    summary: { exportedAt: j.exportedAt, keys, xp: typeof j.data["examfit.xp"] === "number" ? (j.data["examfit.xp"] as number) : null, sessions: daily ? Object.keys(daily.sessions).length : 0, hasPlacement: "examfit.placement" in j.data },
  };
}

// 가져오기: 백업에 들어 있는 키만 덮어쓴다(없는 키는 그대로). 쓰는 도중 실패하면 원래 값으로 되돌린다.
export function applyBackup(st: StorageLike, b: Backup): { ok: true; written: string[] } | { ok: false; message: string } {
  const before = new Map<string, string | null>();
  const written: string[] = [];
  try {
    for (const [k, v] of Object.entries(b.data)) {
      before.set(k, st.getItem(k));
      st.setItem(k, JSON.stringify(v));
      written.push(k);
    }
    return { ok: true, written };
  } catch {
    for (const [k, v] of before) {
      try {
        if (v === null) st.removeItem(k);
        else st.setItem(k, v);
      } catch {
        /* 복구 실패는 무시(원래 값이 일부 남을 수 있음) */
      }
    }
    return { ok: false, message: "저장 공간이 부족하거나 저장에 실패해 가져오기를 취소했어요. 기존 데이터로 되돌렸어요." };
  }
}

// ───── 초기화 ─────
// 오늘의 학습만: 활성 세션의 진도(단계·퀴즈·복습·완료)만 비운다. 단어·문장 목록, 누적 XP·단어/듣기 기록(= XP 지급 이력), 과거 세션은 그대로 둔다.
// XP는 단어별·듣기 문항별 '최초 1회' 기준이 전역 기록(examfit.words/listening)에 있으므로 초기화 후 다시 풀어도 중복 지급되지 않는다.
export function resetTodaySession(store: DailyStore): { store: DailyStore; reset: boolean } {
  const s = getActive(store);
  if (!s) return { store, reset: false };
  const fresh: DailySession = {
    ...s,
    steps: {
      words: { marked: {}, quiz: { answers: {}, done: false }, done: false },
      listening: { quiz: { answers: {}, done: false }, done: false },
      speaking: { studied: [], quiz: { answers: {}, done: false }, done: false },
      writing: { learned: [], results: {}, done: false },
    },
    review: { words: [], listening: [], sentences: [], chars: [] },
    doneAt: {},
    completedAt: null,
  };
  return { store: { ...store, sessions: { ...store.sessions, [s.id]: fresh } }, reset: true };
}

export const resetPlacementValue = () => ({ ...EMPTY_PLACEMENT });

export type FullResetPlan = { keys: string[]; others: number };
export const planFullReset = (st: StorageLike): FullResetPlan => {
  const keys = examfitKeys(st);
  return { keys, others: st.length - keys.length };
};

// 전체 초기화(localStorage 부분): `examfit.` 키만 지운다. 끝난 뒤 실제로 남은 키가 없는지 확인해 결과를 돌려준다.
export function clearExamfitStorage(st: StorageLike): { ok: boolean; removed: number; remaining: string[] } {
  const keys = examfitKeys(st);
  for (const k of keys) {
    try {
      st.removeItem(k);
    } catch {
      /* 아래 검증에서 잡는다 */
    }
  }
  const remaining = examfitKeys(st);
  return { ok: remaining.length === 0, removed: keys.length - remaining.length, remaining };
}

export const CONFIRM_PHRASE = "전체 삭제";
export { EMPTY_STORE };
