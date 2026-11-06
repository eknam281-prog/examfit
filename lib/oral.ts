// AI 구술시험: 순수 로직(답변 횟수 규칙, 평가 결과 검증, 프롬프트). 네트워크·브라우저 API를 쓰지 않는다.
export const MAX_ATTEMPTS = 3; // 최초 답변 1회 + 재시도 2회
export const MAX_UNCLEAR = 3; // 인식 불가(횟수 미차감)가 문제당 이 횟수에 닿으면 문제를 종료해 무한 반복을 막는다

export type ErrorKind = "grammar" | "vocab" | "expression" | "content" | "omission" | "pronunciation_suspect";
export type EvalError = { kind: ErrorKind; wrong: string; correct: string; note: string };
export type Verdict = "correct" | "retry" | "unclear";
export type FactMismatch = { item: string; expected: string; said: string };
// heard: 모델이 들은 학생 발화(중국어 받아쓰기). confidence: 인식 확신도. factMismatches: 인원·날짜·시간·금액·고유명사 등 핵심 사실 불일치.
export type Evaluation = { verdict: Verdict; errors: EvalError[]; corrected: string; feedbackZh: string; feedbackKo: string; heard: string; confidence: "clear" | "uncertain"; factMismatches: FactMismatch[]; answerPinyin: string; answerKo: string };

export const ERROR_LABEL: Record<ErrorKind, string> = {
  grammar: "문법·어순",
  vocab: "어휘",
  expression: "표현",
  content: "내용",
  omission: "누락·변경",
  pronunciation_suspect: "발음 확인 필요(추정)",
};

export type Attempt = { n: number; evaluation: Evaluation };
export type QState = {
  used: number; // 처리된(차감된) 답변 수 — 최대 MAX_ATTEMPTS
  unclear: number; // 판단 불가로 차감되지 않은 횟수
  done: boolean;
  outcome: "pending" | "correct" | "exhausted" | "skipped" | "unclear";
  attempts: Attempt[];
  answerInfo?: { pinyin: string; ko: string }; // 문제 완료 후 표시할 모범답안 병음·한국어 뜻(AI가 붙인 것, 교재 원문 아님)
};

export const initQ = (): QState => ({ used: 0, unclear: 0, done: false, outcome: "pending", attempts: [] });
export const remaining = (q: QState) => Math.max(0, MAX_ATTEMPTS - q.used);
export const canAnswer = (q: QState) => !q.done && q.used < MAX_ATTEMPTS;
// 모범답안은 문제가 끝난 뒤(정답·재시도 소진·건너뜀·인식 불가)에만 공개한다.
export const revealAnswer = (q: QState) => q.done;

// 정상 처리된 평가 결과만 반영한다. unclear는 횟수를 차감하지 않는다.
export function applyEvaluation(q: QState, ev: Evaluation): QState {
  if (q.done) return q; // 이미 끝난 문제에는 더 반영하지 않는다(허용 횟수 초과 방지)
  if (ev.verdict === "unclear") {
    const unclear = q.unclear + 1;
    return unclear >= MAX_UNCLEAR ? { ...q, unclear, done: true, outcome: "unclear" } : { ...q, unclear };
  }
  const used = q.used + 1;
  const attempts = [...q.attempts, { n: used, evaluation: ev }];
  if (ev.answerPinyin || ev.answerKo) q = { ...q, answerInfo: { pinyin: ev.answerPinyin || q.answerInfo?.pinyin || "", ko: ev.answerKo || q.answerInfo?.ko || "" } };
  if (ev.verdict === "correct") return { ...q, used, attempts, done: true, outcome: "correct" };
  if (used >= MAX_ATTEMPTS) return { ...q, used, attempts, done: true, outcome: "exhausted" };
  return { ...q, used, attempts };
}

// '다음 문제'를 누르면 남은 재시도 기회는 종료된다.
export function skipQ(q: QState): QState {
  return q.done ? q : { ...q, done: true, outcome: "skipped" };
}

export function attemptLabel(q: QState): string {
  if (q.done) return q.outcome === "correct" ? "문제 완료" : "재시도 종료 · 모범답안 확인";
  if (q.used === 0) return "첫 답변 전 · 재시도 2회 가능";
  if (q.used === 1) return "첫 답변 완료 · 재시도 2회 남음";
  if (q.used === 2) return "재시도 1/2 · 마지막 기회";
  return "재시도 종료";
}

const KINDS: ErrorKind[] = ["grammar", "vocab", "expression", "content", "omission", "pronunciation_suspect"];

// 모델이 보낸 도구 호출 인자를 엄격히 검증한다. 형식이 어긋나면 null(= 답변 횟수 차감 없이 오류 처리).
export function parseEvaluation(raw: string): Evaluation | null {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const verdict = d.verdict;
  if (verdict !== "correct" && verdict !== "retry" && verdict !== "unclear") return null;
  const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const errors: EvalError[] = [];
  if (Array.isArray(d.errors)) {
    for (const e of d.errors.slice(0, 5)) {
      const o = (e ?? {}) as Record<string, unknown>;
      if (typeof o.kind !== "string" || !KINDS.includes(o.kind as ErrorKind)) continue;
      errors.push({ kind: o.kind as ErrorKind, wrong: str(o.wrong, 120), correct: str(o.correct, 120), note: str(o.note, 200) });
    }
  }
  const mism: FactMismatch[] = [];
  if (Array.isArray(d.fact_mismatches)) {
    for (const m of d.fact_mismatches.slice(0, 5)) {
      const o = (m ?? {}) as Record<string, unknown>;
      mism.push({ item: str(o.item, 60), expected: str(o.expected, 80), said: str(o.said, 80) });
    }
  }
  const ev: Evaluation = {
    verdict,
    errors,
    corrected: str(d.corrected, 300),
    feedbackZh: str(d.feedback_zh, 300),
    feedbackKo: str(d.feedback_ko, 300),
    heard: str(d.heard, 300),
    confidence: d.confidence === "uncertain" ? "uncertain" : "clear",
    factMismatches: mism,
    answerPinyin: str(d.answer_pinyin, 200),
    answerKo: str(d.answer_meaning_ko, 200),
  };
  // 재시도 판정인데 교정 내용이 전혀 없으면 신뢰할 수 없다.
  if (verdict === "retry" && errors.length === 0 && !ev.corrected) return null;
  return ev;
}

export const EVAL_TOOL = {
  type: "function",
  name: "report_evaluation",
  description: "학생의 구술 답변을 평가한 결과를 보고한다. 반드시 이 함수로만 결과를 알린다.",
  parameters: {
    type: "object",
    properties: {
      verdict: { type: "string", enum: ["correct", "retry", "unclear"], description: "correct=정답, retry=오류가 있어 재시도 필요, unclear=소리가 안 들리거나 알아듣지 못해 판단 불가" },
      errors: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: KINDS },
            wrong: { type: "string", description: "학생이 말한 잘못된 부분" },
            correct: { type: "string", description: "올바른 중국어 표현" },
            note: { type: "string", description: "한국어 한 문장 설명" },
          },
          required: ["kind", "wrong", "correct", "note"],
        },
      },
      corrected: { type: "string", description: "올바른 중국어 표현(문장)" },
      feedback_zh: { type: "string", description: "사용하지 않음(빈 문자열 가능)" },
      feedback_ko: { type: "string", description: "학생에게 한국어 음성으로 들려주고 화면에도 표시할 피드백 1~3문장. 정답이면 짧은 칭찬, 오답이면 어느 부분이 왜 틀렸는지" },
      answer_pinyin: { type: "string", description: "참고 답안의 성조 부호 포함 한어병음(화면 표시용, 학생에게 말하지 않는다)" },
      answer_meaning_ko: { type: "string", description: "참고 답안의 한국어 뜻(화면 표시용, 학생에게 말하지 않는다)" },
      heard: { type: "string", description: "학생이 실제로 한 말을 들린 그대로 중국어로 받아 적은 것. 아무 말도 알아듣지 못했으면 빈 문자열" },
      confidence: { type: "string", enum: ["clear", "uncertain"], description: "학생 발화를 또렷이 알아들었으면 clear, 단어(특히 숫자·이름)가 불확실하면 uncertain" },
      fact_mismatches: {
        type: "array",
        description: "모범답안과 다른 핵심 사실(인원수·날짜·시간·금액·숫자·고유명사). 없으면 빈 배열",
        items: { type: "object", properties: { item: { type: "string" }, expected: { type: "string" }, said: { type: "string" } }, required: ["item", "expected", "said"] },
      },
    },
    required: ["verdict", "errors", "corrected", "feedback_ko", "heard", "confidence", "fact_mismatches", "answer_pinyin", "answer_meaning_ko"],
  },
} as const;

export type OralQ = {
  id: string;
  questionType?: string;
  stem: string;
  modelAnswer?: string;
  explanation: string;
  evidence: string;
  source: { fileId: string; fileName: string; page: number };
};

export const SESSION_INSTRUCTIONS =
  "你是一位中文系的中国教授,正在对韩国大学生进行中文口语考试。只使用学生课堂资料中的内容出题和评价。" +
  "说话简短、清晰、友善。不要自己编造新问题。评价只根据你听到的内容。" +
  "绝对不要仅凭语音识别结果断定发音或声调错误;如果你怀疑某个词的发音或声调有问题,只能把它标为 pronunciation_suspect(推测),并指出具体的词。" +
  "不要给发音分数。听不清或没有听到学生的回答时,verdict 必须是 unclear。";

// 문제를 소리 내어 제시하게 하는 지시. 낭독 문제는 화면의 문장을 읽게 하고 문장 자체는 소리 내어 읽어 주지 않는다.
export function questionInstructions(q: OralQ): string {
  if (q.questionType === "문장 낭독") return "请用中文简短地说一句:请朗读屏幕上的句子。不要读出句子本身。";
  if (q.questionType === "본문 암송") return `请用中文说:"请背诵下面的课文。"然后只读出这段课文的开头:${q.stem}`;
  if (q.questionType === "한국어 문장을 중국어로 말하기") return `请用中文说"请把下面的韩语句子翻译成中文并说出来。",然后清楚地读出这个韩语句子:${q.stem}`;
  return `请用中文清楚地把下面的内容读给学生听(不要增删内容):${q.stem}`;
}

export function evalInstructions(q: OralQ, attemptNo: number, left: number): string {
  return (
    `评价学生刚才的口头回答,并且只调用 report_evaluation 函数,不要直接说话。\n` +
    `题型:${q.questionType ?? "一般"};题目:${q.stem}\n参考答案(来自课本):${q.modelAnswer ?? ""}\n` +
    `这是学生的第 ${attemptNo} 次回答,之后还剩 ${left} 次机会。\n` +
    `步骤:1) 先把学生实际说的话原样写进 heard(只写你真正听到的,不要用参考答案补全或猜测;完全没听清或没有说话就写空字符串,verdict 判 unclear)。` +
    `2) 把 heard 与参考答案逐项核对事实:人数、数字、日期、时间、金额、专有名词、地点、具体词语。只要有一项和参考答案不同,就要写进 fact_mismatches,verdict 必须是 retry,不能判 correct(即使学生的句子语法正确、很自然)。` +
    `3) 语法、语序、词汇、表达是否自然,与事实是否正确是两件独立的事;意思和事实都与参考答案一致、只是说法不同,才可以接受。` +
    `4) 背诵/朗读时有无遗漏或改动。5) 如果某个词(尤其是数字或名字)你听得不确定,confidence 写 uncertain,不要当作正确。` +
    `只有事实全部一致且没有明确错误才判 correct;听不清或没有回答判 unclear。` +
    `发音/声调只能作为 pronunciation_suspect(推测)并指出具体的词,不能因为语音识别结果就判定为错误。feedback_ko 用韩语写(1~3句):说对了就简短夸奖;说错了要具体说明哪个部分错了、为什么错。` +
    `如果这次不是 correct 且之后还有机会(剩余次数大于0),feedback_ko、errors、corrected 里都不要透露完整的参考答案或它的拼音,只指出错在哪里并给提示;只有 correct 或没有剩余机会时才可以写出正确说法。` +
    `另外填写 answer_pinyin(参考答案的带声调符号拼音)和 answer_meaning_ko(参考答案的韩语意思),这两项只用于屏幕显示,不要说出来。`
  );
}

// ───── 정답 판정 안전장치(클라이언트) ─────
// 모델이 correct라고 해도 (1) 들은 내용이 없거나 불확실하면 재확인(unclear), (2) 숫자·시간·인원 등 핵심 사실이 모범답안과 다르면 retry로 바꾼다.
const NUM = "[零〇一二两三四五六七八九十百千万\\d]+";
const UNIT = "[位个人名口点时号日月年元块钱岁杯份张次楼层间只本件]";
const DIGIT: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

export function cnToNumber(t: string): number | null {
  if (/^\d+$/.test(t)) return Number(t);
  if (!/^[零〇一二两三四五六七八九十百千万]+$/.test(t)) return null;
  let total = 0;
  let section = 0;
  let digit = 0;
  for (const ch of t) {
    if (ch in DIGIT) digit = DIGIT[ch];
    else if (ch === "十") (section += (digit || 1) * 10), (digit = 0);
    else if (ch === "百") (section += digit * 100), (digit = 0);
    else if (ch === "千") (section += digit * 1000), (digit = 0);
    else if (ch === "万") (total += (section + digit || 1) * 10000), (section = 0), (digit = 0);
  }
  return total + section + digit;
}

const CAT: Record<string, string> = { 位: "count", 个: "count", 人: "count", 名: "count", 口: "count", 点: "time", 时: "time", 号: "day", 日: "day" };
export type NumFact = { value: number; cat: string };

// '숫자 + 단위' 형태만 핵심 수치로 본다(一共의 '一'처럼 단위가 뒤따르지 않는 글자는 제외).
export function numericFacts(text: string): NumFact[] {
  const out: NumFact[] = [];
  for (const m of text.matchAll(new RegExp(`(${NUM})(${UNIT})`, "g"))) {
    const v = cnToNumber(m[1]);
    if (v !== null) out.push({ value: v, cat: CAT[m[2]] ?? m[2] });
  }
  return out;
}

export function missingFacts(modelAnswer: string, heard: string): { expected: string; said: string }[] {
  const exp = numericFacts(modelAnswer);
  const got = numericFacts(heard);
  const miss: { expected: string; said: string }[] = [];
  for (const e of exp) {
    if (!got.some((g) => g.value === e.value && g.cat === e.cat)) {
      const same = got.filter((g) => g.cat === e.cat).map((g) => g.value);
      miss.push({ expected: String(e.value), said: same.length ? same.join(", ") : "(언급 없음)" });
    }
  }
  return miss;
}

export function reconcileEvaluation(ev: Evaluation, q: OralQ): Evaluation {
  if (ev.verdict !== "correct") return ev;
  // 들은 내용이 없거나 불확실하면 정답으로 처리하지 않고 재확인을 요청한다(횟수 미차감).
  if (!ev.heard.replace(/\s/g, "") || ev.confidence === "uncertain") {
    return { ...ev, verdict: "unclear", errors: [], corrected: "", feedbackZh: "没听清楚,请再说一次。", feedbackKo: "답변을 또렷이 알아듣지 못했어요. 다시 말해 주세요." };
  }
  const mism: FactMismatch[] = [...ev.factMismatches.filter((m) => m.expected || m.said)];
  for (const m of missingFacts(q.modelAnswer ?? "", ev.heard)) {
    if (!mism.some((x) => x.expected === m.expected)) mism.push({ item: "수치", expected: m.expected, said: m.said });
  }
  if (mism.length === 0) return ev;
  const errors: EvalError[] = [...ev.errors, ...mism.map((m) => ({ kind: "content" as const, wrong: m.said, correct: m.expected, note: `${m.item || "핵심 정보"}이(가) 교재와 달라요` }))].slice(0, 5);
  const first = mism[0];
  return {
    ...ev,
    verdict: "retry",
    errors,
    corrected: ev.corrected || (q.modelAnswer ?? ""),
    feedbackZh: "",
    feedbackKo: `핵심 정보(${first.item || "수치"})가 교재와 달라요. 말씀하신 "${first.said}"는 맞지 않아요. 다시 한 번 말해 보세요.`,
    factMismatches: mism,
  };
}

// 클라이언트가 정하는 피드백 음성(모델이 보낸 내용 + 고정 안내). 모델은 이 내용을 그대로 읽는다.
const normText = (t: string) => t.replace(/[\s\p{P}\p{S}]/gu, "").toLowerCase();

// 재시도 기회가 남아 있는 동안에는 모범답안·정답 병음·교정 문장을 화면과 음성에서 숨긴다(필요한 오류 정보만 남김).
// 모델이 feedback_ko에 정답을 써 버린 경우도 걸러낸다.
export function hideAnswer(ev: Evaluation, q: OralQ): Evaluation {
  if (ev.verdict !== "retry") return ev;
  const ans = normText(q.modelAnswer ?? "");
  const py = normText(ev.answerPinyin);
  const k = normText(ev.feedbackKo);
  const leaks = (ans.length >= 2 && k.includes(ans)) || (py.length >= 3 && k.includes(py));
  return {
    ...ev,
    corrected: "",
    answerPinyin: "",
    answerKo: "",
    feedbackZh: "",
    feedbackKo: leaks || !ev.feedbackKo ? "틀린 부분이 있어요. 아래 지적을 보고 다시 한 번 말해 보세요." : ev.feedbackKo,
    errors: ev.errors.map((e) => ({ ...e, correct: "" })),
    factMismatches: ev.factMismatches.map((m) => ({ ...m, expected: "" })),
  };
}

// AI 교정 설명은 한국어 음성으로 읽는다(shown은 hideAnswer가 적용된 평가).
export function feedbackSpeech(ev: Evaluation, leftAfter: number, done: boolean): string {
  if (ev.verdict === "unclear") return "답변을 또렷이 알아듣지 못했어요. 다시 말씀해 주세요.";
  if (ev.verdict === "correct") return ev.feedbackKo.includes("정답") ? ev.feedbackKo : `정답이에요. ${ev.feedbackKo}`.trim();
  const notes = ev.feedbackKo || ev.errors.map((e) => e.note).filter(Boolean).slice(0, 2).join(" ");
  const tail = done ? "재시도 기회를 모두 사용했어요. 화면에서 모범답안을 확인하고 정답 듣기를 눌러 보세요." : leftAfter === 1 ? "마지막 기회예요. 다시 말씀해 주세요." : `재시도 기회가 ${leftAfter}번 남았어요. 다시 말씀해 주세요.`;
  return `아쉽지만 정답이 아니에요. ${notes} ${tail}`.replace(/\s+/g, " ").trim();
}

// 한국어 피드백 읽기
export function speakKoInstructions(text: string): string {
  return `다음 내용을 한국어로 그대로 읽으세요. 다른 말을 덧붙이거나 함수를 호출하지 마세요: ${text}`;
}

// 모범답안 발음 시범(중국어)
export function speakInstructions(text: string): string {
  return `请一字不差地用中文读出下面的内容,不要添加任何其他话,也不要调用函数:${text}`;
}
