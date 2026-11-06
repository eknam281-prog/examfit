"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";
import { Badge, btnPrimary, btnSecondary, Card, ProgressBar } from "./ui";
import { applyBackup, BACKUP_EXCLUDES, buildBackup, clearExamfitStorage, CONFIRM_PHRASE, planFullReset, resetPlacementValue, resetTodaySession, validateBackup, type Backup, type BackupSummary } from "@/lib/backup";
import { getActive, STEP_LABEL, todayKey, type DailyStore } from "@/lib/daily";
import { deleteIdb, idbSummary, type IdbSummary } from "@/lib/idbTools";
import { LEVELS, getLevelInfo } from "@/lib/character";
import { LEVEL_DESC, LEVEL_NAME, LEVELS_ALL, type PlacementRecord } from "@/lib/placement";
import { monthGrid, type computeStats } from "@/lib/recordStats";
import { NAME_MAX, useFitchapName, validateName } from "@/lib/fitchapName";

type Stats = ReturnType<typeof computeStats>;

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const fmt = (ms: number) => new Date(ms).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });

// ───── 1. 캐릭터 성장 ─────
export function GrowthCard({ xp, stats, maxStreakDays }: { xp: number; stats: Stats; maxStreakDays: number }) {
  const { current, next, progress, xpToNext } = getLevelInfo(xp);
  // 저장된 기록으로 확인되는 업적만 표시한다.
  const badges = [
    { ok: stats.knownWords >= 1, label: "첫 단어 외우기" },
    { ok: stats.knownWords >= 10, label: "단어 10개 외우기" },
    { ok: stats.listening.correct >= 5, label: "듣기 퀴즈 5개 정답" },
    { ok: stats.studiedSentences >= 10, label: "회화 문장 10개 학습" },
    { ok: stats.writing.learned >= 5, label: "한자 5자 학습" },
    { ok: stats.completedSessions >= 1, label: "오늘의 학습 완료" },
    { ok: maxStreakDays >= 3, label: "3일 연속 학습" },
    { ok: maxStreakDays >= 7, label: "7일 연속 학습" },
  ];
  return (
    <Card tone="sage" className="p-6">
      <div className="flex items-center gap-5">
        <Image src={current.image} alt={`핏찹이 Lv.${current.level}`} width={112} height={112} unoptimized className="h-24 w-24 shrink-0 rounded-full bg-white/60 p-2 md:h-28 md:w-28" />
        <div className="min-w-0 flex-1">
          <Badge tone="dark">Lv.{current.level}</Badge>
          <p className="mt-2 text-3xl font-extrabold">
            {xp} <span className="text-base font-semibold text-warm">XP</span>
          </p>
          <ProgressBar value={progress} tone="dark" className="mt-2" />
          <p className="mt-1.5 text-xs text-warm">{next ? `Lv.${next.level}까지 ${xpToNext} XP` : "최고 레벨이에요"}</p>
          <NameEditor />
        </div>
      </div>
      <ul className="mt-4 grid grid-cols-4 gap-2 text-center" aria-label="성장 단계">
        {LEVELS.map((l) => {
          const got = xp >= l.minXp;
          return (
            <li key={l.level} className="flex flex-col items-center">
              <Image src={l.image} alt={`핏찹이 Lv.${l.level}`} width={48} height={48} unoptimized className={`h-12 w-12 ${got ? "" : "opacity-35 grayscale"} ${l.level === current.level ? "rounded-full bg-white ring-2 ring-sage-dark" : ""}`} />
              <p className="mt-1 text-xs font-semibold">Lv.{l.level}</p>
              <p className="text-[11px] text-warm">{got ? "달성" : `${l.minXp} XP`}</p>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs font-semibold text-warm">학습 업적</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {badges.map((b) => (
          <li key={b.label} className={`rounded-full px-3 py-1 text-xs font-semibold ${b.ok ? "bg-white" : "bg-white/40 text-warm"}`}>
            {b.ok ? "✓ " : "· "}
            {b.label}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-warm">업적은 저장된 학습 기록으로 확인될 때만 달성으로 표시돼요.</p>
    </Card>
  );
}

// ───── 3. 학습 달력 ─────
export function CalendarCard({ stats, charImage }: { stats: Stats; charImage: string }) {
  const today = todayKey();
  const [y0, m0] = today.split("-").map(Number);
  const [ym, setYm] = useState({ y: y0, m: m0 - 1 });
  const [sel, setSel] = useState<string | null>(null);
  const weeks = monthGrid(ym.y, ym.m);
  const info = sel ? stats.days.get(sel) : null;
  const move = (d: number) => setYm(({ y, m }) => ({ y: m + d < 0 ? y - 1 : m + d > 11 ? y + 1 : y, m: (m + d + 12) % 12 }));

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-warm">
          <Icon name="course" className="h-4 w-4 text-sage-dark" /> 학습 달력
        </h2>
        <p className="text-xs text-warm">
          연속 <b className="text-charcoal">{stats.streak}일</b> · 이번 주 <b className="text-charcoal">{stats.weekDays}/7일</b> · 오늘 완료 단계 <b className="text-charcoal">{stats.todayDone}</b>
        </p>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button className={`${btnSecondary} !min-h-9 !px-3`} onClick={() => move(-1)} aria-label="이전 달">
          <Icon name="prev" className="h-4 w-4" />
        </button>
        <p className="font-bold">
          {ym.y}년 {ym.m + 1}월
        </p>
        <button className={`${btnSecondary} !min-h-9 !px-3`} onClick={() => move(1)} aria-label="다음 달">
          <Icon name="next" className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px] text-warm" aria-hidden>
        {WEEK.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1" role="grid" aria-label="학습 달력">
        {weeks.flat().map((d, i) => {
          if (!d) return <span key={i} />;
          // 실제로 완료한 단계만 센다: 4단계 모두 → 핏찹이, 일부 → 점, 없으면 비움(완료 기록이 없으면 표시하지 않음)
          const done = new Set(stats.days.get(d)?.steps.map((x) => x.step) ?? []).size;
          const full = done >= 4;
          const isSel = sel === d;
          return (
            <button
              key={d}
              onClick={() => setSel(isSel ? null : d)}
              aria-pressed={isSel}
              aria-label={`${d} ${full ? "4단계 모두 완료" : done > 0 ? `${done}단계 완료` : "학습 기록 없음"}`}
              className={`relative flex aspect-square flex-col items-center justify-between overflow-hidden rounded-xl py-0.5 ${full ? "bg-sage-soft ring-1 ring-olive" : "bg-sand/60"} ${d === today ? "ring-2 ring-cocoa" : ""} ${isSel ? "outline outline-2 outline-offset-1 outline-charcoal" : ""}`}
            >
              <span className="text-[10px] font-semibold leading-none">{Number(d.slice(8))}</span>
              {full ? (
                <Image src={charImage} alt="" width={24} height={24} unoptimized className="h-[55%] w-[55%] object-contain" />
              ) : done > 0 ? (
                <span aria-hidden className="mb-1 h-1.5 w-1.5 rounded-full bg-olive-deep" />
              ) : (
                <span className="h-1.5" />
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-warm">핏찹이는 단어·듣기·회화·한자 4단계를 모두 완료한 날, 점은 일부 단계만 완료한 날이에요. 앱에 접속만 한 날은 표시되지 않아요. 오늘은 갈색 테두리예요.</p>

      {sel && (
        <div className="anim-pop mt-3 rounded-2xl bg-sand p-3 text-sm" role="status">
          <p className="font-bold">{sel}</p>
          {!info ? (
            <p className="mt-1 text-xs text-warm">이 날은 완료한 학습 단계가 없어요.</p>
          ) : (
            <ul className="mt-1 space-y-2">
              {info.sessions.map((s) => {
                const steps = info.steps.filter((x) => x.sessionId === s.id);
                return (
                  <li key={s.id} className="rounded-xl bg-white p-2 text-xs">
                    <p className="font-semibold">세션 {s.id} · 단어 {s.words.length}개 · 회화 {s.sentenceIds.length}문장</p>
                    <p className="mt-0.5">완료 단계: {steps.map((x) => `${STEP_LABEL[x.step]}${x.at ? "" : "*"}`).join(" · ")}</p>
                    <p className="mt-0.5 text-warm">
                      복습 필요: 단어 {s.review.words.length} · 듣기 {s.review.listening.length} · 회화 {s.review.sentences.length} · 한자 {s.review.chars.length}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          {info?.steps.some((x) => !x.at) && <p className="mt-1 text-[11px] text-warm">* 완료 시각이 기록되지 않은 이전 데이터는 세션 시작일 기준이에요.</p>}
        </div>
      )}

      <p className="mt-4 text-xs font-semibold text-warm">최근 7일</p>
      <ul className="mt-1.5 grid grid-cols-7 gap-1.5" aria-label="최근 7일 학습">
        {stats.week.map((d) => (
          <li key={d.date} className="flex flex-col items-center gap-1">
            <span className="flex h-14 w-full items-end rounded-lg bg-sand/60">
              <span className="w-full rounded-lg bg-olive" style={{ height: `${Math.min(100, (d.steps / 4) * 100)}%` }} />
            </span>
            <span className="text-[11px] text-warm">{Number(d.date.slice(8))}일</span>
            <span className="text-[11px] font-semibold">{d.steps}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-warm">막대는 그날 완료한 단계 수(최대 4)예요.</p>
    </Card>
  );
}

// ───── 4. 복습 목록 ─────
const REVIEW_GROUPS = [
  { key: "words", title: "단어 오답", href: "/daily/words", go: "단어 단계로" },
  { key: "listening", title: "듣기 오답", href: "/daily/listening", go: "듣기 단계로" },
  { key: "sentences", title: "회화 문장 오답", href: "/daily/speaking", go: "회화 단계로" },
  { key: "chars", title: "한자 쓰기 오답", href: "/daily/writing", go: "한자 단계로" },
] as const;

export function ReviewCard({ stats }: { stats: Stats }) {
  return (
    <Card>
      <h2 className="flex items-center gap-2 text-sm font-bold text-warm">
        <Icon name="review" className="h-4 w-4 text-sage-dark" /> 복습 목록 <span className="font-normal">· 총 {stats.reviewTotal}개</span>
      </h2>
      {stats.reviewTotal === 0 ? (
        <p className="mt-2 rounded-2xl bg-sand px-3 py-2 text-sm text-warm">복습할 오답이 아직 없어요. 퀴즈에서 틀린 항목이 여기에 저장돼요.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {REVIEW_GROUPS.map((g) => {
            const items = stats.review[g.key];
            return (
              <details key={g.key} className="rounded-2xl bg-sand/60 p-3" open={items.length > 0 && items.length <= 6}>
                <summary className="flex cursor-pointer items-center justify-between gap-2 text-sm font-semibold">
                  <span>
                    {g.title} <Badge tone={items.length ? "dark" : "gray"}>{items.length}</Badge>
                  </span>
                </summary>
                {items.length === 0 ? (
                  <p className="mt-2 text-xs text-warm">저장된 오답이 없어요.</p>
                ) : (
                  <>
                    <ul className="mt-2 space-y-1.5">
                      {items.map((it) => (
                        <li key={it.id} className="rounded-xl bg-white p-2 text-sm">
                          <p className="break-words font-semibold" lang="zh">{it.label}</p>
                          {it.sub && <p className="break-words text-xs text-warm">{it.sub}</p>}
                          <p className="text-[11px] text-warm">{it.current ? "현재 세션" : `이전 세션 ${it.sessionId}`}</p>
                        </li>
                      ))}
                    </ul>
                    <Link href={g.href} className={`${btnSecondary} mt-2 !min-h-10 text-xs`}>
                      {g.go} 이동해 다시 연습
                    </Link>
                    <p className="mt-1 text-[11px] text-warm">현재 세션의 단계 화면에서 다시 풀 수 있어요. 이전 세션 항목은 기록으로만 보관돼요.</p>
                  </>
                )}
              </details>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ───── 5. 중국어 실력 설정 ─────
export function SettingsCard({ place, setPlace }: { place: PlacementRecord; setPlace: (v: PlacementRecord) => void }) {
  return (
    <Card tone="soft">
      <h2 className="text-sm font-bold text-warm">중국어 실력 설정</h2>
      {!place.completed ? (
        <>
          <p className="mt-2 text-sm">아직 실력 진단을 하지 않았어요.</p>
          <Link href="/daily" className={`${btnPrimary} mt-3 w-full`}>
            진단 시작하기
          </Link>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm">
            현재 시작 수준 <b>{place.chosen ? LEVEL_NAME[place.chosen] : "-"}</b>
            <span className="block text-xs text-warm">{place.chosen ? LEVEL_DESC[place.chosen] : ""}</span>
          </p>
          <p className="mt-2 text-xs text-warm">
            진단 결과: 자기 평가 {place.selfLevel ? LEVEL_NAME[place.selfLevel] : "-"} · {place.score ? `5문제 중 ${place.score.correct}문제 정답` : "진단 없이 시작"} · 추천 {place.recommended ? LEVEL_NAME[place.recommended] : "-"}
            {place.at ? ` · ${fmt(place.at)}` : ""}
          </p>
          <ul className="mt-3 grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="시작 수준 변경">
            {LEVELS_ALL.map((l) => (
              <li key={l}>
                <button role="radio" aria-checked={place.chosen === l} onClick={() => setPlace({ ...place, chosen: l })} className={`min-h-11 w-full rounded-xl text-sm font-bold ${place.chosen === l ? "bg-sage-dark text-white" : "bg-white hover:bg-sage-soft"}`}>
                  {LEVEL_NAME[l]}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-warm">바꾼 수준은 다음 학습 세션부터 적용돼요. 이미 시작한 세션의 단어·문장과 진도는 그대로예요. 학습 시간은 ‘오늘의 학습 코스’에서 따로 설정해요.</p>
          <Link href="/daily?retake=1" className={`${btnSecondary} mt-3 w-full`}>
            실력 진단 다시 하기
          </Link>
        </>
      )}
    </Card>
  );
}

// ───── 6. 백업·초기화 ─────
type Notice = { ok: boolean; text: string } | null;
const Msg = ({ n }: { n: Notice }) => (n ? <p role="status" className={`mt-2 rounded-xl p-2 text-xs font-medium ${n.ok ? "bg-sage-soft" : "bg-sand"}`}>{n.ok ? "✓ " : "⚠ "}{n.text}</p> : null);

export function DataCard({ store, setStore, setPlace }: { store: DailyStore; setStore: (v: DailyStore) => void; setPlace: (v: PlacementRecord) => void }) {
  const [msg, setMsg] = useState<Notice>(null);
  const [confirm, setConfirm] = useState<null | "today" | "placement">(null);
  const [imp, setImp] = useState<{ backup: Backup; summary: BackupSummary } | null>(null);
  const [full, setFull] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [idb, setIdb] = useState<IdbSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const hasActive = !!getActive(store);

  useEffect(() => {
    if (full) void idbSummary().then(setIdb);
  }, [full]);

  function exportBackup() {
    try {
      const b = buildBackup(localStorage);
      const blob = new Blob([JSON.stringify(b, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `examfit-backup-${todayKey()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMsg({ ok: true, text: `백업 파일을 만들었어요(항목 ${Object.keys(b.data).length}개). PDF·OCR 자료는 포함되지 않아요.` });
    } catch {
      setMsg({ ok: false, text: "백업 파일을 만들지 못했어요." });
    }
  }

  async function pick(f: File | undefined) {
    setImp(null);
    setMsg(null);
    if (!f) return;
    const text = await f.text().catch(() => "");
    const v = validateBackup(text);
    if (!v.ok) return setMsg({ ok: false, text: v.message });
    setImp({ backup: v.backup, summary: v.summary });
  }

  function doImport() {
    if (!imp) return;
    const r = applyBackup(localStorage, imp.backup);
    if (!r.ok) return setMsg({ ok: false, text: r.message });
    setMsg({ ok: true, text: `${r.written.length}개 항목을 복원했어요. 화면을 새로 불러와요…` });
    setTimeout(() => location.reload(), 900);
  }

  async function doFullReset() {
    if (phrase !== CONFIRM_PHRASE || busy) return;
    setBusy(true);
    const ls = clearExamfitStorage(localStorage);
    const db = await deleteIdb();
    setBusy(false);
    if (!ls.ok || !db.ok) {
      return setMsg({ ok: false, text: `전체 초기화가 끝나지 않았어요. ${!ls.ok ? `지우지 못한 항목: ${ls.remaining.join(", ")}. ` : ""}${!db.ok ? db.message : ""}` });
    }
    setMsg({ ok: true, text: "전체 데이터를 삭제했어요. 화면을 새로 불러와요…" });
    setTimeout(() => location.reload(), 900);
  }

  const plan = full ? planFullReset(localStorage) : null;

  return (
    <Card>
      <h2 className="text-sm font-bold text-warm">데이터 백업 · 초기화</h2>

      <div className="mt-3 rounded-2xl bg-sand/60 p-3">
        <p className="text-sm font-bold">백업 · 복원</p>
        <p className="mt-1 text-xs text-warm">이 기기에 저장된 학습 기록(경험치, 단어·듣기 기록, 일일 학습 세션, 실력 설정, 시험 대비 설정·생성 문제)을 JSON 파일로 내보내요. 완전한 백업이 아니에요.</p>
        <ul className="mt-1 list-disc pl-4 text-[11px] text-warm">
          {BACKUP_EXCLUDES.map((e) => (
            <li key={e}>제외: {e}</li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-2">
          <button className={btnSecondary} onClick={exportBackup}>
            백업 파일 내보내기
          </button>
          <button className={btnSecondary} onClick={() => file.current?.click()}>
            백업 파일 가져오기
          </button>
          <input ref={file} type="file" accept="application/json,.json" className="sr-only" aria-label="백업 파일 선택" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        {imp && (
          <div role="dialog" aria-label="가져오기 확인" className="mt-2 rounded-xl bg-white p-3 text-xs">
            <p className="font-bold">이 백업으로 덮어쓸까요?</p>
            <ul className="mt-1 space-y-0.5">
              <li>백업 날짜: {fmt(imp.summary.exportedAt)}</li>
              <li>항목 {imp.summary.keys.length}개 · 경험치 {imp.summary.xp ?? "-"} · 학습 세션 {imp.summary.sessions}개 · 실력 설정 {imp.summary.hasPlacement ? "포함" : "없음"}</li>
              <li className="text-warm">백업에 있는 항목만 현재 기기의 같은 항목을 덮어써요. 시험 대비 PDF·OCR 자료와 백업에 없는 항목은 그대로예요.</li>
            </ul>
            <div className="mt-2 flex gap-2">
              <button className={`${btnPrimary} !min-h-10`} onClick={doImport}>
                덮어쓰고 복원
              </button>
              <button className={`${btnSecondary} !min-h-10`} onClick={() => setImp(null)}>
                취소
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 rounded-2xl bg-sand/60 p-3">
        <p className="text-sm font-bold">오늘의 학습 초기화</p>
        <p className="mt-1 text-xs text-warm">진행 중인 일상 중국어 세션의 진도만 처음으로 돌려요(단어·문장 목록은 그대로). 누적 XP, 과거 기록, 시험 대비 자료는 유지돼요. 단어·듣기 XP는 문항당 최초 1회만 지급되므로 다시 풀어도 중복 지급되지 않아요.</p>
        {confirm === "today" ? (
          <div className="mt-2 flex gap-2">
            <button
              className={`${btnPrimary} !min-h-10`}
              onClick={() => {
                const r = resetTodaySession(store);
                if (r.reset) {
                  setStore(r.store);
                  setMsg({ ok: true, text: "오늘의 학습 진도를 초기화했어요." });
                } else setMsg({ ok: false, text: "초기화할 진행 중인 세션이 없어요." });
                setConfirm(null);
              }}
            >
              초기화 확인
            </button>
            <button className={`${btnSecondary} !min-h-10`} onClick={() => setConfirm(null)}>
              취소
            </button>
          </div>
        ) : (
          <button className={`${btnSecondary} mt-2`} disabled={!hasActive} onClick={() => setConfirm("today")}>
            {hasActive ? "오늘의 학습 초기화" : "진행 중인 세션이 없어요"}
          </button>
        )}
      </div>

      <div className="mt-3 rounded-2xl bg-sand/60 p-3">
        <p className="text-sm font-bold">중국어 실력 설정 초기화</p>
        <p className="mt-1 text-xs text-warm">자기 평가·진단 결과·추천 수준을 지워 재진단 상태로 바꿔요. 학습 진도와 캐릭터 XP는 유지돼요.</p>
        {confirm === "placement" ? (
          <div className="mt-2 flex gap-2">
            <button
              className={`${btnPrimary} !min-h-10`}
              onClick={() => {
                setPlace(resetPlacementValue());
                setMsg({ ok: true, text: "실력 설정을 초기화했어요. 일상 중국어 탭에서 다시 진단할 수 있어요." });
                setConfirm(null);
              }}
            >
              초기화 확인
            </button>
            <button className={`${btnSecondary} !min-h-10`} onClick={() => setConfirm(null)}>
              취소
            </button>
          </div>
        ) : (
          <button className={`${btnSecondary} mt-2`} onClick={() => setConfirm("placement")}>
            실력 설정 초기화
          </button>
        )}
      </div>

      <div className="mt-3 rounded-2xl border-2 border-cocoa/30 p-3">
        <p className="text-sm font-bold">전체 데이터 초기화</p>
        <p className="mt-1 text-xs text-warm">이 기기에 저장된 EXAMFIT 데이터를 모두 지워요. 되돌릴 수 없어요.</p>
        {!full ? (
          <button className={`${btnSecondary} mt-2`} onClick={() => setFull(true)}>
            삭제 범위 확인하기
          </button>
        ) : (
          <div className="mt-2 text-xs">
            <p className="font-semibold">삭제되는 데이터</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>
                브라우저 저장 항목 {plan!.keys.length}개: <span className="break-all text-warm">{plan!.keys.join(", ") || "없음"}</span>
              </li>
              <li>
                시험 대비 자료 저장소(PDF 원본·추출 텍스트·OCR 결과):{" "}
                {!idb ? "확인 중…" : idb.state === "ok" ? `PDF ${idb.files}개 · ${idb.pages}쪽` : idb.state === "none" ? "저장된 자료 없음" : idb.state === "unknown" ? "개수를 확인할 수 없지만 함께 삭제돼요" : idb.message}
              </li>
              <li>여기에는 경험치, 모든 학습 기록, 실력 설정, 생성 문제, 과목 정보가 포함돼요.</li>
            </ul>
            <p className="mt-2 font-semibold">삭제되지 않는 것</p>
            <ul className="mt-1 list-disc pl-4 text-warm">
              <li>다른 사이트·앱의 저장 데이터({plan!.others}개 항목)</li>
              <li>서버 설정과 API 키(브라우저에 저장되지 않아요)</li>
            </ul>
            <label className="mt-3 block font-semibold" htmlFor="reset-phrase">
              계속하려면 ‘{CONFIRM_PHRASE}’를 입력하세요
            </label>
            <input id="reset-phrase" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" className="mt-1 min-h-11 w-full rounded-xl border border-charcoal/20 bg-white px-3 text-sm" />
            <div className="mt-2 flex gap-2">
              <button className={`${btnPrimary} !min-h-10`} disabled={phrase !== CONFIRM_PHRASE || busy} onClick={() => void doFullReset()}>
                {busy ? "삭제 중…" : "전체 삭제 실행"}
              </button>
              <button className={`${btnSecondary} !min-h-10`} disabled={busy} onClick={() => (setFull(false), setPhrase(""))}>
                취소
              </button>
            </div>
          </div>
        )}
      </div>
      <Msg n={msg} />
    </Card>
  );
}

// ───── 핏찹이 이름 변경(이름만 바꾼다: 이미지·XP·레벨·학습 기록은 그대로) ─────
function NameEditor() {
  const { display, name, save } = useFitchapName();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const len = Array.from(text.trim()).length;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = validateName(text);
    if (!v.ok) return setErr(v.message);
    if (v.name === name) {
      setEditing(false);
      return setDone("이름이 그대로예요.");
    }
    const r = save(text);
    if (!r.ok) return setErr(r.message);
    setEditing(false);
    setErr(null);
    setDone(`이름을 ‘${v.name}’(으)로 바꿨어요. 경험치와 학습 기록은 그대로예요.`);
  }

  return (
    <div className="mt-2">
      {!editing ? (
        <>
          <p className="flex min-w-0 items-center gap-2 text-sm">
            <span className="text-xs font-semibold text-warm">이름</span>
            <b className="min-w-0 break-words">{display}</b>
            <button className="min-h-9 shrink-0 rounded-xl bg-white/70 px-3 text-xs font-semibold" onClick={() => (setText(name || display), setErr(null), setDone(null), setEditing(true))}>
              이름 변경
            </button>
          </p>
          {done && (
            <p role="status" className="mt-1 text-xs font-medium">
              ✓ {done}
            </p>
          )}
        </>
      ) : (
        <form onSubmit={submit}>
          <label className="block text-xs font-semibold text-warm" htmlFor="rename-input">
            새 이름 (1~{NAME_MAX}자)
          </label>
          <input id="rename-input" value={text} onChange={(e) => (setText(e.target.value), setErr(null))} autoComplete="off" autoFocus aria-invalid={!!err} className="mt-1 min-h-10 w-full rounded-xl border border-charcoal/20 bg-white px-3 text-sm font-semibold text-charcoal" />
          <p className={`mt-0.5 text-right text-[11px] ${len > NAME_MAX ? "font-semibold text-charcoal" : "text-warm"}`}>
            {len}/{NAME_MAX}
          </p>
          {err && (
            <p role="alert" className="mt-1 rounded-xl bg-white p-2 text-xs font-medium">
              ⚠ {err}
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <button type="submit" className={`${btnPrimary} !min-h-10 !px-4`}>
              저장
            </button>
            <button type="button" className={`${btnSecondary} !min-h-10 !px-4`} onClick={() => (setEditing(false), setErr(null))}>
              취소
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
