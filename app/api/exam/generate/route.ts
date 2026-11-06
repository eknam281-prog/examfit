// 예상문제 생성 API (MVP). 키·주소·모델은 서버 환경변수에서만 읽고 클라이언트·로그에 노출하지 않는다.
// 사용자가 생성 버튼을 눌렀을 때만 호출되며, 재시도·자동 반복 호출은 하지 않는다(1요청 = 최대 1회 AI 호출).
import { guardAi } from "@/lib/apiGuard";
import { buildUserPrompt, MAX_AVOID, MAX_BATCH_QUESTIONS, MAX_ITEMS, MAX_PAGE_CHARS, MAX_STYLE_CHARS, MAX_TOTAL_CHARS, ORAL_TYPES, QUESTION_TYPES, SYSTEM_PROMPT, validateQuestions, type GenSettings, type SourceItem } from "@/lib/generate";

export const maxDuration = 60;

const fail = (status: number, error: string, message: string, extra?: object) => Response.json({ error, message, ...extra }, { status });

function parseItems(body: unknown): SourceItem[] | null {
  const items = (body as { items?: unknown })?.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) return null;
  let total = 0;
  const out: SourceItem[] = [];
  for (const it of items) {
    const { fileId, fileName, page, text } = (it ?? {}) as Record<string, unknown>;
    if (typeof fileId !== "string" || typeof fileName !== "string" || !Number.isInteger(page) || typeof text !== "string") return null;
    if (text.length > MAX_PAGE_CHARS) return null;
    total += text.length;
    out.push({ fileId, fileName, page: page as number, text });
  }
  return total > MAX_TOTAL_CHARS ? null : out;
}

// 사용자 설정(문제 유형·출제 방식). 알 수 없는 유형은 버리고 출제 방식 글자 수는 제한한다.
function parseSettings(body: unknown): GenSettings | null {
  const { types, style, count, avoid, mode } = (body ?? {}) as { types?: unknown; style?: unknown; count?: unknown; avoid?: unknown; mode?: unknown };
  if (!Number.isInteger(count) || (count as number) < 1 || (count as number) > MAX_BATCH_QUESTIONS) return null;
  const av = Array.isArray(avoid) ? avoid.filter((x): x is string => typeof x === "string").slice(-MAX_AVOID).map((x) => x.slice(0, 200)) : [];
  const oral = mode === "oral";
  const allowed = oral ? ORAL_TYPES : QUESTION_TYPES;
  const t = Array.isArray(types) ? types.filter((x): x is string => typeof x === "string" && allowed.includes(x)) : [];
  const uniq = [...new Set(t)];
  return { mode: oral ? "oral" : "written", types: oral && uniq.length === 0 ? ORAL_TYPES : uniq, style: typeof style === "string" ? style.slice(0, MAX_STYLE_CHARS) : "", count: count as number, avoid: av };
}

// 호출 수 보호: 서버 인스턴스 기준 10분에 40회까지(여러 번 눌러도 무제한 호출로 이어지지 않게 한다).
const WINDOW_MS = 10 * 60 * 1000;
const MAX_CALLS = 40;
const calls: number[] = [];
function overLimit() {
  const now = Date.now();
  while (calls.length && now - calls[0] > WINDOW_MS) calls.shift();
  if (calls.length >= MAX_CALLS) return true;
  calls.push(now);
  return false;
}

// 응답에 usage가 있을 때만 숫자 필드를 그대로 기록한다(금액은 계산하지 않음).
function pickUsage(u: unknown): Record<string, number> | undefined {
  if (!u || typeof u !== "object") return undefined;
  const out: Record<string, number> = {};
  for (const k of ["prompt_tokens", "completion_tokens", "total_tokens"]) {
    const v = (u as Record<string, unknown>)[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

export async function POST(req: Request) {
  const blocked = guardAi(req);
  if (blocked) return blocked;
  const key = process.env.FACTCHAT_API_KEY;
  const base = process.env.FACTCHAT_API_BASE_URL;
  const model = process.env.FACTCHAT_MODEL;
  const format = process.env.FACTCHAT_API_FORMAT;
  const missing = [!key && "FACTCHAT_API_KEY", !base && "FACTCHAT_API_BASE_URL", !model && "FACTCHAT_MODEL", format !== "openai-chat" && "FACTCHAT_API_FORMAT(=openai-chat)"].filter(Boolean);
  if (missing.length) return fail(503, "NOT_CONFIGURED", "AI 연결 설정이 없어 문제를 생성할 수 없습니다.", { missing });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "BAD_REQUEST", "요청 형식이 올바르지 않습니다.");
  }
  const items = parseItems(body);
  if (!items) return fail(400, "BAD_ITEMS", `자료 형식이 올바르지 않거나 상한(${MAX_ITEMS}쪽·${MAX_TOTAL_CHARS}자)을 넘었습니다.`);

  const settings = parseSettings(body);
  if (!settings) return fail(400, "BAD_COUNT", `문제 수는 1~${MAX_BATCH_QUESTIONS}의 정수여야 합니다(한 번의 AI 호출 기준).`);
  if (overLimit()) return fail(429, "RATE_LIMITED", "짧은 시간에 AI 호출이 너무 많습니다. 잠시 후 다시 시도해 주세요.");

  // 'openai-chat' 형식(FactChat 게이트웨이 문서 기준): POST {base}/chat/completions/ (끝 슬래시 포함), Bearer 인증.
  const root = base!.replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
  const url = `${root}/chat/completions/`;
  let content: string;
  let usage: Record<string, number> | undefined;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(items, settings) },
        ],
      }),
      signal: AbortSignal.timeout(55000),
    });
    if (!res.ok) return fail(502, "UPSTREAM_ERROR", `AI 서비스가 오류를 반환했습니다. (HTTP ${res.status})`);
    const json = (await res.json()) as { choices?: { message?: { content?: unknown } }[]; usage?: Record<string, unknown> };
    usage = pickUsage(json?.usage);
    const c = json?.choices?.[0]?.message?.content;
    if (typeof c !== "string" || !c.trim()) return fail(502, "EMPTY_RESPONSE", "AI 응답에서 내용을 읽을 수 없습니다.");
    content = c;
  } catch (e) {
    const timeout = (e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError";
    return fail(504, timeout ? "TIMEOUT" : "NETWORK", timeout ? "AI 응답 시간이 초과되었습니다." : "AI 서비스에 연결하지 못했습니다.");
  }

  const { valid, rejected, insufficient, parseError } = validateQuestions(content, items, settings);
  if (parseError) return fail(502, "INVALID_RESPONSE", parseError);
  if (valid.length === 0) return fail(422, "NO_VALID_QUESTIONS", insufficient.length ? `선택한 유형(${insufficient.join(", ")})을 만들 근거가 자료에 부족합니다. 다른 유형을 선택하거나 자료를 추가해 주세요.` : "검증을 통과한 문제가 없습니다. 자료를 바꾸거나 다시 시도해 주세요.", { rejected, insufficient });
  return Response.json({ questions: valid, rejected, insufficient, requested: settings.count, usage });
}
