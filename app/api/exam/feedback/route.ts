// 서술형 답안 보완 피드백(서버 전용). 사용자가 '피드백 받기'를 눌렀을 때만 호출되며, 요청 1회 = AI 호출 최대 1회(재시도 없음).
// 기존 FactChat 텍스트 모델 설정(FACTCHAT_*)을 그대로 재사용한다. 키·주소는 응답이나 로그에 포함하지 않는다.
import { guardAi } from "@/lib/apiGuard";
import { buildFeedbackPrompt, FEEDBACK_SYSTEM, isEmptyAnswer, MAX_ANSWER_CHARS, MAX_FIELD_CHARS, validateFeedback } from "@/lib/feedback";

export const maxDuration = 60;

const fail = (status: number, error: string, message: string, extra?: object) => Response.json({ error, message, ...extra }, { status });

// 호출 수 보호: 서버 인스턴스 기준 10분에 30회
const WINDOW_MS = 10 * 60 * 1000;
const MAX_CALLS = 30;
const calls: number[] = [];

export async function POST(req: Request) {
  const blocked = guardAi(req);
  if (blocked) return blocked;
  const key = process.env.FACTCHAT_API_KEY;
  const base = process.env.FACTCHAT_API_BASE_URL;
  const model = process.env.FACTCHAT_MODEL;
  const missing = [!key && "FACTCHAT_API_KEY", !base && "FACTCHAT_API_BASE_URL", !model && "FACTCHAT_MODEL"].filter(Boolean);
  if (missing.length) return fail(503, "NOT_CONFIGURED", "AI 연결 설정이 없어 보완 피드백을 만들 수 없습니다.", { missing });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail(400, "BAD_REQUEST", "요청 형식이 올바르지 않습니다.");
  }
  const f = (k: string, max = MAX_FIELD_CHARS) => (typeof body[k] === "string" ? (body[k] as string).trim() : null) && (body[k] as string).trim().length <= max ? (body[k] as string).trim() : null;
  const stem = f("stem");
  const modelAnswer = f("modelAnswer");
  const explanation = typeof body.explanation === "string" ? body.explanation.trim().slice(0, MAX_FIELD_CHARS) : "";
  const evidence = typeof body.evidence === "string" ? body.evidence.trim().slice(0, MAX_FIELD_CHARS) : "";
  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  if (!stem || !modelAnswer) return fail(400, "BAD_INPUT", "문제와 모범답안이 필요합니다.");
  if (answer.length > MAX_ANSWER_CHARS) return fail(400, "ANSWER_TOO_LONG", `답안은 ${MAX_ANSWER_CHARS}자까지 피드백할 수 있어요.`);
  // 빈 답안에는 AI를 호출하지 않는다(비용 보호).
  if (isEmptyAnswer(answer)) return fail(400, "EMPTY_ANSWER", "답안이 비어 있어 피드백을 요청하지 않았어요.");

  const now = Date.now();
  while (calls.length && now - calls[0] > WINDOW_MS) calls.shift();
  if (calls.length >= MAX_CALLS) return fail(429, "RATE_LIMITED", "짧은 시간에 피드백 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.");
  calls.push(now);

  const root = base!.replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
  try {
    const res = await fetch(`${root}/chat/completions/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: FEEDBACK_SYSTEM },
          { role: "user", content: buildFeedbackPrompt({ stem, modelAnswer, explanation, evidence, answer }) },
        ],
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) return fail(502, "UPSTREAM_ERROR", `AI 서비스가 오류를 반환했습니다. (HTTP ${res.status})`);
    const j = (await res.json()) as { choices?: { message?: { content?: unknown } }[]; usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } };
    const c = j?.choices?.[0]?.message?.content;
    if (typeof c !== "string" || !c.trim()) return fail(502, "EMPTY_RESPONSE", "AI 응답에서 내용을 읽을 수 없습니다.");
    const feedback = validateFeedback(c, modelAnswer);
    if (!feedback) return fail(502, "INVALID_RESPONSE", "AI 응답 형식이 올바르지 않아 피드백을 표시하지 않았어요.");
    const u = j.usage;
    const usage = u && typeof u.prompt_tokens === "number" && typeof u.completion_tokens === "number" ? { input: u.prompt_tokens, output: u.completion_tokens } : undefined;
    return Response.json({ feedback, usage });
  } catch (e) {
    const timeout = (e as Error)?.name === "TimeoutError";
    return fail(504, timeout ? "TIMEOUT" : "NETWORK", timeout ? "AI 응답 시간이 초과되었습니다." : "AI 서비스에 연결하지 못했습니다.");
  }
}
