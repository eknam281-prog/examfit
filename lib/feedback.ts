// 서술형 답안 보완 피드백: 프롬프트·응답 검증·캐시 키(네트워크 호출 없음). 점수·정답/오답 판정은 만들지 않는다.
export const SUFFICIENT_TEXT = "핵심 내용을 정확하게 작성했어요. 필수로 수정할 부분은 없어요.";
export const MAX_ANSWER_CHARS = 1500;
export const MAX_FIELD_CHARS = 1500;

export type ImproveKind = "missing" | "unclear" | "wrong" | "wording";
export const KIND_LABEL: Record<ImproveKind, string> = { missing: "빠진 핵심 개념", unclear: "설명이 부족한 부분", wrong: "잘못 이해한 내용", wording: "표현을 다듬을 수 있는 부분" };
export type Feedback = { strengths: string[]; improvements: { kind: ImproveKind; text: string }[]; improvedAnswer: string; sufficient: boolean };
export type FeedbackInput = { stem: string; modelAnswer: string; explanation: string; evidence: string; answer: string };

const squash = (s: string) => s.replace(/[\s\p{P}\p{S}]/gu, "").toLowerCase();

export const isEmptyAnswer = (a: string) => squash(a).length === 0;

// 같은 문제·같은 답안(공백·문장부호 차이 무시)은 같은 키 → 중복 호출을 막는 데 쓴다.
export function cacheKey(questionId: string, answer: string) {
  return `${questionId}::${squash(answer)}`;
}

// 빈 답안: AI를 부르지 않고 모범답안·해설·근거에서 핵심 학습 포인트를 안내한다(새 정답 기준을 만들지 않는다).
export function emptyAnswerPoints(i: { modelAnswer: string; explanation: string; evidence: string }) {
  return [i.explanation && `해설: ${i.explanation}`, i.evidence && `교재 근거: “${i.evidence}”`, `모범답안의 핵심을 먼저 읽고, 내 말로 다시 써 보세요.`].filter(Boolean) as string[];
}

export const FEEDBACK_SYSTEM =
  "당신은 대학 수업의 서술형 답안에 보완점을 알려 주는 조교입니다. 점수나 백분율을 매기지 말고, 정답/오답으로 단정하지 마세요. " +
  "판단 기준은 주어진 '모범답안·해설·교재 근거'뿐이며, 그 밖의 새로운 정답 기준을 만들어 내지 마세요. " +
  "표현이 달라도 의미가 같으면 잘 쓴 것으로 인정하세요. 핵심 단어가 들어 있어도 문맥·관계가 틀리면 어디가 왜 틀렸는지 설명하세요. " +
  "단순한 표현 차이와 실제 개념 누락을 구분하고, 이미 충분한 답안에는 불필요한 수정을 요구하지 마세요. " +
  "출력은 JSON 객체 하나뿐이며 설명 문장이나 코드블록을 붙이지 마세요.";

export function buildFeedbackPrompt(i: FeedbackInput): string {
  return (
    `[문제]\n${i.stem}\n\n[모범답안]\n${i.modelAnswer}\n\n[해설]\n${i.explanation}\n\n[교재 근거]\n${i.evidence}\n\n[학생 답안]\n${i.answer}\n\n` +
    `규칙:\n- strengths: 모범답안과 의미가 일치하는 학생 답안의 핵심 개념(없으면 빈 배열). 각 항목은 한국어 한 문장.\n` +
    `- improvements: 보완하면 좋은 부분. 각 항목은 {"kind":"missing|unclear|wrong|wording","text":"한국어 설명"}. missing=빠진 핵심 개념, unclear=설명 부족, wrong=잘못 이해한 내용, wording=표현 개선. 충분한 답안이면 빈 배열.\n` +
    `- improvedAnswer: 학생 답안의 핵심 표현을 최대한 유지하고 필요한 부분만 고친 개선 답안. 모범답안을 그대로 옮기지 말 것. 충분한 답안이면 빈 문자열.\n` +
    `- sufficient: 핵심 내용이 정확하고 필수 수정이 없으면 true(이때 improvements는 빈 배열, improvedAnswer는 빈 문자열).\n` +
    `- 학생 답안과 모범답안의 언어를 따르되 설명은 한국어로 쓴다. 점수·등급·퍼센트는 쓰지 않는다.\n` +
    `출력 형식(JSON만): {"strengths":["..."],"improvements":[{"kind":"missing","text":"..."}],"improvedAnswer":"...","sufficient":false}`
  );
}

function extractJson(raw: string): unknown {
  const t = raw.replace(/```(?:json)?/gi, "").trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("JSON 객체를 찾을 수 없습니다.");
  return JSON.parse(t.slice(a, b + 1));
}

const KINDS: ImproveKind[] = ["missing", "unclear", "wrong", "wording"];
const SCORE = /(\d+\s*(점|%|퍼센트))|[A-F]\s*등급/;

// AI 응답 검증·정리. 형식이 크게 어긋나면 null(= 피드백 실패로 처리, 모범답안·해설 표시는 영향 없음).
export function validateFeedback(raw: string, modelAnswer: string): Feedback | null {
  let d: Record<string, unknown>;
  try {
    d = extractJson(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const strs = (v: unknown, n: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim().slice(0, 400)).slice(0, n) : []);
  const strengths = strs(d.strengths, 5).filter((s) => !SCORE.test(s));
  const improvements: Feedback["improvements"] = [];
  if (Array.isArray(d.improvements)) {
    for (const it of d.improvements.slice(0, 6)) {
      const o = (it ?? {}) as Record<string, unknown>;
      if (typeof o.text !== "string" || !o.text.trim() || SCORE.test(o.text)) continue; // 점수 표현이 섞인 항목은 버린다
      improvements.push({ kind: KINDS.includes(o.kind as ImproveKind) ? (o.kind as ImproveKind) : "unclear", text: o.text.trim().slice(0, 500) });
    }
  }
  let improved = typeof d.improvedAnswer === "string" ? d.improvedAnswer.trim().slice(0, 1200) : "";
  // 모범답안을 그대로 복사한 개선 답안은 쓰지 않는다
  const m = squash(modelAnswer);
  const im = squash(improved);
  if (im && m && (im === m || (m.length > 20 && im.length >= m.length * 0.9 && im.includes(m)))) improved = "";
  if (typeof d.sufficient !== "boolean") return null;
  // 충분하다고 하면서 보완점을 적은 모순된 응답은 '보완할 부분이 있음'으로 정리한다(보완 내용을 숨기지 않는다).
  const sufficient = d.sufficient && improvements.length === 0;
  if (sufficient) improved = "";
  if (!sufficient && improvements.length === 0 && strengths.length === 0) return null;
  return { strengths, improvements, improvedAnswer: improved, sufficient };
}
