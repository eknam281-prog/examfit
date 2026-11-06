// 스캔 페이지 비전 OCR (서버 전용). 사용자가 OCR 시작을 승인한 뒤 페이지당 1회만 호출된다. 재시도·자동 반복 없음.
// 기존 FactChat 인증(FACTCHAT_API_KEY/BASE_URL)을 재사용하고, 모델은 FACTCHAT_VISION_MODEL(기존 텍스트 모델 설정과 별개)을 쓴다.
import { guardAi } from "@/lib/apiGuard";

export const maxDuration = 60;

const fail = (status: number, error: string, message: string, extra?: object) => Response.json({ error, message, ...extra }, { status });
const MAX_B64 = 8_000_000; // 약 6MB 이미지
const WINDOW_MS = 10 * 60 * 1000;
const MAX_CALLS = 80;
const calls: number[] = [];

const PROMPT =
  "이 이미지는 중국어 교재의 스캔 페이지입니다. 보이는 글자를 그대로 옮겨 적으세요.\n" +
  "- 회화문: 화자 표시(服务员/顾客 등), 한자, 병음(성조 부호 포함), 한국어를 원본 순서대로 적는다.\n" +
  "- 단어 목록: 한 행을 `한자 | 병음(성조 포함) | 품사 | 한국어 뜻` 형식으로 같은 줄에 묶고, 2단이면 왼쪽 단을 먼저 적는다.\n" +
  "- 손글씨·형광펜 주석·체크 표시는 [필기: ...]로 인쇄 원문과 구분한다.\n" +
  "- 보이지 않거나 불확실한 글자는 추측하지 말고 [불명확]으로 표시한다. 내용을 보충·번역·요약하지 않는다.\n" +
  "- 설명 문장 없이 옮겨 적은 내용만 출력한다.";

export async function POST(req: Request) {
  const blocked = guardAi(req);
  if (blocked) return blocked;
  const key = process.env.FACTCHAT_API_KEY;
  const base = process.env.FACTCHAT_API_BASE_URL;
  const model = process.env.FACTCHAT_VISION_MODEL;
  const missing = [!key && "FACTCHAT_API_KEY", !base && "FACTCHAT_API_BASE_URL", !model && "FACTCHAT_VISION_MODEL"].filter(Boolean);
  if (missing.length) return fail(503, "NOT_CONFIGURED", "비전 OCR 설정이 없어 인식할 수 없습니다.", { missing });

  let body: { image?: unknown; fileName?: unknown; page?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "BAD_REQUEST", "요청 형식이 올바르지 않습니다.");
  }
  const { image } = body;
  if (typeof image !== "string" || image.length < 100 || image.length > MAX_B64 || !/^[A-Za-z0-9+/=]+$/.test(image)) return fail(400, "BAD_IMAGE", "이미지 형식이 올바르지 않거나 너무 큽니다.");

  const now = Date.now();
  while (calls.length && now - calls[0] > WINDOW_MS) calls.shift();
  if (calls.length >= MAX_CALLS) return fail(429, "RATE_LIMITED", "짧은 시간에 OCR 호출이 너무 많습니다. 잠시 후 다시 시도해 주세요.");
  calls.push(now);

  const root = base!.replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
  try {
    const res = await fetch(`${root}/chat/completions/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 4000,
        messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: `data:image/png;base64,${image}` } }] }],
      }),
      signal: AbortSignal.timeout(55000),
    });
    if (!res.ok) return fail(502, "UPSTREAM_ERROR", `AI 서비스가 오류를 반환했습니다. (HTTP ${res.status})`);
    const j = (await res.json()) as { choices?: { message?: { content?: unknown } }[]; usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } };
    const text = j?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) return fail(502, "EMPTY_RESPONSE", "이미지에서 읽은 내용을 받지 못했습니다.");
    const u = j.usage;
    const usage = u && typeof u.prompt_tokens === "number" && typeof u.completion_tokens === "number" ? { input: u.prompt_tokens, output: u.completion_tokens } : undefined;
    return Response.json({ text, usage });
  } catch (e) {
    const timeout = (e as Error)?.name === "TimeoutError";
    return fail(504, timeout ? "TIMEOUT" : "NETWORK", timeout ? "OCR 응답 시간이 초과되었습니다." : "AI 서비스에 연결하지 못했습니다.");
  }
}
