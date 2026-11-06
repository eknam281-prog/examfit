// 크레딧을 쓰는 서버 API(문제 생성·서술형 피드백·OCR·음성 세션)의 공개 배포 보호.
// 1) EXAMFIT_AI_ENABLED=true 일 때만 동작한다(기본값은 꺼짐: 환경변수를 켜지 않으면 AI 호출·크레딧 소모가 없다).
// 2) 다른 사이트에서 온 브라우저 요청(Origin/Sec-Fetch-Site 불일치)은 거부한다. 이것만으로 직접 호출(curl 등)을 막지는 못하므로
//    공개 배포에서는 AI 기능을 켠 기간에만 EXAMFIT_AI_ENABLED를 켜고, 호스팅 쪽 사용량 한도를 함께 설정해야 한다.
export function guardAi(req: Request): Response | null {
  if (process.env.EXAMFIT_AI_ENABLED !== "true") {
    return Response.json({ error: "AI_DISABLED", message: "이 환경에서는 AI 기능이 꺼져 있어요(EXAMFIT_AI_ENABLED가 켜져 있지 않아요)." }, { status: 503 });
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const origin = req.headers.get("origin");
  if (origin) {
    let ok = false;
    try {
      ok = new URL(origin).host === host;
    } catch {
      ok = false;
    }
    if (!ok) return Response.json({ error: "FORBIDDEN_ORIGIN", message: "허용되지 않은 요청이에요." }, { status: 403 });
  }
  const site = req.headers.get("sec-fetch-site");
  if (site && !["same-origin", "same-site", "none"].includes(site)) return Response.json({ error: "FORBIDDEN_ORIGIN", message: "허용되지 않은 요청이에요." }, { status: 403 });
  return null;
}
