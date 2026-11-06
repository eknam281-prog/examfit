"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/Icons";
import { FitchapBubble } from "@/components/FitchapBubble";
import { Placement } from "@/components/Placement";
import { Badge, Card, LinkButton, btnLarge, btnSecondary } from "@/components/ui";
import { getLevelInfo } from "@/lib/character";
import { SAMPLE_STATUS } from "@/lib/data";
import { currentStep, isDone, isUnlocked, quizProgress, sentencesStudied, STEP_HREF, STEP_LABEL, STEPS, UNLOCK_HINT, type DailySession, type Step } from "@/lib/daily";
import { TOPICS } from "@/lib/dailyData";
import { EMPTY_PLACEMENT, LEVEL_NAME, LEVELS_ALL, type Level, type PlacementRecord } from "@/lib/placement";
import { ROW, XS, labelRange, nodeTop, NODE, pathD } from "@/lib/pathLayout";
import { useFitchapName } from "@/lib/fitchapName";
import { useDaily } from "@/lib/useDaily";
import { useLocalState } from "@/lib/useLocalState";

const ICON: Record<Step, IconName> = { words: "words", listening: "listening", speaking: "speaking", writing: "writing" };

export default function DailyPage() {
  const [xp] = useLocalState("examfit.xp", SAMPLE_STATUS.xp);
  const [place, setPlace, placeReady] = useLocalState<PlacementRecord>("examfit.placement", EMPTY_PLACEMENT);
  const { ready, session } = useDaily();
  const { display: fitName } = useFitchapName();
  const [view, setView] = useState<"path" | "settings" | "retake">("path");
  const { current: fitchap } = getLevelInfo(xp);

  // 기록 화면의 '실력 진단 다시 하기'에서 넘어온 경우(?retake=1) 재진단 화면을 연다
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("retake") === "1") {
      setView("retake");
      window.history.replaceState(null, "", window.location.pathname); // 새로고침해도 재진단 화면이 반복되지 않게 주소의 표시를 지운다
    }
  }, []);

  if (!placeReady || !ready) return null;
  if (!place.completed || view === "retake") {
    return (
      <Placement
        initialSelf={place.selfLevel}
        onCancel={place.completed ? () => setView("settings") : undefined}
        onSave={(r) => {
          setPlace(r); // 기존 학습 기록(단어·듣기·경험치)은 그대로 둔다
          setView("path");
        }}
      />
    );
  }
  const level = (place.chosen ?? 1) as Level;

  if (!session) {
    return (
      <Card tone="soft" className="mx-auto max-w-xl text-center">
        <p className="text-lg font-bold">오늘의 학습을 시작해 볼까요?</p>
        <p className="mt-1 text-sm text-warm">‘오늘의 학습 코스’에서 단어 수와 회화 주제를 고르고 시작하면 이 화면에 학습 경로가 나타나요.</p>
        <div className="mt-4">
          <LinkButton href="/daily/course" primary className={`${btnLarge} w-full`}>
            오늘의 학습 코스 설정
          </LinkButton>
        </div>
      </Card>
    );
  }

  const cur = currentStep(session);
  const allDone = !cur;
  const stages = STEPS.map((step) => {
    const unlocked = isUnlocked(session, step);
    const done = isDone(session, step);
    const status = status_(session, step);
    return { step, unlocked, done, status, href: STEP_HREF[step], title: STEP_LABEL[step] };
  });
  const lockedNext = stages.find((s) => !s.unlocked);
  const height = ROW * stages.length;
  const topicLabel = session.topic === "all" ? "전체 주제" : TOPICS.find((t) => t.id === session.topic)?.label;

  return (
    <>
      <header className="text-center">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">오늘의 중국어 모험</h1>
        <p className="mt-1.5 text-sm text-warm">단어 → 듣기 → 회화 → 한자 쓰기로 이어져요</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <Badge tone="dark">시작 수준 · {LEVEL_NAME[level]}</Badge>
          <Badge tone="gray">{fitName}</Badge>
          <Badge tone="gray">단어 {session.words.length}개</Badge>
          <Badge tone="gray">회화 {session.sentenceIds.length}문장</Badge>
          <Badge tone="gray">{topicLabel}</Badge>
        </div>
        <button className="mt-2 min-h-9 text-xs font-semibold text-warm underline" onClick={() => setView(view === "settings" ? "path" : "settings")} aria-expanded={view === "settings"}>
          수준 변경·다시 진단·학습 다시 설정
        </button>
      </header>

      {view === "settings" && (
        <section aria-label="학습 설정" className="mx-auto mt-3 max-w-sm rounded-3xl bg-sand p-4 text-sm">
          <p className="font-bold">시작 수준</p>
          <p className="mt-1 text-xs text-warm">
            자기 평가 {place.selfLevel ? LEVEL_NAME[place.selfLevel] : "-"}
            {place.score ? ` · 진단 ${place.score.correct}/${place.score.total}` : " · 진단 없이 시작"} · 추천 {place.recommended ? LEVEL_NAME[place.recommended] : "-"}
          </p>
          <ul className="mt-3 grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="시작 수준 변경">
            {LEVELS_ALL.map((l) => (
              <li key={l}>
                <button role="radio" aria-checked={level === l} onClick={() => setPlace({ ...place, chosen: l })} className={`min-h-10 w-full rounded-xl text-xs font-bold ${level === l ? "bg-sage-dark text-white" : "bg-white hover:bg-sage-soft"}`}>
                  {LEVEL_NAME[l]}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-warm">수준을 바꿔도 진행 중인 오늘의 학습 내용은 그대로예요. 새 학습 세션부터 적용돼요.</p>
          <button className={`${btnSecondary} mt-3 w-full`} onClick={() => setView("retake")}>
            다시 진단하기
          </button>
          <Link href="/daily/course?new=1" className={`${btnSecondary} mt-2 w-full`}>
            새 학습 세션 시작(단어 수·주제 다시 설정)
          </Link>
          <p className="mt-2 text-[11px] text-warm">새 세션을 시작해도 이전 세션의 학습 기록과 경험치는 남아요.</p>
        </section>
      )}

      {/* 지그재그 학습 경로 */}
      <section aria-label="학습 경로" className="relative mx-auto mt-6 w-full max-w-sm overflow-x-clip" style={{ height }}>
        <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden>
          <path d={pathD(stages.length)} fill="none" stroke="var(--color-olive)" strokeWidth={4} strokeLinecap="round" strokeDasharray="1 9" vectorEffect="non-scaling-stroke" />
        </svg>

        {stages.map((s, i) => {
          const isCur = s.step === cur;
          const left = XS[i] > 50;
          const size = isCur ? "h-24 w-24" : "h-20 w-20";
          const look = !s.unlocked
            ? "bg-sand/60 text-warm/70"
            : s.done
              ? "bg-olive text-white shadow-[0_5px_0_var(--color-olive-deep)]"
              : isCur
                ? "bg-cocoa text-white shadow-[0_6px_0_var(--color-cocoa-deep)]"
                : "bg-white text-cocoa shadow-[0_5px_0_var(--color-sand)] ring-2 ring-olive/50";
          const icon = <Icon name={!s.unlocked ? "lock" : s.done ? "check" : ICON[s.step]} className={isCur ? "h-10 w-10" : "h-8 w-8"} />;
          const [labelTop] = labelRange(i);
          return (
            <div key={s.step}>
              <div className="absolute flex w-36 -translate-x-1/2 items-center justify-center" style={{ left: `${XS[i]}%`, top: nodeTop(i), height: NODE }}>
                {s.unlocked ? (
                  <Link href={s.href} aria-label={`${s.title} · ${s.done ? "완료(복습 가능)" : s.status}${isCur ? " (지금 학습)" : ""}`} className={`relative flex items-center justify-center rounded-full transition active:translate-y-1 active:shadow-none ${size} ${look}`}>
                    {isCur && <span aria-hidden className="absolute -inset-2 rounded-full border-2 border-cocoa/30" />}
                    {icon}
                  </Link>
                ) : (
                  <span role="img" aria-disabled="true" aria-label={`${s.title} · 잠김. ${UNLOCK_HINT[s.step]}`} className={`relative flex cursor-not-allowed items-center justify-center rounded-full ${size} ${look}`}>
                    {icon}
                  </span>
                )}
                {isCur && (
                  <Image src={fitchap.image} alt={`핏찹이 Lv.${fitchap.level}`} width={80} height={80} unoptimized priority className={`anim-bob pointer-events-none absolute top-1/2 h-20 w-20 -translate-y-1/2 ${left ? "right-[calc(100%-4px)]" : "left-[calc(100%-4px)]"}`} />
                )}
              </div>
              <div className="absolute w-36 -translate-x-1/2 text-center" style={{ left: `${XS[i]}%`, top: labelTop, height: 44 }}>
                <p className={`truncate text-sm font-bold leading-5 ${s.unlocked ? "" : "text-warm"}`}>{s.title}</p>
                <p className="truncate text-xs leading-4 text-warm">{s.done ? "완료 · 복습 가능" : isCur ? `지금 · ${s.status}` : s.status}</p>
              </div>
            </div>
          );
        })}
      </section>

      {/* 학습 행동 */}
      <div className="mx-auto mt-4 max-w-sm space-y-2.5 text-center">
        {allDone ? (
          <Card tone="sage" className="text-center">
            <p className="text-lg font-bold">🎉 오늘의 학습 완료!</p>
            <p className="mt-1 text-xs text-warm">완료한 단계는 언제든 복습할 수 있어요. 틀린 문제는 각 단계의 복습 목록에 저장돼요.</p>
            <div className="mt-3 text-left">
              <FitchapBubble event="daily.complete" keep reserve={false} />
            </div>
          </Card>
        ) : (
          <LinkButton href={STEP_HREF[cur]} primary className={`${btnLarge} w-full`}>
            {STEP_LABEL[cur]} {stages.find((s) => s.step === cur)!.status.includes("/") && !stages.find((s) => s.step === cur)!.status.startsWith("0/") ? "이어서 하기" : "시작"}
          </LinkButton>
        )}
        {lockedNext && (
          <p className="flex items-start justify-center gap-1.5 rounded-2xl bg-sand p-3 text-left text-xs text-warm">
            <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <b className="text-charcoal">{STEP_LABEL[lockedNext.step]}</b> — {UNLOCK_HINT[lockedNext.step]}
            </span>
          </p>
        )}
        <ReviewSummary session={session} />
      </div>
    </>
  );
}

function status_(s: DailySession, step: Step): string {
  const st = s.steps;
  if (!isUnlocked(s, step)) return "잠김";
  if (step === "words") return `학습 ${s.words.filter((w) => st.words.marked[w.id]).length}/${s.words.length}`;
  if (step === "listening") {
    const q = quizProgress(s, "listening");
    return `퀴즈 ${q.answered}/${q.total}`;
  }
  if (step === "speaking") {
    const q = quizProgress(s, "speaking");
    return sentencesStudied(s) ? `퀴즈 ${q.answered}/${q.total}` : `문장 ${st.speaking.studied.length}/${s.sentenceIds.length}`;
  }
  return `한자 ${st.writing.learned.length}/${s.chars.length}`;
}

function ReviewSummary({ session }: { session: DailySession }) {
  const n = session.review.words.length + session.review.listening.length + session.review.sentences.length + session.review.chars.length;
  if (n === 0) return null;
  return <p className="text-[11px] text-warm">복습 목록 {n}개 · 단어 {session.review.words.length} · 듣기 {session.review.listening.length} · 회화 {session.review.sentences.length} · 한자 {session.review.chars.length}</p>;
}
