import Image from "next/image";
import { getLevelInfo } from "@/lib/character";
import { ProgressBar } from "./ui";

// 핏찹이 표시. 이미지는 원본(투명 PNG, 정사각형 비율)을 그대로 사용하며 최적화/변형하지 않는다.
export function Fitchap({ xp, size = 160, showXp = true }: { xp: number; size?: number; showXp?: boolean }) {
  const { current, next, progress, xpToNext } = getLevelInfo(xp);
  return (
    <div className="flex flex-col items-center gap-3">
      <Image src={current.image} alt={`핏찹이 Lv.${current.level}`} width={size} height={size} unoptimized priority />
      {showXp && (
        <div className="w-full max-w-xs text-center">
          <p className="text-sm font-semibold">
            핏찹이 Lv.{current.level} · {xp} XP
          </p>
          <div className="mt-2">
            <ProgressBar value={progress} />
          </div>
          <p className="mt-1 text-xs text-warm">{next ? `Lv.${next.level}까지 ${xpToNext} XP` : "최고 레벨"}</p>
        </div>
      )}
    </div>
  );
}
