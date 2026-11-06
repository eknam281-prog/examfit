"use client";
import { useRef, useState } from "react";
import { FitchapBubble } from "@/components/FitchapBubble";
import { QuizRunner } from "@/components/QuizRunner";
import type { FitchapEvent } from "@/lib/fitchapLines";
import { StepGate } from "@/components/StepGate";
import { BackLink, Badge, Card } from "@/components/ui";
import { XP_REWARD } from "@/lib/character";
import { SAMPLE_STATUS } from "@/lib/data";
import { listeningQuiz, type DailySession } from "@/lib/daily";
import { hasSpeech } from "@/lib/tts";
import type { useDaily } from "@/lib/useDaily";
import { useLocalState } from "@/lib/useLocalState";

// 재생 횟수와 퀴즈 정답률은 별개로 기록한다(재생 횟수는 숙달 지표가 아님). 기존 `examfit.listening` 구조를 그대로 쓴다.
type Rec = { plays: number; quizTried: number; quizCorrect: number; xpGiven?: boolean };

export default function ListeningPage() {
  return <StepGate step="listening">{({ session, update }) => <ListeningFlow session={session} update={update} />}</StepGate>;
}

function ListeningFlow({ session, update }: { session: DailySession; update: ReturnType<typeof useDaily>["update"] }) {
  const [rec, setRec] = useLocalState<Record<string, Rec>>("examfit.listening", {});
  const [, setXp] = useLocalState("examfit.xp", SAMPLE_STATUS.xp);
  const answered = useRef<Set<string>>(new Set()); // 화면이 갱신되기 전의 중복 클릭 방지
  const questions = listeningQuiz(session);
  const [fx, setFx] = useState<{ e: FitchapEvent; n: number }>({ e: "listening.start", n: 0 }); // 시작과 정답·오답에만 등장
  const key = (ref: string) => `dl-${ref}`;
  const blank: Rec = { plays: 0, quizTried: 0, quizCorrect: 0 };

  return (
    <>
      <BackLink />
      <div className="mx-auto max-w-xl">
        <FitchapBubble event={fx.e} nonce={fx.n} />
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-warm">
          <Badge tone="dark">듣기</Badge>
          <span>오늘 배운 단어 {session.words.length}개 중 {questions.length}개를 들어요</span>
        </div>
        {!hasSpeech() && <p role="alert" className="mb-3 rounded-2xl bg-sand p-3 text-sm">이 브라우저는 음성 합성을 지원하지 않아 소리를 들을 수 없어요. 문제는 풀 수 있지만 청취 학습은 어려워요.</p>}
        <QuizRunner
          title="듣기 퀴즈"
          audio
          questions={questions}
          answers={session.steps.listening.quiz.answers}
          onPlay={(q) => setRec((p) => ({ ...p, [key(q.ref)]: { ...(p[key(q.ref)] ?? blank), plays: (p[key(q.ref)]?.plays ?? 0) + 1 } }))}
          onAnswer={(q, c) => {
            if (session.steps.listening.quiz.answers[q.id] !== undefined || answered.current.has(q.id)) return;
            answered.current.add(q.id);
            const ok = c === q.answer;
            setFx({ e: ok ? "listening.correct" : "listening.wrong", n: Date.now() });
            const first = ok && !rec[key(q.ref)]?.xpGiven; // 항목당 최초 정답 1회만 경험치
            if (first) setXp((x) => x + XP_REWARD["listening-quiz-correct"]);
            setRec((p) => {
              const r = p[key(q.ref)] ?? blank;
              return { ...p, [key(q.ref)]: { ...r, quizTried: r.quizTried + 1, quizCorrect: r.quizCorrect + (ok ? 1 : 0), xpGiven: r.xpGiven || first } };
            });
            update((x) => ({
              ...x,
              steps: { ...x.steps, listening: { ...x.steps.listening, quiz: { ...x.steps.listening.quiz, answers: { ...x.steps.listening.quiz.answers, [q.id]: c } } } },
              xpLog: first ? [...x.xpLog, { kind: "listening-quiz-correct", ref: q.ref, xp: XP_REWARD["listening-quiz-correct"], at: Date.now() }] : x.xpLog,
            }));
          }}
          finishLabel={session.steps.listening.done ? "회화 학습으로" : undefined}
          onFinishHref="/daily/speaking"
        />
        <Card tone="soft" className="mt-4 text-xs text-warm">
          브라우저 내장 음성(TTS)이라 원어민 녹음이 아니고 성조·다음자 발음이 어색할 수 있어요. 속도 조절 효과도 기기마다 달라요. 모든 문제에 답하면 회화가 열려요(만점이 아니어도 돼요).
        </Card>
      </div>
    </>
  );
}
