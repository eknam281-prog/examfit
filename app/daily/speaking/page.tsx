"use client";
import { useEffect, useRef, useState } from "react";
import { FitchapBubble } from "@/components/FitchapBubble";
import type { FitchapEvent } from "@/lib/fitchapLines";
import { Icon } from "@/components/Icons";
import { QuizRunner } from "@/components/QuizRunner";
import { SpeakPractice } from "@/components/SpeakPractice";
import { StepGate } from "@/components/StepGate";
import { BackLink, Badge, btnLarge, btnPrimary, btnSecondary, Card, ProgressBar } from "@/components/ui";
import { sentencesOf, sentencesStudied, speakingQuiz, type DailySession } from "@/lib/daily";
import { TOPICS } from "@/lib/dailyData";
import { LEVEL_NAME } from "@/lib/placement";
import { speak, stopSpeech } from "@/lib/tts";
import type { useDaily } from "@/lib/useDaily";

export default function SpeakingPage() {
  return <StepGate step="speaking">{({ session, update }) => <SpeakingFlow session={session} update={update} />}</StepGate>;
}

// 회화 = 주제별 문장을 배우고 암기하는 학습(자유 AI 대화 아님). 학습한 문장을 모두 배운 뒤, 같은 수의 최종 퀴즈로 복습한다.
function SpeakingFlow({ session, update }: { session: DailySession; update: ReturnType<typeof useDaily>["update"] }) {
  const sents = sentencesOf(session);
  const [fx, setFx] = useState<{ e: FitchapEvent; n: number }>({ e: "speaking.start", n: 0 });
  const prevDone = useRef(session.steps.speaking.done);
  useEffect(() => {
    if (session.steps.speaking.done && !prevDone.current) setFx({ e: "speaking.quizDone", n: Date.now() });
    prevDone.current = session.steps.speaking.done;
  }, [session.steps.speaking.done]);
  const studied = session.steps.speaking.studied;
  const allStudied = sentencesStudied(session);
  const [study, setStudy] = useState(!allStudied);
  const firstOpen = sents.findIndex((s) => !studied.includes(s.id));
  const [idx, setIdx] = useState(firstOpen === -1 ? 0 : firstOpen);
  const [hidePinyin, setHidePinyin] = useState(false);
  const [hideKo, setHideKo] = useState(false);
  const [shadowed, setShadowed] = useState(false);
  const s = sents[Math.min(idx, sents.length - 1)];
  const quiz = speakingQuiz(session);
  const topicLabel = session.topic === "all" ? "전체 주제" : TOPICS.find((t) => t.id === session.topic)?.label;

  // 말하기 인식 성공은 'ok'로만 기록하고, 평가 없이 완료한 문장은 'skipped'로 따로 기록한다(성공으로 세지 않음).
  const setSpoken = (id: string, v: "ok" | "skipped") =>
    update((x) => (x.steps.speaking.spoken?.[id] === "ok" ? x : { ...x, steps: { ...x.steps, speaking: { ...x.steps.speaking, spoken: { ...(x.steps.speaking.spoken ?? {}), [id]: v } } } }));

  function next() {
    update((x) => (x.steps.speaking.studied.includes(s.id) ? x : { ...x, steps: { ...x.steps, speaking: { ...x.steps.speaking, studied: [...x.steps.speaking.studied, s.id] } } }));
    setShadowed(false);
    stopSpeech();
    if (idx < sents.length - 1) setIdx(idx + 1);
  }

  return (
    <>
      <BackLink />
      <div className="mx-auto max-w-xl">
        <FitchapBubble event={fx.e} nonce={fx.n} />
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-warm">
          <Badge tone="dark">회화</Badge>
          <span>
            {topicLabel} · {LEVEL_NAME[session.level]} · 문장 {sents.length}개
          </span>
        </div>
        {allStudied && (
          <div className="mb-4 grid grid-cols-2 gap-2" role="group" aria-label="학습 방식">
            <button aria-pressed={!study} onClick={() => setStudy(false)} className={`min-h-11 rounded-2xl text-sm font-bold ${!study ? "bg-sage-dark text-white" : "bg-sand"}`}>
              최종 퀴즈 {quiz.length}문제
            </button>
            <button aria-pressed={study} onClick={() => setStudy(true)} className={`min-h-11 rounded-2xl text-sm font-bold ${study ? "bg-sage-dark text-white" : "bg-sand"}`}>
              문장 복습
            </button>
          </div>
        )}

        {!study && allStudied ? (
          <QuizRunner
            title="회화 최종 퀴즈"
            questions={quiz}
            answers={session.steps.speaking.quiz.answers}
            audio
            onAnswer={(q, c) => update((x) => (x.steps.speaking.quiz.answers[q.id] !== undefined ? x : { ...x, steps: { ...x.steps, speaking: { ...x.steps.speaking, quiz: { ...x.steps.speaking.quiz, answers: { ...x.steps.speaking.quiz.answers, [q.id]: c } } } } }))}
            finishLabel={session.steps.speaking.done ? "한자 쓰기로" : undefined}
            onFinishHref="/daily/writing"
          />
        ) : (
          <>
            <div className="mb-4 flex items-center gap-3">
              <ProgressBar value={studied.length / sents.length} className="flex-1" />
              <span className="text-sm font-semibold">
                학습 {studied.length}/{sents.length}
              </span>
            </div>
            <Card key={s.id} className="anim-pop p-6">
              <div className="flex items-center justify-between text-xs text-warm">
                <span>
                  {idx + 1} / {sents.length}
                </span>
                {studied.includes(s.id) && <Badge>학습함</Badge>}
              </div>
              <p className="mt-4 text-3xl font-bold leading-snug" lang="zh">{s.zh}</p>
              <p className={`mt-2 text-base font-medium text-sage-dark ${hidePinyin ? "invisible" : ""}`} aria-hidden={hidePinyin}>{s.pinyin}</p>
              <p className={`mt-1 text-sm ${hideKo ? "invisible" : ""}`} aria-hidden={hideKo}>{s.ko}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button role="switch" aria-checked={hidePinyin} onClick={() => setHidePinyin(!hidePinyin)} className={`min-h-9 rounded-full px-3.5 text-sm font-semibold ${hidePinyin ? "bg-sage-dark text-white" : "bg-sand"}`}>
                  병음 숨기기
                </button>
                <button role="switch" aria-checked={hideKo} onClick={() => setHideKo(!hideKo)} className={`min-h-9 rounded-full px-3.5 text-sm font-semibold ${hideKo ? "bg-sage-dark text-white" : "bg-sand"}`}>
                  한국어 뜻 숨기기
                </button>
              </div>
              <SpeakPractice
                key={s.id}
                zh={s.zh}
                status={session.steps.speaking.spoken?.[s.id]}
                onSuccess={() => (setShadowed(true), setSpoken(s.id, "ok"))}
                onSkip={() => (setSpoken(s.id, "skipped"), next())}
                onFx={(e) => setFx({ e, n: Date.now() })}
              />
              <div className="mt-4 flex items-center justify-between gap-2">
                <button className={btnSecondary} disabled={idx === 0} onClick={() => (setIdx(idx - 1), setShadowed(false))}>
                  이전 문장
                </button>
                <button className={btnPrimary} disabled={!shadowed && !studied.includes(s.id)} onClick={next}>
                  {idx < sents.length - 1 ? "학습 완료 · 다음 문장" : "학습 완료"}
                </button>
              </div>
            </Card>
            {allStudied && (
              <button className={`${btnPrimary} ${btnLarge} mt-4 w-full`} onClick={() => setStudy(false)}>
                모든 문장을 배웠어요 · 최종 퀴즈로
              </button>
            )}
            <p className="mt-3 text-center text-xs text-warm">문장은 오늘 배운 단어를 사용해요. 모든 문장을 학습하고 같은 수의 최종 퀴즈를 마치면 한자 쓰기가 열려요(만점이 아니어도 돼요).</p>
          </>
        )}
      </div>
    </>
  );
}
