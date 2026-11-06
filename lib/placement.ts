// 일상 중국어 최초 실력 진단: 고정 문제은행·채점·추천 로직(AI 호출 없음). 진단은 참고용이며 공인 HSK 급수를 판정하지 않는다.
import { SAMPLE_WORDS, type Word } from "./data";

export type Level = 1 | 2 | 3 | 4;
export const LEVELS_ALL: Level[] = [1, 2, 3, 4];
export const LEVEL_NAME: Record<Level, string> = { 1: "입문", 2: "초급", 3: "중급", 4: "고급" };
export const LEVEL_DESC: Record<Level, string> = {
  1: "중국어를 처음 배워요",
  2: "기본 단어와 간단한 문장을 이해해요",
  3: "일상적인 중국어 문장을 이해하고 회화가 가능해요",
  4: "비교적 복잡한 중국어 문장과 표현을 이해해요",
};

export type PlacementRecord = {
  completed: boolean;
  selfLevel: Level | null; // 자기 평가(확정된 실력이 아님)
  score: { correct: number; total: number } | null; // 진단 5문제 결과(진단을 건너뛰면 null)
  measuredLevel: Level | null; // 진단 문제에서 본 참고 수준
  recommended: Level | null; // 추천 시작 수준
  chosen: Level | null; // 사용자가 최종 선택한 시작 수준
  at: number | null;
};
export const EMPTY_PLACEMENT: PlacementRecord = { completed: false, selfLevel: null, score: null, measuredLevel: null, recommended: null, chosen: null, at: null };

export type PQuestion = { id: string; tier: Level; kind: "한자↔병음" | "단어 뜻" | "문장 해석" | "문장 이해" | "어휘·문법"; stem: string; choices: string[]; answer: number };

// 정답은 항상 첫 번째로 적어 두고, 출제할 때 문제 번호에 따라 위치를 돌린다.
const BANK: PQuestion[] = [
  { id: "t1a", tier: 1, kind: "한자↔병음", stem: "‘谢谢’의 병음은?", choices: ["xièxie", "nǐ hǎo", "zàijiàn", "duìbuqǐ"], answer: 0 },
  { id: "t1b", tier: 1, kind: "단어 뜻", stem: "‘学生’의 뜻은?", choices: ["학생", "선생님", "의사", "친구"], answer: 0 },
  { id: "t1c", tier: 1, kind: "문장 해석", stem: "‘你好,很高兴认识你。’의 뜻은?", choices: ["안녕하세요, 만나서 반가워요.", "감사합니다, 안녕히 계세요.", "미안해요, 잘 모르겠어요.", "내일 다시 만나요."], answer: 0 },
  { id: "t2a", tier: 2, kind: "한자↔병음", stem: "‘咖啡’의 병음은?", choices: ["kāfēi", "kǎfēi", "kāfěi", "kāfèi"], answer: 0 },
  { id: "t2b", tier: 2, kind: "단어 뜻", stem: "‘图书馆’의 뜻은?", choices: ["도서관", "서점", "학교", "병원"], answer: 0 },
  { id: "t2c", tier: 2, kind: "문장 이해", stem: "‘我想喝一杯咖啡。’ 이 사람이 원하는 것은?", choices: ["커피를 마시고 싶다", "책을 읽고 싶다", "집에 가고 싶다", "영화를 보고 싶다"], answer: 0 },
  { id: "t3a", tier: 3, kind: "어휘·문법", stem: "빈칸에 알맞은 말은?  我( )明天去北京。(내일 베이징에 갈 계획이다)", choices: ["打算", "已经", "刚才", "曾经"], answer: 0 },
  { id: "t3b", tier: 3, kind: "문장 해석", stem: "‘请问,附近有银行吗?’의 뜻은?", choices: ["실례지만, 근처에 은행이 있나요?", "실례지만, 은행은 몇 시에 문을 열어요?", "근처 은행에서 돈을 찾았어요.", "은행에 가는 방법을 모르겠어요."], answer: 0 },
  { id: "t3c", tier: 3, kind: "단어 뜻", stem: "‘麻烦’(máfan)의 알맞은 뜻은?", choices: ["번거롭게 하다", "간단하다", "즐겁다", "빠르다"], answer: 0 },
  { id: "t4a", tier: 4, kind: "문장 해석", stem: "‘无论天气怎么样,我都会去。’의 뜻은?", choices: ["날씨가 어떻든 나는 갈 것이다.", "날씨가 좋으면 갈 것이다.", "날씨 때문에 가지 않을 것이다.", "날씨를 모르면 가지 않을 것이다."], answer: 0 },
  { id: "t4b", tier: 4, kind: "어휘·문법", stem: "빈칸에 알맞은 말은?  ( )很累,他还是完成了工作。", choices: ["尽管", "因为", "如果", "所以"], answer: 0 },
  { id: "t4c", tier: 4, kind: "단어 뜻", stem: "‘避免’의 뜻은?", choices: ["피하다", "만들다", "시작하다", "돕다"], answer: 0 },
  { id: "t4d", tier: 4, kind: "한자↔병음", stem: "‘逐渐’의 병음은?", choices: ["zhújiàn", "zhūjiàn", "zhújiān", "zhùjiàn"], answer: 0 },
];

// 자기 평가에 따라 난이도를 달리해 5문제를 뽑는다(같은 문제 중복 없음).
const PLAN: Record<Level, Level[]> = { 1: [1, 1, 1, 2, 2], 2: [1, 1, 2, 2, 3], 3: [2, 2, 3, 3, 4], 4: [2, 3, 3, 4, 4] };

export type QuizItem = { q: PQuestion; choices: string[]; answer: number };

export function buildQuiz(self: Level): QuizItem[] {
  const used = new Set<string>();
  const kinds = new Set<string>();
  return PLAN[self].map((tier, i) => {
    // 같은 난이도 안에서는 아직 나오지 않은 문제 유형을 먼저 고른다.
    const pool = BANK.filter((x) => x.tier === tier && !used.has(x.id));
    const q = pool.find((x) => !kinds.has(x.kind)) ?? pool[0];
    used.add(q.id);
    kinds.add(q.kind);
    const shift = (i * 3 + 1) % 4; // 정답 위치를 문제마다 바꾼다
    const choices = q.choices.map((_, k) => q.choices[(k - shift + 4) % 4]);
    return { q, choices, answer: choices.indexOf(q.choices[q.answer]) };
  });
}

// 진단 문제에서 본 참고 수준: 정답률이 절반 이상인 가장 높은 난이도(전부 틀리면 입문).
export function measuredLevel(quiz: QuizItem[], picks: (number | null)[]): Level {
  let best: Level = 1;
  for (const t of LEVELS_ALL) {
    const idx = quiz.map((x, i) => (x.q.tier === t ? i : -1)).filter((i) => i >= 0);
    if (idx.length === 0) continue;
    const right = idx.filter((i) => picks[i] === quiz[i].answer).length;
    if (right / idx.length >= 0.5) best = t;
  }
  return best;
}

// 추천 시작 수준 = 자기 평가와 진단 결과를 함께 고려한다. 둘이 다르면 진단 쪽으로 한 단계만 이동한다.
export function recommend(self: Level, measured: Level): Level {
  if (measured === self) return self;
  const r = measured > self ? Math.min(measured, self + 1) : Math.max(measured, self - 1);
  return Math.max(1, Math.min(4, r)) as Level;
}

export function scoreQuiz(self: Level, quiz: QuizItem[], picks: (number | null)[]): Pick<PlacementRecord, "score" | "measuredLevel" | "recommended"> {
  const correct = quiz.filter((x, i) => picks[i] === x.answer).length;
  const m = measuredLevel(quiz, picks);
  return { score: { correct, total: quiz.length }, measuredLevel: m, recommended: recommend(self, m) };
}

// ───── 단어 콘텐츠의 난이도 ─────
// 기존 예시 단어는 그대로 두고 수준만 매긴다. 중급·고급 단어는 이 파일의 소규모 예시 세트다(강의자료 기반 아님).
const BASE_LEVEL: Record<string, Level> = { w1: 1, w2: 1, w3: 1, w4: 2, w5: 2 };
const EXTRA_WORDS: (Word & { level: Level })[] = [
  { id: "w6", level: 2, hanzi: "朋友", pinyin: "péngyou", meaning: "친구", example: "他是我的朋友。", examplePinyin: "Tā shì wǒ de péngyou.", exampleMeaning: "그는 제 친구예요." },
  { id: "w7", level: 2, hanzi: "喜欢", pinyin: "xǐhuan", meaning: "좋아하다", example: "我喜欢喝茶。", examplePinyin: "Wǒ xǐhuan hē chá.", exampleMeaning: "저는 차 마시는 것을 좋아해요." },
  { id: "w8", level: 2, hanzi: "明天", pinyin: "míngtiān", meaning: "내일", example: "明天见!", examplePinyin: "Míngtiān jiàn!", exampleMeaning: "내일 봐요!" },
  { id: "w9", level: 3, hanzi: "打算", pinyin: "dǎsuàn", meaning: "~할 계획이다", example: "我打算周末去旅行。", examplePinyin: "Wǒ dǎsuàn zhōumò qù lǚxíng.", exampleMeaning: "저는 주말에 여행 갈 계획이에요." },
  { id: "w10", level: 3, hanzi: "附近", pinyin: "fùjìn", meaning: "근처", example: "附近有一家银行。", examplePinyin: "Fùjìn yǒu yì jiā yínháng.", exampleMeaning: "근처에 은행이 하나 있어요." },
  { id: "w11", level: 3, hanzi: "麻烦", pinyin: "máfan", meaning: "번거롭게 하다, 귀찮다", example: "不好意思,麻烦你了。", examplePinyin: "Bù hǎoyìsi, máfan nǐ le.", exampleMeaning: "죄송해요, 번거롭게 해서요." },
  { id: "w12", level: 3, hanzi: "经验", pinyin: "jīngyàn", meaning: "경험", example: "他有很多工作经验。", examplePinyin: "Tā yǒu hěn duō gōngzuò jīngyàn.", exampleMeaning: "그는 업무 경험이 많아요." },
  { id: "w13", level: 4, hanzi: "尽管", pinyin: "jǐnguǎn", meaning: "비록 ~일지라도", example: "尽管很累,他还是坚持完成了。", examplePinyin: "Jǐnguǎn hěn lèi, tā háishi jiānchí wánchéng le.", exampleMeaning: "아무리 피곤해도 그는 끝까지 해냈어요." },
  { id: "w14", level: 4, hanzi: "避免", pinyin: "bìmiǎn", meaning: "피하다", example: "我们要避免犯同样的错误。", examplePinyin: "Wǒmen yào bìmiǎn fàn tóngyàng de cuòwù.", exampleMeaning: "우리는 같은 실수를 피해야 해요." },
  { id: "w15", level: 4, hanzi: "无论", pinyin: "wúlùn", meaning: "~에 상관없이", example: "无论天气怎么样,我都会去。", examplePinyin: "Wúlùn tiānqì zěnmeyàng, wǒ dōu huì qù.", exampleMeaning: "날씨가 어떻든 저는 갈 거예요." },
  { id: "w16", level: 4, hanzi: "逐渐", pinyin: "zhújiàn", meaning: "점차", example: "天气逐渐变冷了。", examplePinyin: "Tiānqì zhújiàn biàn lěng le.", exampleMeaning: "날씨가 점점 추워졌어요." },
];

export const ALL_WORDS: (Word & { level: Level })[] = [...SAMPLE_WORDS.map((w) => ({ ...w, level: BASE_LEVEL[w.id] ?? 1 })), ...EXTRA_WORDS];

// 시작 수준의 단어를 보여 준다. 수준이 없으면(진단 전) 전체를 그대로 사용한다.
export function wordsForLevel(level: Level | null | undefined) {
  return level ? ALL_WORDS.filter((w) => w.level === level) : ALL_WORDS;
}
