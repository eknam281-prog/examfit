"use client";
import { useState } from "react";
import { btnSecondary } from "./ui";
import { cacheKey, emptyAnswerPoints, isEmptyAnswer, KIND_LABEL, SUFFICIENT_TEXT, type Feedback, type FeedbackInput } from "@/lib/feedback";

// 같은 문제·같은 답안에 대한 결과는 이 화면을 보는 동안 다시 요청하지 않고 재사용한다(중복 호출 방지).
const cache = new Map<string, Feedback>();

type State = { phase: "idle" } | { phase: "loading" } | { phase: "error"; message: string };

// 서술형 보완 피드백(점수 없음). 모범답안·해설·출처 표시는 이 컴포넌트 밖에서 그대로 유지되고, 실패해도 영향받지 않는다.
export function AnswerFeedback({ questionId, input }: { questionId: string; input: FeedbackInput }) {
  const key = cacheKey(questionId, input.answer);
  const [state, setState] = useState<State>({ phase: "idle" });
  const [, bump] = useState(0);
  const data = cache.get(key);

  // 빈 답안: AI를 호출하지 않고 핵심 학습 포인트만 안내한다.
  if (isEmptyAnswer(input.answer)) {
    return (
      <div className="mt-3 rounded-2xl bg-white/70 p-3 text-sm">
        <p className="font-bold">답안을 작성하지 않았어요</p>
        <p className="mt-1 text-xs text-warm">위 모범답안을 읽고 핵심 학습 포인트를 확인해 보세요.</p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
          {emptyAnswerPoints(input).map((p) => (
            <li key={p} className="break-words">
              {p}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  async function request() {
    if (state.phase === "loading" || cache.has(key)) return; // 진행 중이거나 이미 받은 답안이면 다시 호출하지 않는다
    setState({ phase: "loading" });
    try {
      const res = await fetch("/api/exam/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const d = (await res.json().catch(() => ({}))) as { feedback?: Feedback; message?: string; missing?: string[] };
      if (!res.ok || !d.feedback) {
        const miss = d.missing?.length ? ` 필요한 서버 설정: ${d.missing.join(", ")}` : "";
        throw new Error(`${d.message ?? "피드백을 만들지 못했어요."}${miss}`);
      }
      cache.set(key, d.feedback);
      setState({ phase: "idle" });
      bump((n) => n + 1);
    } catch (e) {
      setState({ phase: "error", message: (e as Error).message || "피드백을 만들지 못했어요." });
    }
  }

  if (!data) {
    return (
      <div className="mt-3 rounded-2xl bg-white/70 p-3 text-sm">
        <p className="font-bold">내 답안 보완 피드백</p>
        <p className="mt-1 text-xs text-warm">AI가 내 답안에서 잘 쓴 부분과 보완하면 좋은 부분을 알려 줘요. 점수는 매기지 않아요. 누르면 AI를 1회 호출하며 크레딧이 사용될 수 있어요(정확한 비용은 알 수 없어요).</p>
        <button className={`${btnSecondary} mt-2 !min-h-10 text-xs`} disabled={state.phase === "loading"} onClick={() => void request()}>
          {state.phase === "loading" ? "분석 중…" : state.phase === "error" ? "다시 시도" : "보완 피드백 받기"}
        </button>
        {state.phase === "error" && (
          <p role="alert" className="mt-2 rounded-xl bg-sand p-2 text-xs font-medium">
            ⚠ {state.message} 모범답안과 해설은 위에 그대로 있어요.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3 text-sm">
      <div className="rounded-2xl bg-white/70 p-3">
        <p className="font-bold">잘 작성한 부분</p>
        {data.strengths.length > 0 ? (
          <ul className="mt-1 list-disc space-y-1 pl-4 text-xs">
            {data.strengths.map((s) => (
              <li key={s} className="break-words">
                {s}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-warm">모범답안과 의미가 겹치는 핵심 개념을 찾지 못했어요.</p>
        )}
      </div>

      <div className="rounded-2xl bg-white/70 p-3">
        <p className="font-bold">보완할 부분</p>
        {data.sufficient ? (
          <p className="mt-1 text-xs">{SUFFICIENT_TEXT}</p>
        ) : (
          <ul className="mt-1 space-y-1.5 text-xs">
            {data.improvements.map((it, k) => (
              <li key={k} className="rounded-xl bg-sand p-2">
                <span className="font-semibold">{KIND_LABEL[it.kind]}</span>
                <span className="block break-words text-warm">{it.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!data.sufficient && data.improvedAnswer && (
        <div className="rounded-2xl bg-white/70 p-3">
          <p className="font-bold">개선 답안 예시</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-xs">{data.improvedAnswer}</p>
          <p className="mt-1 text-[11px] text-warm">내 답안의 표현을 살려 필요한 부분만 고친 예시예요. 모범답안과 다를 수 있어요.</p>
        </div>
      )}
      <p className="text-[11px] text-warm">AI가 모범답안·해설·교재 근거를 바탕으로 만든 참고용 안내예요. 점수나 합격 여부가 아니에요.</p>
    </div>
  );
}
