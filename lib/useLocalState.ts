"use client";
import { useCallback, useEffect, useState } from "react";

// localStorage 기반 상태. 이 기기·브라우저에만 저장되며 기기 간 동기화/보안은 지원하지 않는다.
export function useLocalState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setValue(JSON.parse(raw) as T);
    } catch {
      /* 손상된 저장값은 무시하고 초기값 사용 */
    }
    setReady(true);
  }, [key]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(v));
        } catch {
          /* 저장 실패 시 메모리 상태만 유지 */
        }
        return v;
      });
    },
    [key],
  );

  return [value, update, ready] as const;
}
