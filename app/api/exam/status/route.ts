// 화면에 기능 상태를 알리기 위한 읽기 전용 엔드포인트. 비밀값 없이 켜짐/꺼짐만 돌려준다(AI 호출·크레딧 사용 없음).
export const dynamic = "force-dynamic";

export function GET() {
  const ai = process.env.EXAMFIT_AI_ENABLED === "true";
  return Response.json({ ai, oral: ai && process.env.EXAMFIT_ORAL_ENABLED === "true" });
}
