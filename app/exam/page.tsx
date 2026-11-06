"use client";
import { useCallback, useRef, useState } from "react";
import { Icon } from "@/components/Icons";
import { PdfReview, type MaterialSummary } from "@/components/PdfReview";
import { Badge, btnLarge, btnPrimary, btnSecondary, Card, choiceClass, PageHeader, ProgressBar } from "@/components/ui";
import { XP_REWARD } from "@/lib/character";
import { SAMPLE_EXAM_QUESTIONS, SAMPLE_STATUS, type SampleQuestion } from "@/lib/data";
import { useLocalState } from "@/lib/useLocalState";
import { AnswerFeedback } from "@/components/AnswerFeedback";
import { OralExam } from "@/components/OralExam";
import { useServerFlags } from "@/lib/useServerFlags";
import { deriveFormat, isSimilarStem, MAX_QUESTIONS, ORAL_TYPES, planJob, QUESTION_TYPES, type GeneratedQuestion, type JobPlan } from "@/lib/generate";
import { selectForGeneration } from "@/lib/materials";
import { httpFailureText } from "@/lib/ocr";
import { listFiles, listPages, type PdfPage } from "@/lib/pdfStore";

const field = "min-h-12 w-full rounded-2xl border border-charcoal/15 bg-white px-4 text-sm";
const STEPS = ["과목", "자료", "문제 설정", "풀이"];

type Course = { name: string; examDate: string };
type Job = {
  running: boolean;
  done: number; // 완료된 AI 호출 수
  total: number;
  got: number; // 검증·중복 제거를 통과한 문제 수
  requested: number;
  failures: string[];
  dup: number;
  rej: number;
  tokens: { input: number; output: number } | null; // 응답에 usage가 있을 때만
  insufficient: string[];
};

export default function ExamPage() {
  const [course, setCourse] = useLocalState<Course>("examfit.course", { name: "", examDate: "" });
  const [step, setStep] = useState(0);
  const [mat, setMat] = useState<MaterialSummary>({ files: 0, failedFiles: 0, pages: 0, usable: 0, review: 0, empty: 0, failed: 0, reviewed: 0, confirmed: 0, selected: 0, extracting: false });
  const onSummary = useCallback((m: MaterialSummary) => setMat(m), []);
  const [types, setTypes] = useState<string[]>([]);
  const flags = useServerFlags();
  const oralBlocked = flags !== null && !flags.oral; // AI 구술시험(음성)이 서버에서 꺼져 있는지
  const [oralMode, setOralMode] = useState(false); // false=필기형, true=AI 말하기 시험
  const [oralTypes, setOralTypes] = useState<string[]>([]);
  const [oralQs, setOralQs, oralReady] = useLocalState<GeneratedQuestion[]>("examfit.oralQuestions", []);
  const activeTypes = oralMode ? oralTypes : types;
  const [countText, setCountText] = useState("10"); // 숫자만 허용(빈 값은 검증에서 막는다)
  const count = Number(countText);
  const [style, setStyle] = useState("");
  const modeLabel = oralMode ? "AI 말하기 시험" : deriveFormat(style) === "short" ? "단답·서술형" : "5지선다";
  const [generated, setGenerated, genReady] = useLocalState<GeneratedQuestion[]>("examfit.generatedQuestions", []);
  const [demo, setDemo] = useState(false);
  const [gen, setGen] = useState<{ loading: boolean; error: string | null; note: string | null }>({ loading: false, error: null, note: null });

  // 확인 대기 중인 생성 계획(이 시점까지 AI 호출 없음)과 진행 중인 작업
  const [plan, setPlan] = useState<JobPlan | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const running = useRef(false); // 동일 작업 중복 실행 방지
  const abort = useRef<AbortController | null>(null);
  const busy = gen.loading || !!job?.running;

  // 1단계: 버튼 → 자료를 읽어 계획만 세운다. AI는 호출하지 않고 확인 단계를 보여 준다.
  async function prepare() {
    if (busy || plan || countInvalid) return;
    setGen({ loading: true, error: null, note: null });
    setJob(null);
    try {
      const files = await listFiles();
      const pages: Record<string, PdfPage[]> = {};
      for (const f of files) pages[f.id] = await listPages(f.id);
      const items = selectForGeneration(files, pages).items.map(({ fileId, fileName, page, text }) => ({ fileId, fileName, page, text }));
      const p = planJob(items, count);
      if (p.batches.length === 0) throw new Error("문제 생성에 사용할 수 있는 자료 텍스트가 없습니다.");
      setPlan(p);
      setGen({ loading: false, error: null, note: null });
    } catch (e) {
      setGen({ loading: false, error: (e as Error).message || "자료를 준비하지 못했습니다.", note: null });
    }
  }

  // 2단계: 사용자가 확인하면 배치를 순서대로 1회씩 호출한다. 재시도 없음, 실패 배치는 기록만 하고 이미 만든 문제는 보존한다.
  async function start() {
    if (!plan || running.current) return;
    running.current = true;
    const p = plan;
    setPlan(null);
    const ac = new AbortController();
    abort.current = ac;
    const jobId = Date.now().toString(36);
    const all: GeneratedQuestion[] = [];
    const j: Job = { running: true, done: 0, total: p.batches.length, got: 0, requested: count, failures: [], dup: 0, rej: 0, tokens: null, insufficient: [] };
    setJob({ ...j });
    let consecutive = 0;
    try {
      for (const b of p.batches) {
        if (ac.signal.aborted) break;
        let fatal = false;
        try {
          const res = await fetch("/api/exam/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: ac.signal,
            body: JSON.stringify({ items: b.items, types: activeTypes, mode: oralMode ? "oral" : "written", style, count: b.count, avoid: all.map((q) => q.stem) }),
          });
          const data = (await res.json().catch(() => ({}))) as { questions?: GeneratedQuestion[]; rejected?: unknown[]; insufficient?: string[]; usage?: { prompt_tokens?: number; completion_tokens?: number }; message?: string; missing?: string[] };
          if (!res.ok) {
            const miss = data.missing?.length ? ` 필요한 서버 설정: ${data.missing.join(", ")}` : "";
            j.failures.push(`${b.index + 1}/${p.batches.length}번째 호출 실패: ${httpFailureText(res.status, data.message)}${miss}`);
            consecutive++;
            if ([400, 403, 429, 503].includes(res.status)) fatal = true; // 설정·한도 문제는 계속 호출해도 소용없다
            if (data.insufficient?.length) j.insufficient.push(...data.insufficient);
          } else {
            consecutive = 0;
            j.rej += data.rejected?.length ?? 0;
            if (data.insufficient?.length) j.insufficient.push(...data.insufficient);
            if (data.usage) j.tokens = { input: (j.tokens?.input ?? 0) + (data.usage.prompt_tokens ?? 0), output: (j.tokens?.output ?? 0) + (data.usage.completion_tokens ?? 0) };
            for (const q of data.questions ?? []) {
              if (all.length >= count) break;
              if (all.some((x) => isSimilarStem(x.stem, q.stem))) {
                j.dup++;
                continue;
              }
              all.push({ ...q, id: `gen-${jobId}-${all.length}` });
            }
            j.got = all.length;
            if (all.length) (oralMode ? setOralQs : setGenerated)([...all]); // 부분 성공도 바로 저장
          }
        } catch (e) {
          if (ac.signal.aborted) break;
          j.failures.push(`${b.index + 1}/${p.batches.length}번째 호출 실패: ${(e as Error).message || "네트워크 오류"}`);
          consecutive++;
        }
        j.done++;
        setJob({ ...j });
        if (fatal || consecutive >= 2) break; // 연속 실패 시 중단(무한 재시도 없음)
      }
    } finally {
      running.current = false;
      abort.current = null;
      setJob({ ...j, running: false });
    }
    if (all.length > 0 && !ac.signal.aborted) setStep(3);
  }

  const countInvalid = !/^[1-9]\d*$/.test(countText) || count > MAX_QUESTIONS;
  const dday = course.examDate ? Math.ceil((new Date(course.examDate).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000) : null;
  const ddayLabel = dday === null ? null : dday > 0 ? `D-${dday}` : dday === 0 ? "D-Day" : `D+${-dday}`;
  const done = [course.name.trim() !== "", mat.selected > 0, activeTypes.length > 0 && !countInvalid, false];

  return (
    <>
      <PageHeader title="시험 대비" desc="과목 → 자료 → 문제 설정 → 풀이 순서로 준비해요." />

      <nav aria-label="시험 준비 단계" className="mb-5">
        <ol className="grid grid-cols-4 gap-2">
          {STEPS.map((s, i) => {
            const cur = i === step;
            return (
              <li key={s}>
                <button onClick={() => setStep(i)} aria-current={cur ? "step" : undefined} className="flex w-full flex-col items-center gap-1.5 text-xs font-semibold">
                  <span className={`h-1.5 w-full rounded-full ${cur ? "bg-charcoal" : done[i] ? "bg-sage-dark" : "bg-charcoal/12"}`} />
                  <span className="flex items-center gap-1.5">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${cur ? "bg-charcoal text-white" : done[i] ? "bg-sage-dark text-white" : "bg-charcoal/10 text-warm"}`}>
                      {done[i] && !cur ? <Icon name="check" className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <span className={`hidden sm:inline ${cur ? "" : "text-warm"}`}>{s}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-center text-sm font-bold sm:hidden">
          {step + 1}단계 · {STEPS[step]}
        </p>
      </nav>

      <div key={step} className="anim-pop">
        {step === 0 && (
          <div className="grid gap-4 md:grid-cols-[1fr_280px]">
            <Card>
              <h2 className="text-lg font-bold">어떤 과목의 시험인가요?</h2>
              <div className="mt-4 space-y-4">
                <label className="block text-sm font-medium">
                  과목명
                  <input className={`${field} mt-1.5`} value={course.name} onChange={(e) => setCourse({ ...course, name: e.target.value })} placeholder="예: 고객응대중국어" />
                </label>
                <label className="block text-sm font-medium">
                  시험일 (선택)
                  <input type="date" className={`${field} mt-1.5`} value={course.examDate} onChange={(e) => setCourse({ ...course, examDate: e.target.value })} />
                </label>
              </div>
              <p className="mt-4 text-xs text-warm">이 기기의 브라우저에만 저장됩니다.</p>
            </Card>
            <Card tone={course.name ? "sage" : "soft"} className="flex flex-col justify-center text-center">
              {course.name ? (
                <>
                  <p className="text-xs font-semibold text-warm">등록된 시험</p>
                  <p className="mt-1 text-xl font-bold">{course.name}</p>
                  {ddayLabel && <p className="mt-2 text-4xl font-extrabold text-sage-dark">{ddayLabel}</p>}
                  {!ddayLabel && <p className="mt-2 text-sm text-warm">시험일을 입력하면 D-day가 표시돼요</p>}
                </>
              ) : (
                <p className="text-sm text-warm">과목명을 입력하면 이곳에 시험 정보가 표시돼요</p>
              )}
            </Card>
          </div>
        )}

        {step === 1 && <PdfReview onSummary={onSummary} onContinue={() => setStep(2)} />}

        {step === 2 && (
          <div className="grid gap-4 md:grid-cols-[1fr_300px] md:items-start">
            <Card>
              <h2 className="text-lg font-bold">문제 설정</h2>
              <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="시험 형식">
                {[
                  { v: false, label: "필기형 문제" },
                  { v: true, label: "AI 말하기 시험" },
                ].map((m) => (
                  <button key={m.label} type="button" aria-pressed={oralMode === m.v} onClick={() => setOralMode(m.v)} className={`min-h-12 rounded-2xl text-sm font-bold transition ${oralMode === m.v ? "bg-sage-dark text-white" : "bg-sand hover:bg-sage-soft"}`}>
                    {m.label}
                  </button>
                ))}
              </div>
              {oralMode && oralBlocked && (
                <p role="alert" className="mt-3 rounded-2xl bg-sand p-3 text-xs font-medium">
                  ⚠ AI 구술시험(음성)은 이 배포에서 비활성화되어 있어요. 말하기 문제는 만들어도 풀 수 없어서 생성도 막아 두었어요. 필기형 문제를 선택해 주세요.
                </p>
              )}
              <p className="mt-4 text-sm font-semibold">{oralMode ? "말하기 유형" : "문제 유형"}</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {(oralMode ? ORAL_TYPES : QUESTION_TYPES).map((t) => {
                  const on = activeTypes.includes(t);
                  return (
                    <li key={t}>
                      <button
                        aria-pressed={on}
                        onClick={() => (oralMode ? setOralTypes : setTypes)((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))}
                        className={`inline-flex min-h-10 items-center gap-1 rounded-full px-4 text-sm font-semibold transition ${on ? "bg-sage-dark text-white" : "bg-sand hover:bg-sage-soft"}`}
                      >
                        {on && <Icon name="check" className="h-4 w-4" />}
                        {t}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-5">
                <label className="text-sm font-semibold" htmlFor="q-count">
                  문제 수 (1~{MAX_QUESTIONS}, 직접 입력)
                </label>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <input
                    id="q-count"
                    inputMode="numeric"
                    autoComplete="off"
                    value={countText}
                    onChange={(e) => setCountText(e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 4))}
                    aria-invalid={countInvalid}
                    className={`${field} w-28`}
                  />
                  {[10, 30, 50, 100].map((n) => (
                    <button key={n} type="button" aria-pressed={count === n} onClick={() => setCountText(String(n))} className={`min-h-10 rounded-full px-4 text-sm font-semibold transition ${count === n ? "bg-sage-dark text-white" : "bg-sand hover:bg-sage-soft"}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              {countInvalid && (
                <p role="alert" className="mt-1.5 text-sm font-medium">
                  ⚠ 1~{MAX_QUESTIONS} 사이의 정수를 입력해 주세요. (크레딧 보호를 위한 한도예요)
                </p>
              )}
              <label className="mt-5 block text-sm font-semibold">
                교수님 출제 방식 (자유 입력)
                <textarea value={style} onChange={(e) => setStyle(e.target.value)} rows={3} placeholder="예: 5지선다, 중국어 문장 배열, 틀린 문장 고르기" className="mt-1.5 w-full rounded-2xl border border-charcoal/15 bg-white p-4 text-sm font-normal" />
              </label>
            </Card>

            <Card tone="dark">
              <h3 className="font-bold">생성 전 요약</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <Row k="과목" v={course.name || "미입력"} />
                <Row k="시험일" v={ddayLabel ?? "미입력"} />
                <Row k="자료" v={mat.pages ? `사용 ${mat.selected}/${mat.pages}쪽` : "없음"} />
                <Row k="형식" v={oralMode ? "AI 말하기 시험" : "필기형"} />
                <Row k="유형" v={activeTypes.length ? `${activeTypes.length}개 선택` : "미선택"} />
                <Row k="문제 수" v={countInvalid ? "확인 필요" : `${count}문제`} />
                <Row k="출제 방식" v={style.trim() ? "입력됨" : "미입력"} />
              </dl>
              {mat.pages === 0 ? (
                <p className="mt-4 rounded-2xl bg-white/10 p-3 text-xs">강의자료가 없습니다. 자료 단계에서 PDF를 추가해 주세요.</p>
              ) : mat.selected === 0 ? (
                <p className="mt-4 rounded-2xl bg-white/10 p-3 text-xs">사용할 수 있는 텍스트가 없습니다. 자료 단계에서 파일을 확인해 주세요.</p>
              ) : mat.selected < mat.pages ? (
                <p className="mt-4 rounded-2xl bg-white/10 p-3 text-xs">
                  {mat.pages - mat.selected}쪽(확인 권장·텍스트 없음·실패)은 문제 생성에 사용되지 않습니다. 자료 단계의 ‘상세 확인’에서 확인할 수 있어요.
                </p>
              ) : null}
              {plan ? (
                <div className="mt-5 rounded-2xl bg-white/10 p-4 text-sm" role="dialog" aria-label="생성 확인">
                  <p className="font-bold">AI 호출 전 확인</p>
                  <ul className="mt-2 space-y-1 text-xs text-white/90">
                    <li>문제 {count}개 · {modeLabel}</li>
                    <li>
                      AI 호출 {plan.batches.length}회 (호출당 {Math.min(...plan.batches.map((b) => b.count))}~{Math.max(...plan.batches.map((b) => b.count))}문제)
                    </li>
                    <li>
                      자료 {plan.pagesCovered}/{plan.pagesTotal}쪽을 출제 범위에 포함{plan.complete ? "" : " (호출 상한으로 일부 쪽만 균등 선택됨)"}
                    </li>
                    <li>호출마다 FactChat 크레딧이 사용돼요. 정확한 비용은 알 수 없어요.</li>
                  </ul>
                  <div className="mt-3 flex gap-2">
                    <button className={`${btnPrimary} flex-1 !bg-white !text-charcoal`} onClick={() => void start()}>
                      생성 시작
                    </button>
                    <button className={`${btnSecondary} !bg-white/10 !text-white`} onClick={() => setPlan(null)}>
                      취소
                    </button>
                  </div>
                </div>
              ) : job?.running ? (
                <div className="mt-5 rounded-2xl bg-white/10 p-4 text-sm" role="status">
                  <p className="font-bold">
                    생성 중 · {job.done}/{job.total}회 호출 완료
                  </p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20">
                    <div className="h-full rounded-full bg-white transition-all" style={{ width: `${(job.done / job.total) * 100}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-white/80">
                    검증 통과 {job.got}/{job.requested}문제{job.failures.length ? ` · 실패 ${job.failures.length}회` : ""}
                  </p>
                  <button className={`${btnSecondary} mt-3 !bg-white/10 !text-white`} onClick={() => abort.current?.abort()}>
                    중단 (만든 문제는 보존)
                  </button>
                </div>
              ) : (
                <button className={`${btnPrimary} ${btnLarge} mt-5 w-full`} disabled={mat.selected === 0 || mat.extracting || busy || countInvalid || (oralMode && oralBlocked)} onClick={() => void prepare()}>
                  {gen.loading ? "자료 준비 중…" : "AI 예상문제 생성"}
                </button>
              )}
              {gen.error && (
                <p role="alert" className="mt-3 rounded-2xl bg-white/10 p-3 text-xs">
                  ⚠ {gen.error}
                </p>
              )}
              {job && !job.running && (
                <div role="status" className="mt-3 rounded-2xl bg-white/10 p-3 text-xs">
                  <p className="font-semibold">
                    {job.got}/{job.requested}문제 생성
                    {job.got < job.requested ? ` — 요청보다 ${job.requested - job.got}문제 적어요(억지로 채우지 않았어요)` : ""}
                  </p>
                  <p className="mt-1 text-white/80">
                    검증 제외 {job.rej} · 중복 제외 {job.dup} · 실패한 호출 {job.failures.length}/{job.total}
                    {job.done < job.total ? ` · 미실행 ${job.total - job.done}회` : ""}
                  </p>
                  {job.insufficient.length > 0 && <p className="mt-1 text-white/80">자료 근거 부족으로 못 만든 유형: {[...new Set(job.insufficient)].join(", ")}</p>}
                  {job.tokens && <p className="mt-1 text-white/80">AI 응답 기준 토큰 사용량: 입력 {job.tokens.input} · 출력 {job.tokens.output}</p>}
                  {job.failures.map((f) => (
                    <p key={f} className="mt-1">⚠ {f}</p>
                  ))}
                </div>
              )}
              <p className="mt-2 text-center text-xs text-white/60">
                {countInvalid ? "" : `${count}문제 요청 · `}
                {modeLabel} · 선택한 유형과 출제 방식이 반영돼요. 확인 후 시작할 때만 AI를 호출하고, 이미 생성한 문제를 다시 푸는 데는 호출하지 않아요.
              </p>
              {(oralMode ? oralQs : generated).length > 0 && (
                <button className={`${btnSecondary} mt-3 w-full !bg-white/10 !text-white`} onClick={() => setStep(3)}>
                  이전에 생성한 문제 풀기
                </button>
              )}
            </Card>
          </div>
        )}

        {step === 3 && oralMode && (!oralReady ? null : oralQs.length > 0 ? (
          <OralExam key={oralQs.map((q) => q.id).join(",")} questions={oralQs} />
        ) : (
          <Card tone="soft" className="text-center">
            <p className="text-lg font-bold">아직 생성된 말하기 문제가 없어요</p>
            <p className="mt-1 text-sm text-warm">문제 설정 단계에서 ‘AI 말하기 시험’ 유형을 고르고 ‘AI 예상문제 생성’을 눌러 주세요.</p>
            <button className={`${btnPrimary} mt-4`} onClick={() => setStep(2)}>
              문제 설정으로
            </button>
          </Card>
        ))}
        {step === 3 && !oralMode &&
          (!genReady ? null : demo ? (
            <SamplePractice generated={[]} demo />
          ) : generated.length > 0 ? (
            <SamplePractice generated={generated} />
          ) : (
            <Card tone="soft" className="text-center">
              <p className="text-lg font-bold">아직 생성된 문제가 없어요</p>
              <p className="mt-1 text-sm text-warm">문제 설정 단계에서 ‘AI 예상문제 생성’을 눌러 주세요. 고정 예시 문제로 대신하지 않아요.</p>
              <button className={`${btnPrimary} mt-4`} onClick={() => setStep(2)}>
                문제 설정으로
              </button>
              {process.env.NODE_ENV === "development" && (
                <button className="mt-3 block w-full text-xs text-warm underline" onClick={() => setDemo(true)}>
                  (개발용) 고정 데모 문제 보기
                </button>
              )}
            </Card>
          ))}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <button className={`${btnSecondary} ${step === 0 ? "invisible" : ""}`} onClick={() => setStep(step - 1)}>
          ← 이전 단계
        </button>
        {step < 3 && (
          <button className={`${btnPrimary} ${btnLarge} flex-1 md:flex-none`} onClick={() => setStep(step + 1)}>
            다음 · {STEPS[step + 1]}
          </button>
        )}
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-white/60">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  );
}

function SamplePractice({ generated, demo = false }: { generated: GeneratedQuestion[]; demo?: boolean }) {
  const isGen = !demo;
  const QS: (SampleQuestion & { source?: GeneratedQuestion["source"]; evidence?: string; kind?: "mcq" | "short"; modelAnswer?: string; questionType?: string })[] = demo ? SAMPLE_EXAM_QUESTIONS : generated;
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [text, setText] = useState(""); // 서술형 답안(채점하지 않음)
  const [shown, setShown] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [, setXp] = useLocalState("examfit.xp", SAMPLE_STATUS.xp);
  const [rewarded, setRewarded] = useLocalState<string[]>("examfit.examRewarded", []);
  const q = QS[i];
  const total = QS.length;
  const isShort = q.kind === "short";
  const answered = isShort ? shown : picked !== null;
  const mcqTotal = QS.filter((x) => x.kind !== "short").length;

  function pick(c: number) {
    if (picked !== null) return;
    setPicked(c);
    if (c === q.correctIndex) setScore((s) => s + 1);
    // 같은 문제는 1회만 경험치 지급
    // AI 생성 문제는 다시 생성해 경험치를 반복 획득할 수 있으므로 지급하지 않는다.
    if (!isGen && c === q.correctIndex && !rewarded.includes(q.id)) {
      setXp((x) => x + XP_REWARD["exam-question-correct"]);
      setRewarded((p) => [...p, q.id]);
    }
  }

  function advance() {
    setPicked(null);
    setText("");
    setShown(false);
    if (i + 1 >= total) setFinished(true);
    else setI(i + 1);
  }

  function restart() {
    setI(0);
    setPicked(null);
    setText("");
    setShown(false);
    setAnswers({});
    setScore(0);
    setFinished(false);
  }

  if (finished) {
    return (
      <Card tone="sage" className="anim-pop p-8 text-center">
        <Badge tone="gray">{isGen ? "AI 생성 문제 결과" : "개발용 데모 결과"}</Badge>
        <p className="mt-4 text-5xl font-extrabold text-sage-dark">
          {mcqTotal > 0 ? score : total}
          <span className="text-2xl text-warm"> / {mcqTotal > 0 ? mcqTotal : total}</span>
        </p>
        <p className="mt-2 font-bold">{mcqTotal === 0 ? "서술형은 자동 채점하지 않아요. 모범답안과 비교해 보세요." : score === mcqTotal ? "모두 맞혔어요!" : "수고했어요! 다시 풀어 볼까요?"}</p>
        <p className="mt-1 text-xs text-warm">경험치는 문제당 처음 맞혔을 때 한 번만 지급돼요</p>
        {isGen && (
          <ol className="mt-5 space-y-3 text-left text-sm">
            {QS.map((x, n) => (
              <li key={x.id} className="rounded-2xl bg-white/70 p-3">
                <p className="font-semibold">
                  {n + 1}. {x.stem}
                </p>
                {x.kind === "short" ? (
                  <>
                    <p className="mt-1 text-xs text-warm">내 답안: {answers[x.id]?.trim() || "(입력 없음)"}</p>
                    <p className="mt-1">모범답안: {x.modelAnswer}</p>
                  </>
                ) : (
                  <p className="mt-1">정답: {x.correctIndex + 1}번 {x.choices[x.correctIndex]}</p>
                )}
                <p className="mt-1 text-xs text-warm">{x.explanation}</p>
                {x.source && (
                  <p className="mt-1 text-xs">
                    출처: {x.source.fileName} · {x.source.page}쪽{x.evidence ? ` — “${x.evidence}”` : ""}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
        <button className={`${btnPrimary} ${btnLarge} mt-6`} onClick={restart}>
          다시 풀기
        </button>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-2xl">
      <div className="flex items-center gap-3">
        <ProgressBar value={(i + (answered ? 1 : 0)) / total} className="flex-1" />
        <span className="text-sm font-semibold">
          {i + 1}/{total}
        </span>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Badge>{q.type}</Badge>
        {q.questionType && <Badge tone="gray">{q.questionType}</Badge>}
        {isGen ? <Badge tone="gray">AI 생성 · 자료 근거 확인됨(원본과의 일치는 보장하지 않음)</Badge> : <Badge tone="gray">고정 예시 · AI 생성 아님</Badge>}
      </div>
      <p className="mt-4 text-xl font-bold leading-snug">{q.stem}</p>
      {isShort ? (
        <div className="mt-5">
          <label className="text-sm font-semibold" htmlFor="short-answer">
            내 답안 (자동 채점하지 않아요)
          </label>
          <textarea
            id="short-answer"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={shown}
            rows={4}
            lang="zh"
            placeholder="답안을 직접 적어 보세요"
            className="mt-1.5 w-full rounded-2xl border border-charcoal/15 bg-white p-3 text-base leading-relaxed disabled:bg-sand/50"
          />
          {!shown && (
            <button
              className={`${btnPrimary} ${btnLarge} mt-3 w-full`}
              onClick={() => {
                setShown(true);
                setAnswers((a) => ({ ...a, [q.id]: text }));
              }}
            >
              모범답안 확인
            </button>
          )}
        </div>
      ) : (
      <ul className="mt-5 grid gap-2.5">
          {q.choices.map((c, k) => {
            const st = picked === null ? "idle" : k === q.correctIndex ? "correct" : k === picked ? "wrong" : "dim";
            return (
              <li key={c}>
                <button onClick={() => pick(k)} disabled={picked !== null} className={choiceClass(st)}>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${st === "correct" ? "bg-sage-dark text-white" : st === "wrong" ? "bg-charcoal text-white" : "bg-charcoal/8 text-warm"}`}>
                    {st === "correct" ? <Icon name="check" className="h-4 w-4" /> : st === "wrong" ? <Icon name="x" className="h-4 w-4" /> : k + 1}
                  </span>
                  {c}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {isShort && shown && (
        <div role="status" className="anim-pop mt-5 rounded-2xl bg-sage-soft p-4">
          <p className="text-xs font-semibold text-warm">내 답안</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm">{(answers[q.id] ?? text).trim() || "(작성하지 않았어요)"}</p>
          <p className="mt-3 text-xs font-semibold text-warm">모범답안</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-base font-bold">{q.modelAnswer}</p>
          <AnswerFeedback questionId={q.id} input={{ stem: q.stem, modelAnswer: q.modelAnswer ?? "", explanation: q.explanation, evidence: q.evidence ?? "", answer: answers[q.id] ?? text }} />
          <p className="mt-3 text-sm text-warm">{q.explanation}</p>
          {q.source && (
            <div className="mt-3 rounded-xl bg-white/70 p-3 text-xs">
              <p className="font-semibold">출처: {q.source.fileName} · {q.source.page}쪽</p>
              {q.evidence && <p className="mt-1 text-warm">“{q.evidence}”</p>}
            </div>
          )}
          <button className={`${btnPrimary} ${btnLarge} mt-4 w-full`} onClick={advance}>
            {i + 1 >= total ? "결과 보기" : "다음 문제"}
          </button>
        </div>
      )}
      {!isShort && picked !== null && (
        <div role="status" className={`anim-pop mt-5 rounded-2xl p-4 ${picked === q.correctIndex ? "bg-sage-soft" : "bg-sand"}`}>
          <p className="font-bold">{picked === q.correctIndex ? "정답입니다!" : "아쉬워요, 오답입니다."}</p>
          <p className="mt-1 text-sm text-warm">{q.explanation}</p>
          {q.source && (
            <div className="mt-3 rounded-xl bg-white/70 p-3 text-xs">
              <p className="font-semibold">출처: {q.source.fileName} · {q.source.page}쪽</p>
              {q.evidence && <p className="mt-1 text-warm">“{q.evidence}”</p>}
            </div>
          )}
          <button className={`${btnPrimary} ${btnLarge} mt-4 w-full`} onClick={advance}>
            {i + 1 >= total ? "결과 보기" : "다음 문제"}
          </button>
        </div>
      )}
    </Card>
  );
}
