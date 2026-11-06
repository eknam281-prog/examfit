"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { btnPrimary, btnSecondary } from "./ui";
import type { Pt } from "@/lib/strokeMatch";

// 필기선 표시 두께(캔버스 2배 해상도 기준 px): 이전 7 → 9(약 +30%).
export const PEN_WIDTH = 9;

// 최종 쓰기 퀴즈용 빈 필기 영역. 정답 글자·윤곽·힌트를 전혀 그리지 않고, 사용자가 쓴 획만 모아 제출 후 판정에 넘긴다.
export function HanziPad({ onSubmit, disabled, size = 280 }: { onSubmit: (strokes: Pt[][]) => void; disabled?: boolean; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Pt[][]>([]);
  const cur = useRef<Pt[] | null>(null);

  const draw = useCallback(
    (all: Pt[][]) => {
      const c = ref.current;
      const ctx = c?.getContext("2d");
      if (!c || !ctx) return;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.lineWidth = PEN_WIDTH; // 표시 굵기만 조절한다(제출하는 좌표·판정에는 영향 없음)
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#5C4538";
      for (const s of all) {
        if (s.length === 0) continue;
        ctx.beginPath();
        ctx.moveTo(s[0][0] * c.width, s[0][1] * c.height);
        for (const p of s.slice(1)) ctx.lineTo(p[0] * c.width, p[1] * c.height);
        if (s.length === 1) ctx.lineTo(s[0][0] * c.width + 0.1, s[0][1] * c.height);
        ctx.stroke();
      }
    },
    [],
  );

  useEffect(() => draw(strokes), [strokes, draw]);

  const pt = (e: React.PointerEvent): Pt => {
    const r = ref.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };

  return (
    <div>
      <canvas
        ref={ref}
        width={size * 2}
        height={size * 2}
        aria-label="한자를 쓰는 빈 필기 영역"
        className="mx-auto block touch-none rounded-2xl border border-charcoal/15 bg-white"
        style={{ width: size, height: size, maxWidth: "100%", backgroundImage: "linear-gradient(to right, transparent 49.7%, rgba(41,39,36,0.12) 50%, transparent 50.3%), linear-gradient(to bottom, transparent 49.7%, rgba(41,39,36,0.12) 50%, transparent 50.3%)" }}
        onPointerDown={(e) => {
          if (disabled) return;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          cur.current = [pt(e)];
          draw([...strokes, cur.current]);
        }}
        onPointerMove={(e) => {
          if (!cur.current || disabled) return;
          cur.current.push(pt(e));
          draw([...strokes, cur.current]);
        }}
        onPointerUp={() => {
          if (!cur.current) return;
          const done = cur.current;
          cur.current = null;
          if (done.length >= 2) setStrokes((p) => [...p, done]);
          else draw(strokes);
        }}
        onPointerCancel={() => {
          cur.current = null;
          draw(strokes);
        }}
      />
      <p className="mt-2 text-center text-xs text-warm">쓴 획 {strokes.length}개 · 정답 확인은 제출한 뒤에만 보여요</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <button className={btnSecondary} disabled={disabled || strokes.length === 0} onClick={() => setStrokes((p) => p.slice(0, -1))}>
          마지막 획 지우기
        </button>
        <button className={btnSecondary} disabled={disabled || strokes.length === 0} onClick={() => setStrokes([])}>
          전부 지우기
        </button>
        <button className={btnPrimary} disabled={disabled || strokes.length === 0} onClick={() => onSubmit(strokes)}>
          제출하고 확인
        </button>
      </div>
    </div>
  );
}
