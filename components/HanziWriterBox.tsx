"use client";
import { useEffect, useRef, useState } from "react";
import { btnPrimary, btnSecondary } from "./ui";

type HW = import("hanzi-writer").default;

// Hanzi Writer 기본 drawingWidth는 4. 약 30% 늘린 값.
const DRAWING_WIDTH = 5.2;

// 획순 데이터는 public/hanzi/에 복사해 둔 hanzi-writer-data를 불러온다(외부 CDN 사용 없음).
const loader = (char: string, onLoad: (d: unknown) => void, onError: (e?: unknown) => void) => {
  fetch(`/hanzi/${encodeURIComponent(char)}.json`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("획순 데이터를 찾을 수 없어요"))))
    .then(onLoad)
    .catch(onError);
};

export type LearnInfo = { mistakes: number; stroke: number; total: number };

// 정답 모양을 보여 주는 학습/공개용 상자. 최종 퀴즈에서는 제출 전에 쓰지 않는다(제출 후 정답 공개에만 사용).
export function HanziWriterBox({ char, mode, onComplete, onError, size = 260 }: { char: string; mode: "learn" | "reveal"; onComplete?: (info: { mistakes: number }) => void; onError?: () => void; size?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const writer = useRef<HW | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<LearnInfo>({ mistakes: 0, stroke: 0, total: 0 });
  const [practicing, setPracticing] = useState(false);
  const [last, setLast] = useState<string>("");
  const cbRef = useRef(onComplete);
  cbRef.current = onComplete;
  const errRef = useRef(onError);
  errRef.current = onError;

  useEffect(() => {
    let dead = false;
    setError(null);
    setPracticing(false);
    setLast("");
    setInfo({ mistakes: 0, stroke: 0, total: 0 });
    (async () => {
      try {
        const HanziWriter = (await import("hanzi-writer")).default;
        if (dead || !box.current) return;
        box.current.innerHTML = "";
        const w = HanziWriter.create(box.current, char, {
          width: size,
          height: size,
          padding: 12,
          showOutline: mode === "learn",
          strokeColor: "#292724",
          outlineColor: "#E8DCC9",
          drawingColor: "#5C4538",
          drawingWidth: DRAWING_WIDTH, // 사용자가 쓰는 선의 표시 두께만 키운다(판정은 좌표 기준이라 영향 없음)
          highlightColor: "#A5A083",
          strokeAnimationSpeed: 1,
          delayBetweenStrokes: 250,
          showHintAfterMisses: 3,
          charDataLoader: loader as never,
          onLoadCharDataError: () => {
            if (dead) return;
            setError("획순 데이터를 불러오지 못했어요.");
            errRef.current?.();
          },
        });
        writer.current = w;
        if (mode === "reveal") void w.animateCharacter();
      } catch {
        if (!dead) {
          setError("획순 라이브러리를 불러오지 못했어요.");
          errRef.current?.();
        }
      }
    })();
    return () => {
      dead = true;
      try {
        writer.current?.cancelQuiz();
      } catch {
        /* 이미 정리됨 */
      }
      writer.current = null;
    };
  }, [char, mode, size]);

  function animate() {
    setPracticing(false);
    writer.current?.cancelQuiz();
    void writer.current?.animateCharacter();
  }

  // 라이브러리(Hanzi Writer)의 획 검사를 그대로 사용한다. 판정은 라이브러리 기준이며 전문 손글씨 평가가 아니다.
  function practice() {
    const w = writer.current;
    if (!w) return;
    setPracticing(true);
    setLast("획을 하나씩 따라 써 보세요.");
    setInfo({ mistakes: 0, stroke: 0, total: 0 });
    void w.quiz({
      onCorrectStroke: (d) => {
        setInfo((p) => ({ ...p, stroke: d.strokeNum + 1, total: d.strokeNum + 1 + d.strokesRemaining }));
        setLast(`${d.strokeNum + 1}번째 획이 맞아요`);
      },
      onMistake: (d) => {
        setInfo((p) => ({ ...p, mistakes: d.totalMistakes, total: d.strokeNum + d.strokesRemaining + 1 }));
        setLast(`${d.strokeNum + 1}번째 획이 달라요. 시작점·방향·모양을 확인하고 다시 써 보세요${d.mistakesOnStroke >= 3 ? " (힌트가 표시돼요)" : ""}`);
      },
      onComplete: (s) => {
        setPracticing(false);
        setLast(`완성! 틀린 횟수 ${s.totalMistakes}번`);
        cbRef.current?.({ mistakes: s.totalMistakes });
      },
    });
  }

  return (
    <div>
      <div ref={box} className="mx-auto touch-none rounded-2xl border border-charcoal/10 bg-white" style={{ width: size, height: size, maxWidth: "100%" }} aria-label={`${char} 획순`} role="img" />
      {error ? (
        <p role="alert" className="mt-2 text-center text-sm font-medium">⚠ {error}</p>
      ) : (
        mode === "learn" && (
          <>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button className={btnSecondary} onClick={animate}>
                획순 애니메이션 보기
              </button>
              <button className={btnPrimary} onClick={practice} disabled={practicing}>
                {practicing ? "쓰는 중…" : "따라 쓰기"}
              </button>
            </div>
            <p className="mt-2 text-center text-xs text-warm" role="status" aria-live="polite">
              {last}
              {practicing && info.total > 0 ? ` · 틀린 횟수 ${info.mistakes}` : ""}
            </p>
          </>
        )
      )}
    </div>
  );
}
