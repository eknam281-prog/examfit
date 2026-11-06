"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";
import { Badge, btnLarge, btnPrimary, btnSecondary, Card, choiceClass, ProgressBar } from "./ui";
import type { Question } from "@/lib/daily";
import { speak, stopSpeech } from "@/lib/tts";

const RATES = [0.75, 1, 1.25];

// 한 문제씩 푸는 공통 퀴즈. 이미 응답한 문제는 바꿀 수 없고(같은 답 중복 제출 방지), 모두 응답하면 결과를 보여 준다. 만점은 요구하지 않는다.
export function QuizRunner({ title, questions, answers, onAnswer, audio = false, onPlay, finishLabel, onFinishHref }: {
  title: string;
  questions: Question[];
  answers: Record<string, number>;
  onAnswer: (q: Question, choice: number) => void;
  audio?: boolean;
  onPlay?: (q: Question) => void;
  finishLabel?: string;
  onFinishHref?: string;
}) {
  const firstOpen = questions.findIndex((q) => answers[q.id] === undefined);
  const [i, setI] = useState(firstOpen === -1 ? 0 : firstOpen);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(false);
  const [playing, setPlaying] = useState(false);
  const loopRef = useRef(loop);
  loopRef.current = loop;
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const finished = firstOpen === -1;
  const [review, setReview] = useState(false);
  const q = questions[Math.min(i, questions.length - 1)];

  useEffect(() => () => stopSpeech(), []);
  useEffect(() => {
    stopSpeech();
    setPlaying(false);
  }, [i]);

  function play() {
    if (!q?.speak) return;
    onPlay?.(q);
    setPlaying(true);
    const run = () =>
      speak(
        q.speak!,
        rateRef.current,
        () => (loopRef.current ? run() : setPlaying(false)),
        () => setPlaying(false),
      );
    run();
  }
  function stop() {
    stopSpeech();
    setPlaying(false);
    setLoop(false);
  }

  if (finished && !review) {
    const correct = questions.filter((x) => answers[x.id] === x.answer).length;
    const wrong = questions.filter((x) => answers[x.id] !== x.answer);
    return (
      <Card tone="sage" className="mx-auto max-w-xl text-center">
        <Badge tone="gray">{title} 결과</Badge>
        <p className="mt-3 text-5xl font-extrabold text-sage-dark">
          {correct}
          <span className="text-2xl text-warm"> / {questions.length}</span>
        </p>
        <p className="mt-2 text-sm font-bold">{wrong.length === 0 ? "모두 맞혔어요!" : "퀴즈를 마쳤어요. 틀린 문제는 복습 목록에 저장돼요."}</p>
        {wrong.length > 0 && (
          <ul className="mt-4 space-y-2 text-left text-sm">
            {wrong.map((x) => (
              <li key={x.id} className="rounded-2xl bg-white/70 p-3">
                <p className="font-semibold" lang="zh">{x.stem}</p>
                <p className="mt-1 text-xs text-warm">내 답: {x.choices[answers[x.id]]}</p>
                <p className="mt-0.5 text-xs">정답: <b lang="zh">{x.choices[x.answer]}</b></p>
                <p className="mt-0.5 text-xs text-warm" lang="zh">{x.explain}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 flex flex-col gap-2">
          {onFinishHref && finishLabel && (
            <Link href={onFinishHref} className={`${btnPrimary} ${btnLarge} w-full`}>
              {finishLabel}
            </Link>
          )}
          <button className={btnSecondary} onClick={() => (setReview(true), setI(0))}>
            문제 다시 보기
          </button>
        </div>
      </Card>
    );
  }

  const picked = answers[q.id];
  const answered = picked !== undefined;
  const doneCount = questions.filter((x) => answers[x.id] !== undefined).length;

  return (
    <Card className="mx-auto max-w-xl">
      <div className="flex items-center gap-3">
        <ProgressBar value={doneCount / questions.length} className="flex-1" />
        <span className="text-sm font-semibold">
          {Math.min(i + 1, questions.length)}/{questions.length}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Badge>{title}</Badge>
        <Badge tone="gray">{q.kind}</Badge>
      </div>
      <p className="mt-4 text-2xl font-bold leading-snug" lang="zh">{q.stem}</p>
      {q.sub && <p className="mt-1 text-sm text-sage-dark" lang="zh">{q.sub}</p>}

      {audio && q.speak && (
        <div className="mt-4 rounded-2xl bg-sand p-3">
          <div className="flex flex-wrap items-center gap-2">
            {playing ? (
              <button className={`${btnPrimary} !min-h-11 !px-4`} onClick={stop} aria-label="정지">
                <Icon name="pause" className="h-5 w-5" fill />
              </button>
            ) : (
              <button className={`${btnPrimary} !min-h-11 !px-4`} onClick={play} aria-label="듣기">
                <Icon name="play" className="h-5 w-5" fill />
              </button>
            )}
            <div className="flex rounded-full bg-white/70 p-1" role="group" aria-label="재생 속도">
              {RATES.map((x) => (
                <button key={x} aria-pressed={rate === x} onClick={() => setRate(x)} className={`min-h-9 rounded-full px-3 text-sm font-semibold ${rate === x ? "bg-charcoal text-white" : "text-warm"}`}>
                  {x}×
                </button>
              ))}
            </div>
            <button role="switch" aria-checked={loop} onClick={() => setLoop(!loop)} className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold ${loop ? "bg-sage-dark text-white" : "bg-white/80 text-warm"}`}>
              <Icon name="repeat" className="h-4 w-4" /> 반복
            </button>
          </div>
          <p className="mt-2 text-xs text-warm">브라우저 내장 음성(TTS)이에요. 기기에 중국어 음성이 없으면 소리가 나지 않을 수 있어요.</p>
        </div>
      )}
      {!audio && q.speak && (
        <button className={`${btnSecondary} mt-3 !min-h-10`} onClick={play}>
          <Icon name="play" className="mr-1 h-4 w-4" fill /> 발음 듣기
        </button>
      )}

      <ul className="mt-4 grid gap-2.5">
        {q.choices.map((c, k) => {
          const st = !answered ? "idle" : k === q.answer ? "correct" : k === picked ? "wrong" : "dim";
          return (
            <li key={c}>
              <button disabled={answered} onClick={() => onAnswer(q, k)} className={choiceClass(st)}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${st === "correct" ? "bg-sage-dark text-white" : st === "wrong" ? "bg-charcoal text-white" : "bg-charcoal/8 text-warm"}`}>
                  {st === "correct" ? <Icon name="check" className="h-4 w-4" /> : st === "wrong" ? <Icon name="x" className="h-4 w-4" /> : k + 1}
                </span>
                <span lang="zh">{c}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {answered && (
        <div role="status" className={`anim-pop mt-4 rounded-2xl p-4 text-sm ${picked === q.answer ? "bg-sage-soft" : "bg-sand"}`}>
          <p className="font-bold">{picked === q.answer ? "정답이에요!" : "아쉬워요, 오답이에요."}</p>
          <p className="mt-1 text-warm" lang="zh">{q.explain}</p>
        </div>
      )}
      <div className="mt-4 flex items-center justify-between gap-2">
        <button className={btnSecondary} disabled={i === 0} onClick={() => setI(i - 1)}>
          이전
        </button>
        {i + 1 < questions.length ? (
          <button className={btnPrimary} disabled={!answered} onClick={() => setI(i + 1)}>
            다음
          </button>
        ) : (
          <button className={btnPrimary} disabled={!answered && !finished} onClick={() => setReview(false)}>
            결과 보기
          </button>
        )}
      </div>
    </Card>
  );
}
