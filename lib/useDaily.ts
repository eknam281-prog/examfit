"use client";
import { useCallback } from "react";
import { EMPTY_STORE, getActive, recompute, type DailySession, type DailyStore } from "./daily";
import { useLocalState } from "./useLocalState";

// 일일 학습 세션 저장소(localStorage `examfit.daily`). 단계 페이지들이 같은 세션을 읽고, 변경은 항상 recompute로 완료·잠금을 다시 계산한다.
export function useDaily() {
  const [store, setStore, ready] = useLocalState<DailyStore>("examfit.daily", EMPTY_STORE);
  const session = ready ? getActive(store) : null;
  const update = useCallback(
    (fn: (s: DailySession) => DailySession) =>
      setStore((prev) => {
        const id = prev.activeId;
        if (!id || !prev.sessions[id]) return prev;
        return { ...prev, sessions: { ...prev.sessions, [id]: recompute(fn(prev.sessions[id])) } };
      }),
    [setStore],
  );
  return { store, setStore, ready, session, update };
}
