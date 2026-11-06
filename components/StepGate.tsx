"use client";
import type { ReactNode } from "react";
import { BackLink, Card, LinkButton } from "./ui";
import { Icon } from "./Icons";
import { isUnlocked, STEP_LABEL, STEPS, UNLOCK_HINT, type DailySession, type Step } from "@/lib/daily";
import { useDaily } from "@/lib/useDaily";

// 단계 페이지 진입 제어: 세션이 없거나 잠긴 단계는 내용을 렌더링하지 않는다(주소로 직접 들어와도 차단).
export function StepGate({ step, children }: { step: Step; children: (ctx: { session: DailySession; update: ReturnType<typeof useDaily>["update"] }) => ReactNode }) {
  const { ready, session, update } = useDaily();
  if (!ready) return null;
  if (!session) {
    return (
      <>
        <BackLink />
        <Card tone="soft" className="mx-auto max-w-xl text-center">
          <p className="text-lg font-bold">오늘의 학습을 먼저 설정해 주세요</p>
          <p className="mt-1 text-sm text-warm">‘오늘의 학습 코스’에서 단어 수와 회화 주제를 정하면 단어·듣기·회화·한자 쓰기가 같은 단어로 이어져요.</p>
          <div className="mt-4">
            <LinkButton href="/daily/course" primary>
              오늘의 학습 코스로
            </LinkButton>
          </div>
        </Card>
      </>
    );
  }
  if (!isUnlocked(session, step)) {
    const prev = STEPS[STEPS.indexOf(step) - 1];
    return (
      <>
        <BackLink />
        <Card tone="soft" className="mx-auto max-w-xl text-center">
          <Icon name="lock" className="mx-auto h-8 w-8 text-warm" />
          <p className="mt-2 text-lg font-bold">{STEP_LABEL[step]}은(는) 아직 잠겨 있어요</p>
          <p className="mt-1 text-sm text-warm">{UNLOCK_HINT[step]}</p>
          <div className="mt-4">
            <LinkButton href={`/daily/${prev}`} primary>
              {STEP_LABEL[prev]}으로 가기
            </LinkButton>
          </div>
        </Card>
      </>
    );
  }
  return <>{children({ session, update })}</>;
}
