"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";
import { btnSecondary } from "./ui";
import type { FitchapEvent } from "@/lib/fitchapLines";
import { compareSpeech, type SpeechCompare } from "@/lib/speechCompare";
import { SR_ERROR_TEXT, useSpeechRecognition, type SrError } from "@/lib/speechRecognition";
import { speak } from "@/lib/tts";

type Result = { heard: string; cmp: SpeechCompare } | { error: SrError };

const VERDICT_TEXT = {
  exact: "목표 문장과 인식된 문장이 일치했어요!",
  close: "거의 일치해요. 아래 차이를 보고 한 번 더 말해 보세요.",
  different: "목표 문장과 다르게 인식됐어요. 다른 표현으로 말했거나 인식이 달랐을 수 있어요.",
  empty: "인식된 문장이 없어요.",
} as const;

const SEG_CLASS = { match: "bg-sage-soft", missing: "bg-white ring-1 ring-charcoal/30 line-through decoration-charcoal/50", replaced: "bg-sand ring-1 ring-charcoal/25", extra: "bg-sand/70 italic" } as const;

// 따라 말하기: 마이크로 말한 문장을 중국어로 인식해 목표 문장과 비교한다. 발음·성조 점수는 만들지 않는다.
// 인식 실패·마이크 거부는 틀린 것으로 처리하지 않으며, 언제든 다시 시도하거나 '평가 없이 학습 완료'를 고를 수 있다.
export function SpeakPractice({ zh, status, onSuccess, onSkip, onFx }: { zh: string; status?: "ok" | "skipped"; onSuccess: () => void; onSkip: () => void; onFx: (e: FitchapEvent) => void }) {
  const sr = useSpeechRecognition();
  const [result, setResult] = useState<Result | null>(null);
  const cb = useRef({ onSuccess, onFx });
  cb.current = { onSuccess, onFx };
  const wasListening = useRef(false);

  // 녹음 시작 시 핏찹이
  useEffect(() => {
    if (sr.listening && !wasListening.current) cb.current.onFx("speak.start");
    wasListening.current = sr.listening;
  }, [sr.listening]);

  // 인식 결과 처리
  useEffect(() => {
    const o = sr.outcome;
    if (!o) return;
    if ("error" in o) {
      setResult({ error: o.error });
      cb.current.onFx("speak.fail");
      return;
    }
    const cmp = compareSpeech(zh, o.text);
    setResult({ heard: o.text, cmp });
    if (cmp.verdict === "exact") {
      cb.current.onFx("speak.ok");
      cb.current.onSuccess();
    } else cb.current.onFx(cmp.verdict === "empty" ? "speak.fail" : "speak.retry");
  }, [sr.outcome, zh]);

  return (
    <div className="mt-4 rounded-2xl bg-sand p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold">따라 말하기 연습</p>
        {status === "ok" && <span className="rounded-full bg-sage-soft px-2.5 py-0.5 text-xs font-semibold">말하기 인식 성공</span>}
        {status === "skipped" && <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-warm">평가 없이 완료</span>}
      </div>
      <p className="mt-1 text-xs text-warm">① 문장을 듣고 ② 마이크로 따라 말하면 인식된 문장을 목표와 비교해 줘요. 마이크 없이도 ③으로 학습을 완료할 수 있어요.</p>

      <div className="mt-2 flex flex-wrap gap-2">
        <button className={`${btnSecondary} !min-h-10`} onClick={() => speak(zh, 1)}>
          <Icon name="play" className="mr-1 h-4 w-4" fill /> ① 듣기
        </button>
        <button className={`${btnSecondary} !min-h-10`} onClick={() => speak(zh, 0.75)}>
          천천히 듣기
        </button>
        <button
          onClick={() => (setResult(null), sr.toggle())}
          disabled={!sr.supported}
          aria-pressed={sr.listening}
          className={`inline-flex min-h-10 items-center rounded-2xl px-4 text-sm font-semibold ${sr.listening ? "bg-charcoal text-white" : "bg-white"} disabled:opacity-50`}
        >
          <Icon name="speaking" className="mr-1 h-4 w-4" /> {sr.listening ? "말하기 끝내기" : "② 말하기 시작"}
        </button>
      </div>

      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-xs font-medium">
        {!sr.supported ? "이 브라우저는 음성 인식을 지원하지 않아요(Chrome·Edge·Safari 등에서 사용할 수 있어요). ③ 평가 없이 학습 완료는 쓸 수 있어요." : sr.listening ? "● 듣고 있어요. 문장을 말하고, 끝나면 버튼을 다시 눌러 주세요." : ""}
      </p>

      {result && "error" in result && (
        <p role="alert" className="mt-1 rounded-xl bg-white p-2 text-xs font-medium">
          ⚠ {SR_ERROR_TEXT[result.error]}
        </p>
      )}

      {result && "heard" in result && (
        <div className="anim-pop mt-2 rounded-xl bg-white p-3 text-xs">
          <p className="font-bold">{VERDICT_TEXT[result.cmp.verdict]}</p>
          <dl className="mt-2 space-y-1">
            <div>
              <dt className="text-warm">목표 문장</dt>
              <dd className="break-words text-base font-semibold" lang="zh">{zh}</dd>
            </div>
            <div>
              <dt className="text-warm">인식된 문장</dt>
              <dd className="break-words text-base font-semibold" lang="zh">{result.heard}</dd>
            </div>
          </dl>
          {result.cmp.segments.length > 0 && (
            <>
              <p className="mt-2 text-warm">글자 비교(구두점·공백은 무시, 번체는 간체로 맞춰 비교)</p>
              <p className="mt-1 flex flex-wrap gap-1" lang="zh">
                {result.cmp.segments.map((sg, i) => (
                  <span key={i} className={`rounded-md px-1.5 py-0.5 text-sm font-semibold ${SEG_CLASS[sg.kind]}`} title={sg.kind === "match" ? "일치" : sg.kind === "missing" ? "빠진 표현" : sg.kind === "replaced" ? "다르게 인식" : "추가로 인식"}>
                    {sg.kind === "extra" ? sg.heard : sg.kind === "replaced" ? `${sg.target}→${sg.heard}` : sg.target}
                  </span>
                ))}
              </p>
              <p className="mt-1 text-warm">초록=일치 · 취소선=빠진 표현 · 화살표=다르게 인식 · 기울임=추가로 인식 · 일치 {result.cmp.matched}/{result.cmp.targetLen}글자</p>
            </>
          )}
          {result.cmp.tips.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-4">
              {result.cmp.tips.map((t) => (
                <li key={t} className="break-words">
                  {t}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-warm">음성 인식 결과를 글자로 비교한 것이에요. 발음·성조의 정확도 점수는 아니에요. 비슷한 소리가 같은 글자로 적힐 수 있어 일치해도 발음이 완벽하다는 뜻은 아니고, 인식 오류로 다르게 보일 수도 있어요.</p>
          {result.cmp.verdict !== "exact" && (
            <button className={`${btnSecondary} mt-2 !min-h-9 text-xs`} onClick={() => setResult(null)}>
              다시 말해 보기
            </button>
          )}
        </div>
      )}

      <div className="mt-2">
        <button className="min-h-10 text-xs font-semibold text-warm underline" onClick={onSkip}>
          ③ 평가 없이 학습 완료
        </button>
        <span className="ml-1 text-[11px] text-warm">(말하기 성공으로 기록되지 않아요)</span>
      </div>
      <p className="mt-1 text-[11px] text-warm">음성 인식은 브라우저 기능을 써요. Chrome 계열은 인식을 위해 음성이 제공사 서버로 전송될 수 있어요. 녹음 파일은 저장하지 않아요.</p>
    </div>
  );
}
