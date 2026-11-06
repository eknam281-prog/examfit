"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/Icons";
import { BackLink, Badge, btnLarge, btnPrimary, Card, LinkButton, PageHeader } from "@/components/ui";
import { createSession, DEFAULT_WORDS, getActive, MAX_WORDS, MIN_WORDS, planSession, validateWordCount, conversationCount, type DailyStore } from "@/lib/daily";
import { TOPICS, type TopicId } from "@/lib/dailyData";
import { EMPTY_PLACEMENT, LEVEL_NAME, type Level, type PlacementRecord } from "@/lib/placement";
import { useDaily } from "@/lib/useDaily";
import { allocate, Area, AREA_HREF, AREA_LABEL, AREAS, MAX_MINUTES, MIN_MINUTES, Mode, MODE_LABEL, PRESETS, validateMinutes } from "@/lib/course";
import { useLocalState } from "@/lib/useLocalState";

// wordCount·topic은 나중에 추가된 항목이라 이전에 저장된 값에는 없을 수 있다(없으면 기본값 사용).
type Plan = { minutes: number; mode: Mode; areas: Area[]; wordCount?: number; topic?: TopicId | "all" };
const WORD_PRESETS = [10, 20, 30];

const AREA_ICON: Record<Area, IconName> = { words: "words", listening: "listening", speaking: "speaking", writing: "writing", review: "review" };
const AREA_BAR: Record<Area, string> = { words: "bg-sage-dark", listening: "bg-sage", speaking: "bg-charcoal", writing: "bg-warm", review: "bg-charcoal/30" };
const MODE_ICON: Record<Mode, IconName> = { balanced: "star", listening: "listening", speaking: "speaking" };

export default function CoursePage() {
  const [plan, setPlan] = useLocalState<Plan>("examfit.coursePlan", { minutes: 20, mode: "balanced", areas: ["words", "listening"] });
  const [custom, setCustom] = useState("");
  const router = useRouter();
  const { store, setStore, session, ready: dailyReady } = useDaily();
  const [place, , placeReady] = useLocalState<PlacementRecord>("examfit.placement", EMPTY_PLACEMENT);
  const [wordCustom, setWordCustom] = useState<string | null>(null); // null이면 저장된 값에서 파생
  const [forceNew, setForceNew] = useState(false);
  const [startErr, setStartErr] = useState<string | null>(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1") setForceNew(true); // 기록 화면/학습 경로의 '새 세션'에서 온 경우
  }, []);

  const level = (place.completed && place.chosen ? place.chosen : 1) as Level;
  const wordCount = plan.wordCount ?? DEFAULT_WORDS;
  const topic: TopicId | "all" = plan.topic ?? "all";
  const customMode = wordCustom !== null || !WORD_PRESETS.includes(wordCount);
  const customText = wordCustom ?? String(wordCount);
  const wv = validateWordCount(customMode ? customText : String(wordCount));
  const wplan = useMemo(() => (wv.ok ? planSession(topic, level, wv.n) : null), [wv, topic, level]);
  const locked = !!session && !forceNew; // 진행 중인 세션이 있으면 단어 수·주제는 새 세션을 시작할 때만 바뀐다
  const [err, setErr] = useState<string | null>(null);

  const alloc = allocate(plan.minutes, plan.mode, plan.areas);

  function applyCustom() {
    const v = Number(custom);
    const e = custom.trim() === "" ? "분 단위 숫자를 입력해 주세요." : validateMinutes(v);
    setErr(e);
    if (!e) setPlan({ ...plan, minutes: v });
  }

  function toggleArea(a: Area) {
    setPlan({ ...plan, areas: plan.areas.includes(a) ? plan.areas.filter((x) => x !== a) : AREAS.filter((x) => x === a || plan.areas.includes(x)) });
  }

  const firstReady = plan.areas.find((a) => AREA_HREF[a]);

  // 시작: 세션이 이미 있으면 그대로 이어서(중복 생성 없음), 없으면 선택한 단어 수·주제로 기존 일일 세션 생성 함수를 호출한다.
  // 저장소에 실제로 기록된 것을 확인한 뒤에만 일상 중국어 학습 경로로 이동한다.
  function start() {
    setStartErr(null);
    if (!place.completed) return router.push("/daily"); // 실력 진단이 먼저(진단 결과를 유지하며 난이도에 반영)
    if (locked) return router.push("/daily");
    if (!wplan || !wplan.ok || !wv.ok) return setStartErr(wplan && !wplan.ok ? wplan.message : "단어 수를 확인해 주세요.");
    try {
      const s = createSession(wplan, topic, level, wv.n, store);
      const next: DailyStore = { activeId: s.id, sessions: { ...store.sessions, [s.id]: s } }; // 이전 세션 기록은 그대로 보존
      localStorage.setItem("examfit.daily", JSON.stringify(next));
      const back = JSON.parse(localStorage.getItem("examfit.daily") ?? "null") as DailyStore | null;
      if (!back || back.activeId !== s.id || !getActive(back)) throw new Error("저장 확인 실패");
      setStore(next);
      router.push("/daily");
    } catch {
      setStartErr("학습 세션을 저장하지 못했어요(저장 공간을 확인해 주세요). 이동하지 않았어요.");
    }
  }
  const total = Object.values(alloc).reduce((x, y) => x + (y ?? 0), 0);
  const isPreset = PRESETS.includes(plan.minutes);

  return (
    <>
      <BackLink />
      <PageHeader title="오늘의 학습 코스" desc="시간과 영역을 고르면 자동으로 배분돼요. 이 기기에서 바로 계산됩니다." />

      <div className="grid gap-4 md:grid-cols-[1fr_360px] md:items-start">
        <div className="space-y-4">
          <Card>
            <h2 className="flex items-center gap-2 font-bold">
              <Step n={1} /> 학습 시간
            </h2>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {PRESETS.map((m) => (
                <button
                  key={m}
                  aria-pressed={plan.minutes === m}
                  onClick={() => setPlan({ ...plan, minutes: m })}
                  className={`min-h-12 rounded-2xl text-sm font-bold transition ${plan.minutes === m ? "bg-sage-dark text-white" : "bg-sand text-charcoal hover:bg-sage-soft"}`}
                >
                  {m}분
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder={`직접 입력 (${MIN_MINUTES}~${MAX_MINUTES})`}
                aria-label="학습 시간 직접 입력(분)"
                className="min-h-11 min-w-0 flex-1 rounded-2xl border border-charcoal/15 bg-white px-4 text-sm"
              />
              <button onClick={applyCustom} className="min-h-11 rounded-2xl bg-charcoal px-5 text-sm font-semibold text-white">
                적용
              </button>
            </div>
            {!isPreset && <p className="mt-2 text-xs font-medium text-sage-dark">직접 입력 {plan.minutes}분 적용 중</p>}
            {err && (
              <p role="alert" className="mt-2 text-sm font-medium text-charcoal">
                ⚠ {err}
              </p>
            )}
          </Card>

          <Card>
            <h2 className="flex items-center gap-2 font-bold">
              <Step n={2} /> 학습 모드
            </h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
                <button
                  key={m}
                  aria-pressed={plan.mode === m}
                  onClick={() => setPlan({ ...plan, mode: m })}
                  className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl text-sm font-semibold transition ${plan.mode === m ? "bg-sage-dark text-white" : "bg-sand hover:bg-sage-soft"}`}
                >
                  <Icon name={MODE_ICON[m]} />
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="flex items-center gap-2 font-bold">
              <Step n={3} /> 학습 영역
            </h2>
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {AREAS.map((a) => {
                const on = plan.areas.includes(a);
                return (
                  <li key={a}>
                    <button
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggleArea(a)}
                      className={`flex min-h-16 w-full items-center gap-2 rounded-2xl border-2 px-3 text-left text-sm font-semibold transition ${on ? "border-sage-dark bg-sage-soft" : "border-transparent bg-sand"}`}
                    >
                      <Icon name={AREA_ICON[a]} className="h-5 w-5 shrink-0 text-sage-dark" />
                      <span className="flex flex-col items-start gap-0.5">
                        {AREA_LABEL[a]}
                        {!AREA_HREF[a] && <Badge tone="gray">준비 중</Badge>}
                      </span>
                      {on && <Icon name="check" className="ml-auto h-4 w-4 text-sage-dark" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <h2 className="flex items-center gap-2 font-bold">
              <Step n={4} /> 오늘의 단어 수
            </h2>
            {locked && session && (
              <p className="mt-2 rounded-xl bg-sand p-2 text-xs text-warm">
                진행 중인 학습(단어 {session.words.length}개)이 있어 단어 수·주제는 그대로 유지돼요.{" "}
                <button className="font-semibold underline" onClick={() => setForceNew(true)}>
                  새 학습 세션으로 바꾸기
                </button>
              </p>
            )}
            <div className="mt-3 grid grid-cols-4 gap-2" role="radiogroup" aria-label="단어 수">
              {WORD_PRESETS.map((n) => (
                <button key={n} role="radio" aria-checked={!customMode && wordCount === n} disabled={locked} onClick={() => { setWordCustom(null); setPlan({ ...plan, wordCount: n }); }} className={`min-h-12 rounded-2xl text-sm font-bold transition disabled:opacity-50 ${!customMode && wordCount === n ? "bg-sage-dark text-white" : "bg-sand text-charcoal hover:bg-sage-soft"}`}>
                  {n}개{n === DEFAULT_WORDS ? " · 기본" : ""}
                </button>
              ))}
              <button role="radio" aria-checked={customMode} disabled={locked} onClick={() => setWordCustom(customText)} className={`min-h-12 rounded-2xl text-sm font-bold transition disabled:opacity-50 ${customMode ? "bg-sage-dark text-white" : "bg-sand text-charcoal hover:bg-sage-soft"}`}>
                직접 입력
              </button>
            </div>
            {customMode && (
              <div className="mt-3">
                <input
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={locked}
                  value={customText}
                  onChange={(e) => {
                    const t = e.target.value.replace(/\D/g, "").slice(0, 3);
                    setWordCustom(t);
                    const v = validateWordCount(t);
                    if (v.ok) setPlan({ ...plan, wordCount: v.n }); // 유효한 값만 저장(새로고침 후 복원)
                  }}
                  aria-label="단어 수 직접 입력"
                  aria-invalid={!wv.ok}
                  placeholder={`${MIN_WORDS}~${MAX_WORDS}`}
                  className="min-h-11 w-32 rounded-2xl border border-charcoal/15 bg-white px-4 text-sm"
                />
                {!wv.ok && customText !== "" && (
                  <p role="alert" className="mt-2 text-sm font-medium">
                    ⚠ {wv.message}
                  </p>
                )}
                <p className="mt-1 text-xs text-warm">{MIN_WORDS}~{MAX_WORDS}개(퀴즈 보기를 만들려면 최소 {MIN_WORDS}개). 실제 제공 가능한 수량까지만 시작돼요.</p>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="flex items-center gap-2 font-bold">
              <Step n={5} /> 회화 학습 주제
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="회화 주제">
              {[{ id: "all" as const, label: "전체(추천)" }, ...TOPICS].map((t) => (
                <li key={t.id}>
                  <button role="radio" aria-checked={topic === t.id} disabled={locked} onClick={() => setPlan({ ...plan, topic: t.id })} className={`min-h-10 rounded-full px-4 text-sm font-semibold transition disabled:opacity-50 ${topic === t.id ? "bg-sage-dark text-white" : "bg-sand hover:bg-sage-soft"}`}>
                    {t.label}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-3 rounded-2xl bg-sand p-3 text-sm">
              {!wplan ? (
                <p className="text-warm">단어 수를 입력하면 회화 문장 수가 표시돼요.</p>
              ) : wplan.ok ? (
                <>
                  <p>
                    단어 <b>{wplan.words.length}개</b> → 회화 문장 <b>{wplan.sentences.length}개</b> · 최종 퀴즈 <b>{wplan.sentences.length}문제</b> <span className="text-xs text-warm">(단어 수 ÷ 2 올림, 시작 수준 {LEVEL_NAME[level]})</span>
                  </p>
                  {wplan.capped && (
                    <p role="alert" className="mt-1 text-xs font-medium">
                      ⚠ 현재 제공할 수 있는 단어·문장은 {wplan.maxWords}개까지예요. {wv.ok ? wv.n : ""}개 대신 {wplan.maxWords}개로 시작해요(문장을 복제하지 않아요).
                    </p>
                  )}
                  {topic !== "all" && <p className="mt-1 text-xs text-warm">선택한 주제 단어 {wplan.words.filter((w) => w.topic === topic).length}개를 먼저 넣고, 부족하면 비슷한 수준의 다른 주제로 채워요.</p>}
                </>
              ) : (
                <p role="alert" className="font-medium">
                  ⚠ {wplan.message}
                  {wplan.maxWords > 0 ? ` 가능한 수량: 최대 ${wplan.maxWords}개` : ""}
                </p>
              )}
              <p className="mt-1 text-[11px] text-warm">참고: 단어 10개 → 5문장, 20개 → 10문장, 30개 → 15문장</p>
            </div>
          </Card>
        </div>

        <Card tone="dark" className="md:sticky md:top-6">
          <h2 className="font-bold">오늘의 코스</h2>
          <p className="mt-0.5 text-sm text-white/60">
            {plan.minutes}분 · {MODE_LABEL[plan.mode]}
          </p>
          {plan.areas.length === 0 ? (
            <p className="mt-4 text-sm text-white/70">영역을 하나 이상 선택해 주세요.</p>
          ) : (
            <>
              <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-white/10" aria-hidden>
                {plan.areas.map((a) => (
                  <span key={a} className={AREA_BAR[a]} style={{ width: `${((alloc[a] ?? 0) / plan.minutes) * 100}%` }} />
                ))}
              </div>
              <ol className="mt-4 space-y-3">
                {plan.areas.map((a) => (
                  <li key={a} className="flex items-center gap-3 text-sm">
                    <span className={`h-3 w-3 shrink-0 rounded-full ${AREA_BAR[a]}`} />
                    <span className="flex-1">
                      {AREA_LABEL[a]} {!AREA_HREF[a] && <span className="text-xs text-white/50">(준비 중)</span>}
                    </span>
                    <span className="font-bold">{alloc[a]}분</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 border-t border-white/10 pt-3 text-xs text-white/60">
                합계 {total}분 / 목표 {plan.minutes}분
              </p>
            </>
          )}
          <div className="mt-5">
            {firstReady ? (
              <button className={`${btnPrimary} ${btnLarge} w-full !bg-white !text-charcoal hover:!bg-sage-soft`} disabled={!dailyReady || !placeReady || (!locked && !(wplan && wplan.ok))} onClick={start}>
                {AREA_LABEL[firstReady]}부터 시작
              </button>
            ) : (
              <button className={`${btnPrimary} ${btnLarge} w-full`} disabled>
                시작할 수 있는 영역 없음
              </button>
            )}
            {startErr && (
              <p role="alert" className="mt-2 rounded-xl bg-white/10 p-2 text-xs">
                ⚠ {startErr}
              </p>
            )}
            {locked && session && <p className="mt-2 text-center text-xs text-white/60">진행 중인 학습을 이어서 해요(새로 만들지 않아요).</p>}
            <p className="mt-2 text-center text-xs text-white/50">타이머·영역별 분량 수정·이어하기는 아직 구현되지 않았습니다</p>
          </div>
        </Card>
      </div>
    </>
  );
}

function Step({ n }: { n: number }) {
  return <span className="flex h-6 w-6 items-center justify-center rounded-full bg-charcoal text-xs font-bold text-white">{n}</span>;
}
