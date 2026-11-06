"use client";
import { useMemo, useState } from "react";
import { Icon } from "./Icons";
import { Badge, btnLarge, btnPrimary, btnSecondary, Card, choiceClass, ProgressBar } from "./ui";
import { buildQuiz, LEVEL_DESC, LEVEL_NAME, LEVELS_ALL, scoreQuiz, type Level, type PlacementRecord } from "@/lib/placement";

// 최초 실력 진단: 자기 평가 → 5문제 → 추천 시작 수준(수락 또는 직접 변경). AI 호출 없음.
export function Placement({ onSave, onCancel, initialSelf }: { onSave: (r: PlacementRecord) => void; onCancel?: () => void; initialSelf?: Level | null }) {
  const [step, setStep] = useState<"self" | "quiz" | "result">("self");
  const [self, setSelf] = useState<Level | null>(initialSelf ?? null);
  const [i, setI] = useState(0);
  const [picks, setPicks] = useState<(number | null)[]>([null, null, null, null, null]);
  const [sel, setSel] = useState<number | null>(null);
  const quiz = useMemo(() => (self ? buildQuiz(self) : []), [self]);
  const result = useMemo(() => (self && step === "result" ? scoreQuiz(self, quiz, picks) : null), [self, step, quiz, picks]);
  const [chosen, setChosen] = useState<Level | null>(null);
  const finalLevel = chosen ?? result?.recommended ?? null;

  function save(skip = false) {
    if (!self) return;
    const lvl = skip ? self : (finalLevel as Level);
    onSave({ completed: true, selfLevel: self, score: skip ? null : result!.score, measuredLevel: skip ? null : result!.measuredLevel, recommended: skip ? self : result!.recommended, chosen: lvl, at: Date.now() });
  }

  if (step === "self") {
    return (
      <div className="mx-auto max-w-xl">
        <Badge tone="dark">처음이시네요</Badge>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">현재 중국어 실력을 알려 주세요</h1>
        <p className="mt-1 text-sm text-warm">자기 평가일 뿐이에요. 이어서 5문제로 시작 수준을 추천해 드려요.</p>
        <ul className="mt-5 grid gap-2.5" role="radiogroup" aria-label="중국어 실력">
          {LEVELS_ALL.map((l) => (
            <li key={l}>
              <button role="radio" aria-checked={self === l} onClick={() => setSelf(l)} className={`${choiceClass(self === l ? "correct" : "idle")} flex-col !items-start !gap-0.5`}>
                <span className="font-bold">{LEVEL_NAME[l]}</span>
                <span className="text-sm font-normal text-warm">{LEVEL_DESC[l]}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-col gap-2">
          <button className={`${btnPrimary} ${btnLarge} w-full`} disabled={!self} onClick={() => setStep("quiz")}>
            진단 문제 5개 풀기
          </button>
          <button className="min-h-11 text-sm font-semibold text-warm underline disabled:opacity-40" disabled={!self} onClick={() => save(true)}>
            진단 없이 이 수준으로 시작
          </button>
          {onCancel && (
            <button className={btnSecondary} onClick={onCancel}>
              취소
            </button>
          )}
        </div>
      </div>
    );
  }

  if (step === "quiz") {
    const cur = quiz[i];
    return (
      <div className="mx-auto max-w-xl">
        <div className="flex items-center gap-3">
          <ProgressBar value={i / quiz.length} className="flex-1" />
          <span className="text-sm font-semibold">
            {i + 1}/{quiz.length}
          </span>
        </div>
        <Card className="mt-4">
          <Badge tone="gray">{cur.q.kind}</Badge>
          <p className="mt-3 text-lg font-bold leading-snug" lang="zh">
            {cur.q.stem}
          </p>
          <ul className="mt-4 grid gap-2.5">
            {cur.choices.map((c, k) => (
              <li key={c}>
                <button aria-pressed={sel === k} onClick={() => setSel(k)} className={choiceClass(sel === k ? "correct" : "idle")}>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${sel === k ? "bg-sage-dark text-white" : "bg-charcoal/8 text-warm"}`}>{sel === k ? <Icon name="check" className="h-4 w-4" /> : k + 1}</span>
                  <span lang="zh">{c}</span>
                </button>
              </li>
            ))}
          </ul>
          <button
            className={`${btnPrimary} ${btnLarge} mt-4 w-full`}
            disabled={sel === null}
            onClick={() => {
              const next = picks.map((p, n) => (n === i ? sel : p));
              setPicks(next);
              setSel(null);
              if (i + 1 >= quiz.length) setStep("result");
              else setI(i + 1);
            }}
          >
            {i + 1 >= quiz.length ? "결과 보기" : "다음"}
          </button>
        </Card>
        <p className="mt-3 text-center text-xs text-warm">정답은 마지막에 한 번에 반영돼요. 모르면 가장 가까운 것을 골라 주세요.</p>
      </div>
    );
  }

  const r = result!;
  return (
    <div className="mx-auto max-w-xl">
      <Badge tone="dark">진단 결과</Badge>
      <Card tone="sage" className="mt-3">
        <p className="text-sm text-warm">추천 시작 수준</p>
        <p className="mt-1 text-4xl font-extrabold">{LEVEL_NAME[r.recommended!]}</p>
        <p className="mt-2 text-sm">
          자기 평가 <b>{LEVEL_NAME[self!]}</b> · 진단 5문제 중 <b>{r.score!.correct}문제</b> 정답
        </p>
        <p className="mt-2 text-xs text-warm">5문제만으로는 정확한 실력이나 공인 HSK 급수를 알 수 없어요. 시작 난이도를 고르기 위한 참고용이에요. 언제든 바꿀 수 있어요.</p>
      </Card>
      <p className="mt-4 text-sm font-semibold">시작 수준 선택</p>
      <ul className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="시작 수준">
        {LEVELS_ALL.map((l) => (
          <li key={l}>
            <button role="radio" aria-checked={finalLevel === l} onClick={() => setChosen(l)} className={`min-h-12 w-full rounded-2xl text-sm font-bold transition ${finalLevel === l ? "bg-sage-dark text-white" : "bg-sand hover:bg-sage-soft"}`}>
              {LEVEL_NAME[l]}
              {l === r.recommended ? " · 추천" : ""}
            </button>
          </li>
        ))}
      </ul>
      <button className={`${btnPrimary} ${btnLarge} mt-5 w-full`} onClick={() => save()}>
        {LEVEL_NAME[finalLevel!]}로 시작하기
      </button>
    </div>
  );
}
