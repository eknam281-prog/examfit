"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { getLevelInfo } from "@/lib/character";
import { SAMPLE_STATUS } from "@/lib/data";
import { pickLine, type FitchapEvent } from "@/lib/fitchapLines";
import { useFitchapName } from "@/lib/fitchapName";
import { useLocalState } from "@/lib/useLocalState";

// 캐릭터 이름(`examfit.fitchapName`, 기록 화면에서 설정)과 현재 레벨 이미지. 이름이 없으면 기본 이름 '핏찹이'.
export function useFitchap() {
  const { display } = useFitchapName(); // 이름 변경이 같은 탭·다른 탭에 바로 반영된다
  const [xp] = useLocalState("examfit.xp", SAMPLE_STATUS.xp);
  return { name: display, image: getLevelInfo(xp).current.image, level: getLevelInfo(xp).current.level };
}

// 흐름 안에 들어가는 작은 말풍선(고정 팝업 아님). 이벤트가 바뀌거나 nonce가 달라질 때만 나타나고 몇 초 뒤 사라진다.
// 자리를 미리 확보해 두어 나타나고 사라질 때 아래 내용(문제·선택지·필기 영역)이 움직이지 않는다. 평가 결과와 구분되도록 점선 말풍선으로 표시한다.
export function FitchapBubble({ event, nonce = 0, hideAfterMs = 6500, keep = false, reserve = true }: { event: FitchapEvent | null; nonce?: number | string; hideAfterMs?: number; keep?: boolean; reserve?: boolean }) {
  const { name, image, level } = useFitchap();
  const [line, setLine] = useState<string | null>(null);
  const prev = useRef<string | undefined>(undefined);
  const key = `${event ?? ""}:${nonce}`;

  useEffect(() => {
    if (!event) return setLine(null);
    const l = pickLine(event, String(nonce), prev.current);
    prev.current = l;
    setLine(l);
    if (keep) return;
    const t = setTimeout(() => setLine(null), hideAfterMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className={reserve ? "min-h-14" : ""} aria-live="polite">
      {line && (
        <div className="anim-pop flex items-end gap-2">
          <Image src={image} alt={`${name} Lv.${level}`} width={44} height={44} unoptimized className="h-11 w-11 shrink-0 rounded-full bg-white/70 p-0.5" />
          <div className="relative min-w-0 rounded-2xl rounded-bl-sm border border-dashed border-charcoal/25 bg-sand px-3 py-2 text-sm">
            <p className="text-[10px] font-semibold text-warm">{name} 한마디 · 평가 아님</p>
            <p className="break-words font-medium">{line}</p>
          </div>
        </div>
      )}
    </div>
  );
}
