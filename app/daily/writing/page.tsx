"use client";
import { useState } from "react";
import { FitchapBubble } from "@/components/FitchapBubble";
import type { FitchapEvent } from "@/lib/fitchapLines";
import { HanziPad } from "@/components/HanziPad";
import { CharSound } from "@/components/CharSound";
import { HanziWriterBox } from "@/components/HanziWriterBox";
import { StepGate } from "@/components/StepGate";
import { BackLink, Badge, btnLarge, btnPrimary, btnSecondary, Card, LinkButton, ProgressBar } from "@/components/ui";
import { charsLearned, type CharTask, type DailySession } from "@/lib/daily";
import { HANZI_STROKES } from "@/lib/hanziChars";
import { judgeStrokes, REASON_TEXT, type CharData, type Judgement, type Pt } from "@/lib/strokeMatch";
import type { useDaily } from "@/lib/useDaily";

export default function WritingPage() {
  return <StepGate step="writing">{({ session, update }) => <WritingFlow session={session} update={update} />}</StepGate>;
}

type Update = ReturnType<typeof useDaily>["update"];

function WritingFlow({ session, update }: { session: DailySession; update: Update }) {
  const learned = charsLearned(session);
  const [phase, setPhase] = useState<"learn" | "quiz">(learned ? "quiz" : "learn");
  const [fx, setFx] = useState<{ e: FitchapEvent; n: number }>({ e: "writing.start", n: 0 });
  return (
    <>
      <BackLink />
      <div className="mx-auto max-w-xl">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-warm">
          <Badge tone="dark">한자 쓰기</Badge>
          <span>오늘 단어의 한자 {session.chars.length}자 (하루 5자까지)</span>
        </div>
        {session.chars.length === 0 ? (
          <Card tone="soft">오늘 단어에서 획순 데이터가 있는 한자를 찾지 못했어요.</Card>
        ) : (
          <>
            {learned && (
              <div className="mb-4 grid grid-cols-2 gap-2" role="group" aria-label="학습 방식">
                <button aria-pressed={phase === "quiz"} onClick={() => setPhase("quiz")} className={`min-h-11 rounded-2xl text-sm font-bold ${phase === "quiz" ? "bg-sage-dark text-white" : "bg-sand"}`}>
                  최종 쓰기 퀴즈
                </button>
                <button aria-pressed={phase === "learn"} onClick={() => setPhase("learn")} className={`min-h-11 rounded-2xl text-sm font-bold ${phase === "learn" ? "bg-sage-dark text-white" : "bg-sand"}`}>
                  획순 복습
                </button>
              </div>
            )}
            {/* 손글씨 퀴즈 중에는 필기 영역 주변이 움직이지 않도록 핏찹이를 띄우지 않는다 */}
            {phase === "learn" && <FitchapBubble event={fx.e} nonce={fx.n} />}
            {phase === "learn" ? <Learn session={session} update={update} onAllLearned={() => setPhase("quiz")} onCharDone={() => setFx({ e: "writing.charDone", n: Date.now() })} /> : <FinalQuiz session={session} update={update} />}
          </>
        )}
      </div>
    </>
  );
}

const wordOf = (s: DailySession, c: CharTask) => s.words.find((w) => w.id === c.wordId)!;

function Learn({ session, update, onAllLearned, onCharDone }: { session: DailySession; update: Update; onAllLearned: () => void; onCharDone: () => void }) {
  const chars = session.chars;
  const firstOpen = chars.findIndex((c) => !session.steps.writing.learned.includes(c.char));
  const [i, setI] = useState(firstOpen === -1 ? 0 : firstOpen);
  const c = chars[i];
  const w = wordOf(session, c);
  const done = session.steps.writing.learned.includes(c.char);
  const [loadFail, setLoadFail] = useState<string | null>(null); // 획순 데이터를 못 불러온 글자(이 경우에만 건너뛰기 제공)
  const learnedCount = session.steps.writing.learned.length;
  const markLearned = () => {
    if (!session.steps.writing.learned.includes(c.char)) onCharDone(); // 글자를 처음 완성했을 때만
    update((x) => (x.steps.writing.learned.includes(c.char) ? x : { ...x, steps: { ...x.steps, writing: { ...x.steps.writing, learned: [...x.steps.writing.learned, c.char] } } }));
  };

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <ProgressBar value={learnedCount / chars.length} className="flex-1" />
        <span className="text-sm font-semibold">
          학습 {learnedCount}/{chars.length}
        </span>
      </div>
      <Card className="p-5 text-center">
        <p className="text-xs text-warm">
          {i + 1} / {chars.length} · {HANZI_STROKES[c.char]}획
        </p>
        <p className="mt-2 text-sm">
          <b lang="zh">{w.hanzi}</b> ({w.pinyin}) · {w.ko}
          {c.total > 1 ? ` — ${c.index + 1}번째 글자` : ""}
        </p>
        <div className="mt-3">
          <HanziWriterBox key={c.char} char={c.char} mode="learn" onComplete={markLearned} onError={() => setLoadFail(c.char)} />
        </div>
        {/* 따라 쓰기 학습 단계에서만 제공(최종 퀴즈·정답 공개 화면에는 없음). 글자가 바뀌면 key로 새로 만들어 이전 발음·타이머가 정리된다 */}
        <CharSound key={c.char} char={c.char} wordHanzi={w.hanzi} wordPinyin={w.pinyin} index={c.index} total={c.total} />
        <p className="mt-2 text-xs text-warm">획 검사는 Hanzi Writer 라이브러리의 판정이에요(시작점·방향·모양 기준). 전문 손글씨 평가는 아니에요.</p>
        {loadFail === c.char && !done && (
          <p role="alert" className="mt-3 rounded-2xl bg-sand p-3 text-xs font-medium">
            획순 연습을 불러오지 못했어요. 학습이 막히지 않도록 이 글자는 연습 없이 학습 완료로 표시할 수 있어요.
            <button className="mt-2 block min-h-9 font-semibold underline" onClick={markLearned}>
              연습 없이 이 글자 학습 완료
            </button>
          </p>
        )}
        <div className="mt-4 flex items-center justify-between gap-2">
          <button className={btnSecondary} disabled={i === 0} onClick={() => setI(i - 1)}>
            이전 글자
          </button>
          {i < chars.length - 1 ? (
            <button className={btnPrimary} disabled={!done} onClick={() => setI(i + 1)}>
              {done ? "다음 글자" : "따라 쓰기를 마치면 열려요"}
            </button>
          ) : (
            <button className={btnPrimary} disabled={!charsLearned(session)} onClick={onAllLearned}>
              {charsLearned(session) ? "최종 쓰기 퀴즈로" : "따라 쓰기를 마치면 열려요"}
            </button>
          )}
        </div>
      </Card>
    </>
  );
}

function FinalQuiz({ session, update }: { session: DailySession; update: Update }) {
  const chars = session.chars;
  const results = session.steps.writing.results;
  const firstOpen = chars.findIndex((c) => !results[c.char]);
  const [i, setI] = useState(firstOpen === -1 ? 0 : firstOpen);
  const [judged, setJudged] = useState<{ char: string; j: Judgement } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retake, setRetake] = useState(false); // 완료 후 글자별로 다시 써 보기
  const finished = firstOpen === -1 && !judged && !retake;
  const c = chars[Math.min(i, chars.length - 1)];
  const w = wordOf(session, c);
  const showing = judged && judged.char === c.char ? judged.j : null;

  // 제출한 뒤에만 정답 데이터를 불러와 판정한다. 제출 전에는 정답 글자·윤곽·획 안내를 화면에 쓰지 않는다.
  async function submit(strokes: Pt[][]) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/hanzi/${encodeURIComponent(c.char)}.json`);
      if (!r.ok) throw new Error("정답 획순 데이터를 불러오지 못했어요.");
      const data = (await r.json()) as CharData;
      const j = judgeStrokes(strokes, data);
      const note = j.passed ? "획 수·순서·모양이 대체로 맞아요" : j.verdicts.filter((v) => !v.ok).map((v) => REASON_TEXT[v.reason]).slice(0, 2).join(", ");
      setJudged({ char: c.char, j });
      update((x) => ({ ...x, steps: { ...x.steps, writing: { ...x.steps.writing, results: { ...x.steps.writing.results, [c.char]: { passed: j.passed, strokesOk: j.strokesOk, strokesTotal: j.strokesTotal, note } } } } }));
    } catch (e) {
      setErr((e as Error).message || "판정하지 못했어요. 다시 제출해 주세요."); // 제출 실패는 결과에 반영하지 않는다
    } finally {
      setBusy(false);
    }
  }

  function next() {
    setJudged(null);
    setErr(null);
    if (i < chars.length - 1) setI(i + 1);
    else setRetake(false);
  }

  if (finished) {
    const passed = chars.filter((x) => results[x.char]?.passed).length;
    const wrong = chars.filter((x) => results[x.char] && !results[x.char].passed);
    return (
      <Card tone="sage" className="text-center">
        <Badge tone="gray">한자 쓰기 결과</Badge>
        <p className="mt-3 text-5xl font-extrabold text-sage-dark">
          {passed}
          <span className="text-2xl text-warm"> / {chars.length}</span>
        </p>
        <p className="mt-2 text-xs text-warm">획 모양을 근사 비교한 결과예요. 전문 손글씨 평가가 아니라서 실제 필기와 다를 수 있어요.</p>
        {session.completedAt && (
          <>
            <p className="mt-3 text-lg font-bold">🎉 오늘의 학습을 모두 마쳤어요!</p>
            <div className="mt-2 text-left">
              <FitchapBubble event="daily.complete" keep reserve={false} />
            </div>
          </>
        )}
        {wrong.length > 0 && (
          <ul className="mt-4 space-y-2 text-left text-sm">
            {wrong.map((x) => (
              <li key={x.char} className="flex items-center gap-3 rounded-2xl bg-white/70 p-3">
                <span className="text-3xl font-bold" lang="zh">{x.char}</span>
                <span className="text-xs text-warm">복습 목록 · {results[x.char].note}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 flex flex-col gap-2">
          <LinkButton href="/daily" primary className={`${btnLarge} w-full`}>
            학습 경로로
          </LinkButton>
          <button className={btnSecondary} onClick={() => (setI(0), setRetake(true))}>
            글자별 다시 쓰기
          </button>
        </div>
      </Card>
    );
  }

  const prev = results[c.char];
  return (
    <Card className="p-5 text-center">
      <div className="flex items-center gap-3">
        <ProgressBar value={Object.keys(results).length / chars.length} className="flex-1" />
        <span className="text-sm font-semibold">
          {Math.min(i + 1, chars.length)}/{chars.length}
        </span>
      </div>
      <p className="mt-4 text-xs text-warm">뜻과 병음만 보고 한자를 직접 써 보세요(힌트 없음)</p>
      <p className="mt-2 text-lg font-bold">{w.ko}</p>
      <p className="text-xl font-semibold text-sage-dark">{w.pinyin}</p>
      <p className="mt-1 text-xs text-warm">{c.total > 1 ? `${c.index + 1}번째 글자를 쓰세요(총 ${c.total}글자 단어)` : "한 글자 단어예요"}</p>
      <div className="mt-4">{!showing && <HanziPad key={`${c.char}-${prev ? "again" : "new"}`} onSubmit={(s) => void submit(s)} disabled={busy} />}</div>
      {err && <p role="alert" className="mt-3 rounded-2xl bg-sand p-3 text-sm font-medium">⚠ {err}</p>}
      {showing && (
        <div role="status" className="anim-pop mt-4 rounded-2xl bg-sand p-4">
          <p className="text-lg font-bold">{showing.passed ? "획이 대체로 맞아요!" : "다시 확인해 볼 획이 있어요"}</p>
          <p className="mt-1 text-xs text-warm">
            획 {showing.strokesOk}/{showing.strokesTotal}개 일치 · 쓴 획 수 {showing.strokeCountOk ? "맞음" : "다름"}
          </p>
          <ul className="mt-2 flex flex-wrap justify-center gap-1.5 text-xs">
            {showing.verdicts.map((v, k) => (
              <li key={k} className={`rounded-full px-2.5 py-1 font-semibold ${v.ok ? "bg-sage-soft" : "bg-white ring-1 ring-charcoal/20"}`}>
                {k + 1}획 · {REASON_TEXT[v.reason]}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-warm">정답 한자와 획순이에요 (이제 공개돼요)</p>
          <div className="mt-2">
            <HanziWriterBox key={`reveal-${c.char}`} char={c.char} mode="reveal" size={200} />
          </div>
          <button className={`${btnPrimary} ${btnLarge} mt-3 w-full`} onClick={next}>
            {i < chars.length - 1 ? "다음 글자" : "결과 보기"}
          </button>
        </div>
      )}
      <p className="mt-3 text-xs text-warm">제출 후에만 정답과 획 판정이 나와요. 판정은 획의 위치·방향·순서를 근사 비교한 것이에요.</p>
    </Card>
  );
}
