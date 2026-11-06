"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { FitchapBubble } from "./FitchapBubble";
import { Icon } from "./Icons";
import { Badge, btnLarge, btnPrimary, btnSecondary, Card, ProgressBar } from "./ui";
import type { GeneratedQuestion } from "@/lib/generate";
import { attemptLabel, canAnswer, ERROR_LABEL, MAX_ATTEMPTS, type OralQ, type QState } from "@/lib/oral";
import { OralSession, type OralState, type Phase } from "@/lib/oralSession";
import { BrowserTransport } from "@/lib/realtime";
import { useServerFlags } from "@/lib/useServerFlags";
import type { FitchapEvent } from "@/lib/fitchapLines";

const PHASE_LABEL: Record<Phase, string> = {
  connecting: "준비 중",
  asking: "AI 질문 중",
  ready: "재시도 가능",
  recording: "사용자 답변 중",
  evaluating: "피드백 처리 중",
  feedback: "AI 피드백 중",
  finished: "시험 종료",
  error: "연결 오류",
};
const OUTCOME_LABEL: Record<QState["outcome"], string> = { pending: "미응시", correct: "AI 판정: 정답", exhausted: "재시도 종료", skipped: "건너뜀", unclear: "인식 불가로 종료" };
const LENGTHS = [
  { min: 1, label: "테스트 1분 (기본)" },
  { min: 10, label: "10분" },
  { min: 30, label: "30분" },
];

const toOralQ = (q: GeneratedQuestion): OralQ => ({ id: q.id, questionType: q.questionType, stem: q.stem, modelAnswer: q.modelAnswer, explanation: q.explanation, evidence: q.evidence, source: q.source });

export function OralExam({ questions }: { questions: GeneratedQuestion[] }) {
  const [active, setActive] = useState<GeneratedQuestion[]>(questions);
  const flags = useServerFlags();
  const oralOff = flags !== null && !flags.oral; // 서버에서 음성 세션이 꺼져 있는지(확인 전·실패 시에는 막지 않음)
  const [stage, setStage] = useState<"intro" | "starting" | "live">("intro");
  const [minutes, setMinutes] = useState(1);
  const [startErr, setStartErr] = useState<string | null>(null);
  const [ui, setUi] = useState<OralState | null>(null);
  const [left, setLeft] = useState(0);
  const [clockRunning, setClockRunning] = useState(false);
  const session = useRef<OralSession | null>(null);
  const starting = useRef(false); // 세션 중복 생성 방지

  // 화면을 떠나면 마이크·재생·소켓을 즉시 해제한다.
  useEffect(
    () => () => {
      session.current?.finish(); // 시계·타이머 정리 포함
    },
    [],
  );

  // 시간 표시는 세션의 시계를 읽기만 한다(여기서는 차감하지 않는다).
  useEffect(() => {
    if (stage !== "live") return;
    const id = setInterval(() => {
      const t = session.current?.timer;
      setLeft(t?.leftSec ?? 0);
      setClockRunning(!!t?.running);
    }, 500);
    return () => clearInterval(id);
  }, [stage]);

  // 사용자가 '말하기 시험 시작'을 누른 경우에만 서버에서 1회용 토큰을 받아 음성 세션을 연다.
  async function open(): Promise<BrowserTransport | null> {
    const res = await fetch("/api/exam/oral/session", { method: "POST" });
    const d = (await res.json().catch(() => ({}))) as { url?: string; message?: string; missing?: string[] };
    if (!res.ok || !d.url) {
      const miss = d.missing?.length ? ` 필요한 서버 설정: ${d.missing.join(", ")}` : "";
      throw new Error(`${d.message ?? "음성 세션을 시작하지 못했어요."}${miss}`);
    }
    return new BrowserTransport(d.url);
  }

  async function start() {
    if (starting.current) return;
    starting.current = true;
    setStartErr(null);
    setStage("starting");
    try {
      const t = await open();
      const s = new OralSession(active.map(toOralQ), t!, setUi, { limitSec: minutes * 60 });
      session.current = s;
      setUi(s.state);
      setStage("live");
      setLeft(minutes * 60);
      await s.start();
    } catch (e) {
      setStage("intro");
      setStartErr((e as Error).message);
    } finally {
      starting.current = false;
    }
  }

  async function reconnect() {
    if (starting.current || !session.current) return;
    starting.current = true;
    try {
      const t = await open();
      await session.current.reconnect(t!);
    } catch (e) {
      setStartErr((e as Error).message);
    } finally {
      starting.current = false;
    }
  }

  function end() {
    session.current?.finish();
  }

  // ───── 시작 전 ─────
  if (stage !== "live" || !ui) {
    return (
      <Card tone="soft" className="mx-auto max-w-2xl">
        <FitchapBubble event="oral.start" keep reserve={false} />
        <div className="mt-3" />
        {oralOff && (
          <p role="alert" className="mb-3 rounded-2xl bg-white p-3 text-sm font-medium">
            ⚠ AI 구술시험(음성)은 이 배포에서 비활성화되어 있어요. 비용과 남용 방지를 위해 꺼 두었고, 문제 생성·스캔 인식·서술형 피드백은 사용할 수 있어요.
          </p>
        )}
        <Badge tone="dark">AI 구술시험</Badge>
        <h2 className="mt-3 text-xl font-bold">AI 교수님과 중국어 말하기 시험</h2>
        <p className="mt-1 text-sm text-warm">
          질문 {active.length}개 · 문제당 최초 답변 1회 + 재시도 2회(총 {MAX_ATTEMPTS}회). 질문과 교정은 음성으로 들려드리고, 중요한 교정은 화면에도 표시해요.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-warm">
          <li>‘말하기 시험 시작’을 누를 때만 음성 세션이 연결되고, 시험을 끝내면 즉시 해제돼요. 연결 중에는 FactChat 음성 크레딧이 사용돼요(정확한 비용은 알 수 없어요).</li>
          <li>마이크 권한이 필요해요. 음성 원본은 서버에 저장하지 않아요.</li>
          <li>발음·성조는 AI가 들은 범위에서 ‘확인 필요(추정)’로만 알려 드려요. 발음 점수나 성조 정확도는 계산하지 않아요.</li>
        </ul>
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold">세션 시간(자동 종료)</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {LENGTHS.map((l) => (
              <button key={l.min} type="button" aria-pressed={minutes === l.min} onClick={() => setMinutes(l.min)} className={`min-h-10 rounded-full px-4 text-sm font-semibold ${minutes === l.min ? "bg-sage-dark text-white" : "bg-white hover:bg-sage-soft"}`}>
                {l.label}
              </button>
            ))}
          </div>
        </fieldset>
        {startErr && (
          <p role="alert" className="mt-4 rounded-2xl bg-white p-3 text-sm font-medium">
            ⚠ {startErr}
          </p>
        )}
        {ui?.phase === "finished" && <Results qs={active} state={ui} onRetry={(subset) => (setActive(subset), setUi(null), setStage("intro"))} />}
        <button className={`${btnPrimary} ${btnLarge} mt-5 w-full`} disabled={stage === "starting" || active.length === 0 || oralOff} onClick={() => void start()}>
          {stage === "starting" ? "연결 중…" : "말하기 시험 시작"}
        </button>
      </Card>
    );
  }

  // ───── 결과 ─────
  if (ui.phase === "finished") {
    return (
      <Card className="mx-auto max-w-2xl">
        <FitchapBubble event="oral.end" keep reserve={false} />
        <Results qs={active} state={ui} onRetry={(subset) => (setActive(subset), setUi(null), session.current = null, setStage("intro"))} notice={ui.notice} />
      </Card>
    );
  }

  // ───── 진행 중 ─────
  const q = active[ui.index];
  const qs = ui.qs[ui.index];
  const last = ui.index === active.length - 1;
  const busy = ui.phase === "asking" || ui.phase === "evaluating" || ui.phase === "feedback" || ui.phase === "connecting";
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  // 핏찹이 한마디: 세션 상태를 읽기만 한다(음성·평가·타이머 로직과 무관). 평가 결과와는 점선 말풍선으로 구분된다.
  const fxEvent: FitchapEvent | null = ui.error
    ? null
    : ui.phase === "asking"
      ? "oral.asking"
      : ui.phase === "recording"
        ? "oral.listening"
        : ui.phase === "evaluating"
          ? "oral.evaluating"
          : ui.phase === "feedback"
            ? ui.last?.verdict === "correct"
              ? "oral.correct"
              : ui.last?.verdict === "retry"
                ? "oral.wrong"
                : ui.last?.verdict === "unclear"
                  ? "oral.unclear"
                  : null
            : null;

  return (
    <Card className="mx-auto max-w-2xl">
      <div className="flex items-center gap-3">
        <ProgressBar value={ui.qs.filter((x) => x.done).length / active.length} className="flex-1" />
        <span className="text-sm font-semibold">
          {ui.index + 1}/{active.length}
        </span>
        <span className={`text-xs tabular-nums ${clockRunning ? "font-semibold text-charcoal" : "text-warm"}`} aria-label="남은 세션 시간">
          {clockRunning ? "" : "⏸ "}
          {mm}:{ss}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2" role="status" aria-live="polite">
        <Badge tone={ui.phase === "recording" ? "dark" : "gray"}>{qs.done && ui.phase === "ready" ? "문제 완료" : PHASE_LABEL[ui.phase]}</Badge>
        {q.questionType && <Badge>{q.questionType}</Badge>}
        <Badge tone="gray">{attemptLabel(qs)}</Badge>
      </div>
      <div className="mt-3">
        <FitchapBubble event={fxEvent} nonce={`${ui.index}-${qs.used}-${qs.unclear}-${ui.phase}`} />
      </div>

      {(ui.phase === "feedback" || ui.phase === "evaluating" || ui.phase === "asking" || ui.phase === "connecting" || (ui.phase === "ready" && qs.done)) && (
        <p className="mt-2 text-xs text-warm" role="status">
          {ui.phase === "feedback" ? "피드백을 듣는 동안 시간이 차감되지 않아요." : ui.phase === "ready" ? "모범답안을 확인하는 동안 시간이 차감되지 않아요." : "AI가 말하거나 처리하는 동안 시간이 차감되지 않아요."}
        </p>
      )}
      <p className="mt-4 text-2xl font-bold leading-snug" lang="zh">
        {q.stem}
      </p>
      {q.questionType === "문장 낭독" && <p className="mt-1 text-xs text-warm">위 문장을 소리 내어 읽어 주세요.</p>}

      {ui.notice && (
        <p role="alert" className="mt-4 rounded-2xl bg-sand p-3 text-sm font-medium">
          ⚠ {ui.notice}
        </p>
      )}
      {ui.error && (
        <div role="alert" className="mt-4 rounded-2xl bg-sand p-3 text-sm">
          <p className="font-medium">⚠ {ui.error}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className={btnPrimary} onClick={() => void reconnect()}>
              다시 연결
            </button>
            <button className={btnSecondary} onClick={end}>
              시험 종료
            </button>
          </div>
        </div>
      )}

      {/* 마이크 컨트롤 */}
      {!ui.error && (
        <div className="mt-5">
          {ui.phase === "recording" ? (
            <button className={`${btnPrimary} ${btnLarge} w-full !bg-charcoal`} onClick={() => session.current?.endAnswer()}>
              <Icon name="pause" className="mr-2 h-5 w-5" /> 답변 종료 · 제출
            </button>
          ) : (
            <button className={`${btnPrimary} ${btnLarge} w-full`} disabled={ui.phase !== "ready" || !!ui.micPending || !canAnswer(qs)} onClick={() => void session.current?.beginAnswer()}>
              <Icon name="speaking" className="mr-2 h-5 w-5" />
              {qs.done ? "이 문제는 끝났어요" : ui.micPending ? "마이크 준비 중…" : qs.used > 0 ? "다시 말하기" : "답변 시작 (마이크 켜기)"}
            </button>
          )}
          <p className="mt-2 text-center text-xs text-warm">
            {ui.phase === "recording" ? "말씀하세요. 끝나면 ‘답변 종료’를 눌러 주세요. (AI가 말하는 동안에는 시작할 수 없어요)" : busy ? "AI가 말하거나 처리하는 중이에요." : qs.done ? "다음 질문으로 이동하거나 시험을 종료하세요." : `남은 답변 ${Math.max(0, MAX_ATTEMPTS - qs.used)}회`}
          </p>
        </div>
      )}

      {/* 교정 */}
      {ui.last && ui.last.verdict !== "unclear" && (
        <div role="status" className="anim-pop mt-4 rounded-2xl bg-sage-soft p-4 text-sm">
          <p className="font-semibold">{ui.last.verdict === "correct" ? "정답이에요!" : qs.done ? "재시도 기회를 모두 사용했어요" : "다시 말해 볼까요? 틀린 부분이에요"}</p>
          {ui.last.feedbackKo && <p className="mt-1 text-warm">{ui.last.feedbackKo}</p>}
          {ui.last.errors.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {ui.last.errors.map((e, i) => (
                <li key={i} className="rounded-xl bg-white/70 p-2 text-xs">
                  <b>{ERROR_LABEL[e.kind]}</b>
                  {e.wrong && <span> · {e.wrong}</span>}
                  {e.correct && (
                    <span lang="zh">
                      {" "}
                      → <b>{e.correct}</b>
                    </span>
                  )}
                  {e.note && <span className="block text-warm">{e.note}</span>}
                </li>
              ))}
            </ul>
          )}
          {ui.last.corrected && (
            <p className="mt-2 text-xs" lang="zh">
              올바른 표현: <b>{ui.last.corrected}</b>
            </p>
          )}
        </div>
      )}

      {/* 문제 종료 후: 모범답안·출처 */}
      {qs.done && (
        <div className="mt-4 rounded-2xl bg-sand p-4 text-sm">
          <p className="text-xs font-semibold text-warm">모범답안 · {OUTCOME_LABEL[qs.outcome]}</p>
          <p className="mt-1 text-xl font-bold" lang="zh">
            {q.modelAnswer}
          </p>
          {qs.answerInfo?.pinyin ? <p className="mt-0.5 text-sm text-sage-dark">{qs.answerInfo.pinyin}</p> : null}
          {qs.answerInfo?.ko ? <p className="mt-0.5 text-sm">{qs.answerInfo.ko}</p> : null}
          {!qs.answerInfo && <p className="mt-0.5 text-xs text-warm">병음·한국어 뜻 정보가 없어요(답변을 제출하지 않은 문제).</p>}
          {qs.answerInfo && <p className="mt-0.5 text-[11px] text-warm">병음·뜻은 AI가 붙인 것이라 교재와 다를 수 있어요. 한자는 교재 원문이에요.</p>}
          <button className={`${btnSecondary} mt-2 !min-h-9 !px-3 text-xs`} disabled={ui.phase !== "ready" || !q.modelAnswer} onClick={() => session.current?.playModelAnswer()}>
            정답 듣기 (중국어 음성)
          </button>
          <p className="mt-2 text-xs text-warm">{q.explanation}</p>
          <p className="mt-2 text-xs">
            출처: {q.source.fileName} · {q.source.page}쪽 — “{q.evidence}”
          </p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button className={`${btnSecondary} !px-4`} disabled={ui.index === 0 || busy && ui.phase !== "feedback"} onClick={() => session.current?.prev()}>
          이전 질문
        </button>
        <button className={`${btnSecondary} !px-4`} disabled={ui.phase !== "ready"} onClick={() => session.current?.replay()} title="문제를 다시 들려줘요(답변 횟수와 무관)">
          질문 다시 듣기
        </button>
        <span className="flex-1" />
        {!last ? (
          <button className={btnSecondary} onClick={() => session.current?.next()}>
            {qs.done ? "다음 질문" : "다음 질문 (남은 기회 종료)"}
          </button>
        ) : null}
        <button className={last && qs.done ? btnPrimary : btnSecondary} onClick={end}>
          시험 종료
        </button>
      </div>
    </Card>
  );
}

function Results({ qs, state, onRetry, notice }: { qs: GeneratedQuestion[]; state: OralState; onRetry: (subset: GeneratedQuestion[]) => void; notice?: string | null }) {
  const doneCount = state.qs.filter((x) => x.done).length;
  const answered = state.qs.filter((x) => x.used > 0).length;
  const redo = qs.filter((_, i) => state.qs[i].outcome !== "correct");
  return (
    <div className="mt-4">
      <h2 className="text-xl font-bold">구술시험 결과</h2>
      {notice && <p className="mt-2 text-sm text-warm">{notice}</p>}
      <p className="mt-2 text-sm">
        전체 질문 {qs.length}개 · 종료한 질문 {doneCount}개 · 답변을 낸 질문 {answered}개
      </p>
      <p className="mt-1 text-xs text-warm">AI가 측정하지 않은 발음 정확도·성조 점수·정답률은 표시하지 않아요. 아래 판정은 AI가 들은 내용에 대한 평가예요.</p>
      <ol className="mt-4 space-y-3">
        {qs.map((q, i) => {
          const s = state.qs[i];
          const errs = s.attempts.flatMap((a) => a.evaluation.errors);
          const fixed = [...new Set(s.attempts.map((a) => a.evaluation.corrected).filter(Boolean))];
          return (
            <li key={q.id} className="rounded-2xl bg-sand p-3 text-sm">
              <p className="font-semibold" lang="zh">
                {i + 1}. {q.stem}
              </p>
              <p className="mt-1 text-xs text-warm">
                {OUTCOME_LABEL[s.outcome]} · 답변 {s.used}회 · 재시도 {Math.max(0, s.used - 1)}회 사용
              </p>
              {errs.length > 0 && (
                <ul className="mt-1.5 list-disc pl-4 text-xs">
                  {errs.map((e, k) => (
                    <li key={k}>
                      {ERROR_LABEL[e.kind]}: {e.wrong} → <span lang="zh">{e.correct}</span> {e.note && `(${e.note})`}
                    </li>
                  ))}
                </ul>
              )}
              {fixed.length > 0 && (
                <p className="mt-1 text-xs" lang="zh">
                  교정된 표현: {fixed.join(" / ")}
                </p>
              )}
              <p className="mt-1.5 text-xs" lang="zh">
                모범답안: <b>{q.modelAnswer}</b>
                {s.answerInfo?.pinyin ? ` · ${s.answerInfo.pinyin}` : ""}
                {s.answerInfo?.ko ? ` · ${s.answerInfo.ko}` : ""}
              </p>
              <p className="mt-1 text-xs text-warm">
                출처: {q.source.fileName} · {q.source.page}쪽 — “{q.evidence}”
              </p>
            </li>
          );
        })}
      </ol>
      {redo.length > 0 && (
        <button className={`${btnPrimary} mt-4`} onClick={() => onRetry(redo)}>
          다시 연습할 문제 {redo.length}개로 새 시험
        </button>
      )}
    </div>
  );
}
