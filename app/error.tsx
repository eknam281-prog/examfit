"use client";
import { btnPrimary } from "@/components/ui";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="py-20 text-center">
      <p className="font-semibold">문제가 발생했습니다.</p>
      <p className="mt-1 text-sm text-charcoal/60">잠시 후 다시 시도해 주세요.</p>
      <button onClick={reset} className={`${btnPrimary} mt-4`}>
        다시 시도
      </button>
    </div>
  );
}
