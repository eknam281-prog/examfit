// AI 구술시험 음성 세션 토큰 발급(서버 전용). 사용자가 '말하기 시험 시작'을 눌렀을 때만 호출된다.
// FactChat 게이트웨이 문서 기준: POST {base}/realtime/sessions/ {model} → 60초 유효·1회용 token, 브라우저는 token으로 WebSocket에 연결한다.
// 텍스트 생성 설정(FACTCHAT_MODEL)과 별개로 FACTCHAT_REALTIME_MODEL을 사용하며, API 키는 응답에 포함하지 않는다.
import { guardAi } from "@/lib/apiGuard";

const fail = (status: number, error: string, message: string, extra?: object) => Response.json({ error, message, ...extra }, { status });

// 세션 발급 남용 방지: 서버 인스턴스 기준 10분에 6회
const WINDOW_MS = 10 * 60 * 1000;
const MAX_SESSIONS = 6;
const issued: number[] = [];

export async function POST(req: Request) {
  const blocked = guardAi(req);
  if (blocked) return blocked;
  const key = process.env.FACTCHAT_API_KEY;
  const base = process.env.FACTCHAT_API_BASE_URL;
  const model = process.env.FACTCHAT_REALTIME_MODEL;
  const missing = [!key && "FACTCHAT_API_KEY", !base && "FACTCHAT_API_BASE_URL", !model && "FACTCHAT_REALTIME_MODEL"].filter(Boolean);
  if (missing.length) return fail(503, "NOT_CONFIGURED", "음성 세션 설정이 없어 시험을 시작할 수 없습니다.", { missing });

  const now = Date.now();
  while (issued.length && now - issued[0] > WINDOW_MS) issued.shift();
  if (issued.length >= MAX_SESSIONS) return fail(429, "RATE_LIMITED", "음성 세션을 너무 자주 시작했어요. 잠시 후 다시 시도해 주세요.");
  issued.push(now);

  const root = base!.replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
  try {
    const res = await fetch(`${root}/realtime/sessions/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const hint = res.status === 400 || res.status === 403 ? " 이 모델이 조직에서 활성화되어 있는지 확인해 주세요." : "";
      return fail(502, "UPSTREAM_ERROR", `음성 세션을 만들지 못했습니다. (HTTP ${res.status})${hint}`);
    }
    const d = (await res.json()) as { token?: unknown; expires_at?: unknown; model?: unknown; url?: unknown };
    if (typeof d.token !== "string" || !d.token) return fail(502, "BAD_RESPONSE", "음성 세션 응답에서 토큰을 읽을 수 없습니다.");
    // 게이트웨이가 준 주소는 같은 호스트의 wss만 허용하고, 없으면 문서에 적힌 형식으로 만든다.
    const host = new URL(root).host;
    let wss = `wss://${host}${new URL(root).pathname.replace(/\/+$/, "")}/realtime?model=${encodeURIComponent(String(d.model ?? model))}`;
    if (typeof d.url === "string") {
      try {
        const u = new URL(d.url);
        if (u.protocol === "wss:" && u.host === host) wss = u.toString();
      } catch {
        /* 잘못된 url은 무시하고 기본 형식 사용 */
      }
    }
    const sep = wss.includes("?") ? "&" : "?";
    return Response.json({ url: `${wss}${sep}token=${encodeURIComponent(d.token)}`, expiresAt: d.expires_at ?? null, model: d.model ?? model });
  } catch (e) {
    const timeout = (e as Error)?.name === "TimeoutError";
    return fail(504, timeout ? "TIMEOUT" : "NETWORK", timeout ? "음성 세션 요청 시간이 초과되었습니다." : "음성 서비스에 연결하지 못했습니다.");
  }
}
