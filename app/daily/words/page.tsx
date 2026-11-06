"use client";
import { useEffect, useRef, useState } from "react";
import { FitchapBubble } from "@/components/FitchapBubble";
import type { FitchapEvent } from "@/lib/fitchapLines";
import { Icon } from "@/components/Icons";
import { QuizRunner } from "@/components/QuizRunner";
import { StepGate } from "@/components/StepGate";
import { BackLink, Badge, btnLarge, btnPrimary, btnSecondary, Card, ProgressBar } from "@/components/ui";
import { XP_REWARD } from "@/lib/character";
import { SAMPLE_STATUS } from "@/lib/data";
import { wordQuiz, wordsLearned, type DailySession } from "@/lib/daily";
import { LEVEL_NAME } from "@/lib/placement";
import { speak, stopSpeech } from "@/lib/tts";
import { useDaily } from "@/lib/useDaily";
import { useLocalState } from "@/lib/useLocalState";

type Status = "known" | "again";

export default function WordsPage() {
  return <StepGate step="words">{({ session, update }) => <WordsFlow session={session} update={update} />}</StepGate>;
}

function WordsFlow({ session, update }: { session: DailySession; update: ReturnType<typeof useDaily>["update"] }) {
  const words = session.words;
  // 핏찹이: 학습 시작과 퀴즈 완료(처음 완료되는 순간)에만 등장
  const [fx, setFx] = useState<{ e: FitchapEvent; n: number }>({ e: "words.start", n: 0 });
  const prevDone = useRef(session.steps.words.done);
  useEffect(() => {
    if (session.steps.words.done && !prevDone.current) setFx({ e: "words.quizDone", n: Date.now() });
    prevDone.current = session.steps.words.done;
  }, [session.steps.words.done]);
  const xpDone = useRef<Set<string>>(new Set()); // 같은 단어의 연타로 인한 경험치 중복 지급 방지(전역 기록 갱신 전 재호출 대비)
  const [cards, setCards] = useState(!wordsLearned(session)); // 학습을 마쳤으면 퀴즈부터, 카드는 복습으로 다시 볼 수 있다
  const firstOpen = words.findIndex((w) => !session.steps.words.marked[w.id]);
  const [idx, setIdx] = useState(firstOpen === -1 ? 0 : firstOpen);
  const [revealed, setRevealed] = useState(false);
  const [gain, setGain] = useState(0);
  const [flash, setFlash] = useState(0);
  // 기존 단어 기록·경험치 규칙 재사용: 단어당 최초 '외웠어요' 1회만 경험치
  const [gstatus, setGStatus] = useLocalState<Record<string, Status>>("examfit.words", {});
  const [, setXp] = useLocalState("examfit.xp", SAMPLE_STATUS.xp);
  const w = words[Math.min(idx, words.length - 1)];
  const marked = words.filter((x) => session.steps.words.marked[x.id]).length;
  const learned = wordsLearned(session);
  const quiz = wordQuiz(session);

  function mark(s: Status) {
    const first = s === "known" && gstatus[w.id] !== "known" && !xpDone.current.has(w.id);
    if (first) xpDone.current.add(w.id);
    if (first) setXp((x) => x + XP_REWARD["word-reviewed"]);
    setGain(first ? XP_REWARD["word-reviewed"] : 0);
    setFlash((n) => n + 1);
    setGStatus((p) => ({ ...p, [w.id]: s }));
    update((x) => ({
      ...x,
      steps: { ...x.steps, words: { ...x.steps.words, marked: { ...x.steps.words.marked, [w.id]: s } } },
      xpLog: first ? [...x.xpLog, { kind: "word-reviewed", ref: w.id, xp: XP_REWARD["word-reviewed"], at: Date.now() }] : x.xpLog,
    }));
    setRevealed(false);
    stopSpeech();
    const next = words.findIndex((v, k) => k > idx && !session.steps.words.marked[v.id] && v.id !== w.id);
    setIdx(next === -1 ? Math.min(idx + 1, words.length - 1) : next);
  }

  return (
    <>
      <BackLink />
      <div className="mx-auto max-w-xl">
        <FitchapBubble event={fx.e} nonce={fx.n} />
        <div className="mb-3 flex items-center gap-2 text-xs text-warm">
          <Badge tone="dark">단어·표현</Badge>
          <span>
            오늘 {words.length}개 · 시작 수준 {LEVEL_NAME[session.level]}
          </span>
        </div>
        {learned && (
          <div className="mb-4 grid grid-cols-2 gap-2" role="group" aria-label="학습 방식">
            <button aria-pressed={!cards} onClick={() => setCards(false)} className={`min-h-11 rounded-2xl text-sm font-bold ${!cards ? "bg-sage-dark text-white" : "bg-sand"}`}>
              확인 퀴즈
            </button>
            <button aria-pressed={cards} onClick={() => setCards(true)} className={`min-h-11 rounded-2xl text-sm font-bold ${cards ? "bg-sage-dark text-white" : "bg-sand"}`}>
              카드 복습
            </button>
          </div>
        )}

        {!cards && learned ? (
          <QuizRunner
            title="단어 확인 퀴즈"
            questions={quiz}
            answers={session.steps.words.quiz.answers}
            onAnswer={(q, c) => update((x) => (x.steps.words.quiz.answers[q.id] !== undefined ? x : { ...x, steps: { ...x.steps, words: { ...x.steps.words, quiz: { ...x.steps.words.quiz, answers: { ...x.steps.words.quiz.answers, [q.id]: c } } } } }))}
            finishLabel={session.steps.words.done ? "듣기 학습으로" : undefined}
            onFinishHref="/daily/listening"
          />
        ) : (
          <>
            <div className="mb-4 flex items-center gap-3">
              <ProgressBar value={marked / words.length} className="flex-1" />
              <span className="text-sm font-semibold">
                학습 {marked}/{words.length}
              </span>
            </div>
            <div className="relative">
              {flash > 0 && gain > 0 && (
                <span key={flash} className="anim-float absolute -top-3 right-4 z-10 rounded-full bg-sage-dark px-3 py-1 text-sm font-bold text-white" role="status">
                  +{gain} XP
                </span>
              )}
              <Card key={w.id} className="anim-pop flex min-h-[24rem] flex-col items-center justify-between p-6 text-center md:p-8">
                <div className="flex w-full items-center justify-between text-xs text-warm">
                  <span>
                    {idx + 1} / {words.length}
                  </span>
                  {session.steps.words.marked[w.id] && <Badge tone={session.steps.words.marked[w.id] === "known" ? "sage" : "gray"}>{session.steps.words.marked[w.id] === "known" ? "외움" : "다시 보기"}</Badge>}
                </div>
                <div className="w-full">
                  <p className="text-6xl font-bold tracking-wide md:text-7xl" lang="zh">{w.hanzi}</p>
                  <p className="mt-3 text-2xl font-semibold text-sage-dark">{w.pinyin}</p>
                  <button className={`${btnSecondary} mt-3 !min-h-10`} onClick={() => speak(w.hanzi, 1)} aria-label={`${w.hanzi} 발음 듣기`}>
                    <Icon name="play" className="mr-1 h-4 w-4" fill /> 중국어 음성 듣기
                  </button>
                  {revealed ? (
                    <p className="anim-pop mt-4 text-xl font-bold">{w.ko}</p>
                  ) : (
                    <p className="mt-4 text-sm text-warm">뜻을 떠올려 본 뒤 확인하세요</p>
                  )}
                </div>
                <div className="mt-5 w-full">
                  {!revealed ? (
                    <button className={`${btnPrimary} ${btnLarge} w-full`} onClick={() => setRevealed(true)}>
                      뜻 보기
                    </button>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <button className={`${btnSecondary} ${btnLarge} gap-2 !px-3`} onClick={() => mark("again")}>
                        <Icon name="review" /> 다시 볼래요
                      </button>
                      <button className={`${btnPrimary} ${btnLarge} gap-2 !px-3`} onClick={() => mark("known")}>
                        <Icon name="check" /> 외웠어요
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <button className={btnSecondary} disabled={idx === 0} onClick={() => (setIdx(idx - 1), setRevealed(false))}>
                이전 단어
              </button>
              <button className={btnSecondary} disabled={idx >= words.length - 1} onClick={() => (setIdx(idx + 1), setRevealed(false))}>
                다음 단어
              </button>
            </div>
            {learned && (
              <button className={`${btnPrimary} ${btnLarge} mt-4 w-full`} onClick={() => setCards(false)}>
                모든 단어를 학습했어요 · 확인 퀴즈로
              </button>
            )}
            <p className="mt-3 text-center text-xs text-warm">모든 카드를 학습하고 확인 퀴즈를 끝내면 듣기가 열려요(만점이 아니어도 돼요).</p>
          </>
        )}
      </div>
    </>
  );
}
