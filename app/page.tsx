"use client";
import Image from "next/image";
import Link from "next/link";
import { Badge, Card, LinkButton, ProgressBar, btnLarge } from "@/components/ui";
import { LEVELS, getLevelInfo } from "@/lib/character";
import { SAMPLE_STATUS } from "@/lib/data";
import { useFitchapName } from "@/lib/fitchapName";
import { todayKey } from "@/lib/daily";
import { learnedDays, streak } from "@/lib/recordStats";
import { useDaily } from "@/lib/useDaily";
import { useLocalState } from "@/lib/useLocalState";

const DEFAULT_MODES = { daily: true, exam: true };

export default function HomePage() {
  const [modes, setModes] = useLocalState("examfit.modes", DEFAULT_MODES);
  const [xp] = useLocalState("examfit.xp", SAMPLE_STATUS.xp);
  const { display: fitName } = useFitchapName();
  // 연속 일수·오늘 학습량은 저장된 일일 학습 세션(실제로 완료한 단계)에서 계산한다. 기록이 없으면 0.
  const { store } = useDaily();
  const days = learnedDays(store);
  const streakDays = streak(new Set(days.keys()), todayKey());
  const todayDone = Math.min(4, new Set(days.get(todayKey())?.steps.map((x) => x.step) ?? []).size);
  const { current, next, progress, xpToNext } = getLevelInfo(xp);

  return (
    <div className="space-y-4 md:space-y-5">
      {/* 핏찹이 + 오늘의 학습 */}
      <Card tone="sage" className="relative overflow-hidden p-6 md:p-8">
        <div className="flex flex-col items-center gap-6 md:flex-row md:gap-10">
          <div className="shrink-0 rounded-full bg-white/60 p-3">
            <Image src={current.image} alt={`핏찹이 Lv.${current.level}`} width={220} height={220} unoptimized priority className="h-44 w-44 md:h-56 md:w-56" />
          </div>
          <div className="w-full flex-1">
            <div className="flex items-center gap-2">
              <Badge tone="dark">Lv.{current.level}</Badge>
              <Badge tone="gray">{fitName}</Badge>
              <Badge tone="gray">연속 {streakDays}일</Badge>
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight md:text-3xl">오늘도 핏찹이와 한 걸음</h1>

            <div className="mt-5 space-y-4">
              <div>
                <div className="mb-1.5 flex items-baseline justify-between text-sm">
                  <span className="font-semibold">오늘의 학습</span>
                  <span className="text-warm">
                    <b className="text-base text-charcoal">{todayDone}</b> / 4단계 완료
                  </span>
                </div>
                <ProgressBar value={todayDone / 4} />
              </div>
              <div>
                <div className="mb-1.5 flex items-baseline justify-between text-sm">
                  <span className="font-semibold">경험치</span>
                  <span className="text-warm">
                    <b className="text-base text-charcoal">{xp}</b> XP · {next ? `Lv.${next.level}까지 ${xpToNext} XP` : "최고 레벨"}
                  </span>
                </div>
                <ProgressBar value={progress} tone="dark" />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <LinkButton href="/daily/course" primary className={`${btnLarge} w-full md:w-auto`}>
                학습 시작
              </LinkButton>
              <LinkButton href="/daily/listening" className="w-full md:w-auto">
                듣기 바로 시작
              </LinkButton>
            </div>
          </div>
        </div>
      </Card>

      {/* 주요 메뉴 */}
      <div className="grid gap-4 md:grid-cols-2 md:gap-5">
        <MenuCard
          title="일상 중국어"
          desc="단어 · 듣기 · 회화 · 한자"
          href="/daily"
          cta="중국어 학습으로"
          label="일상 학습"
          on={modes.daily}
          onChange={(v) => setModes({ ...modes, daily: v })}
          tone="plain"
        />
        <MenuCard
          title="시험 대비"
          desc="과목 등록 · 강의자료 · 예상문제"
          href="/exam"
          cta="시험 대비로"
          label="시험 대비"
          on={modes.exam}
          onChange={(v) => setModes({ ...modes, exam: v })}
          tone="soft"
        />
      </div>

      {/* 성장 단계 (컴팩트) */}
      <section aria-label="핏찹이 성장 단계" className="rounded-3xl bg-sand px-5 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">성장 단계</h2>
          <span className="text-xs text-warm">임시 경험치 구간</span>
        </div>
        <ul className="mt-3 flex items-center justify-between gap-2">
          {LEVELS.map((l) => {
            const reached = xp >= l.minXp;
            const here = l.level === current.level;
            return (
              <li key={l.level} className="flex flex-1 flex-col items-center text-center">
                <Image
                  src={l.image}
                  alt={`핏찹이 Lv.${l.level}`}
                  width={48}
                  height={48}
                  unoptimized
                  className={`h-12 w-12 ${reached ? "" : "opacity-35 grayscale"} ${here ? "rounded-full bg-white ring-2 ring-sage-dark" : ""}`}
                />
                <p className={`mt-1 text-xs ${here ? "font-bold" : "font-medium text-warm"}`}>Lv.{l.level}</p>
                <p className="text-[11px] text-warm">{l.minXp} XP</p>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function MenuCard(props: {
  title: string;
  desc: string;
  href: string;
  cta: string;
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
  tone: "plain" | "soft";
}) {
  const { title, desc, href, cta, label, on, onChange, tone } = props;
  return (
    <Card tone={tone} className="flex flex-col justify-between gap-5 md:min-h-40">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="mt-1 text-sm text-warm">{desc}</p>
        </div>
        <ModeToggle label={label} on={on} onChange={onChange} />
      </div>
      {on ? (
        <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-sage-dark hover:underline">
          {cta} <span aria-hidden>→</span>
        </Link>
      ) : (
        <p className="text-sm text-warm">모드가 꺼져 있습니다. 기록은 보존됩니다.</p>
      )}
    </Card>
  );
}

function ModeToggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={`${label} 모드`}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-sage-dark" : "bg-charcoal/20"}`}
    >
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all ${on ? "left-5" : "left-0.5"}`} />
    </button>
  );
}
