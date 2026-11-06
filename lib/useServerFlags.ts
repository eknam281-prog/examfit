"use client";
import { useEffect, useState } from "react";

export type ServerFlags = { ai: boolean; oral: boolean } | null; // null: 아직 확인 중/확인 실패

// 서버에서 AI·구술시험(음성) 기능이 켜져 있는지 읽는다. 확인에 실패하면 null(기능을 막지 않고 서버 응답에 맡긴다).
export function useServerFlags(): ServerFlags {
  const [flags, setFlags] = useState<ServerFlags>(null);
  useEffect(() => {
    let dead = false;
    fetch("/api/exam/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !dead && d && typeof d.ai === "boolean" && typeof d.oral === "boolean" && setFlags({ ai: d.ai, oral: d.oral }))
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, []);
  return flags;
}
