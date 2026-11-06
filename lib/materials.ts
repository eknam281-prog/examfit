// 향후 AI 문제 생성에 전달할 자료 선택 로직(아직 호출하는 곳은 없음, 요약 표시에만 사용).
// 우선순위: 1) 사용자가 확정한 텍스트 2) 자동 점검을 통과한 추출 텍스트 3) 사용자가 포함을 승인한 확인 권장 페이지.
// 실패·텍스트 없음 페이지는 내용을 만들지 않으며(사용자가 직접 입력해 확정한 경우만 예외), 모든 항목에 출처(파일·쪽)를 유지한다.
import type { PdfFile, PdfPage } from "./pdfStore";
import { ensureQuality } from "./pdfQuality";

export type SourceKind = "confirmed" | "user-edited" | "auto" | "approved-review";
export type MaterialItem = { fileId: string; fileName: string; page: number; text: string; source: SourceKind };
export type Excluded = { fileId: string; fileName: string; page: number; reason: "failed" | "empty" | "review-not-approved" };

export function selectForGeneration(files: PdfFile[], pagesByFile: Record<string, PdfPage[]>) {
  const items: MaterialItem[] = [];
  const excluded: Excluded[] = [];
  for (const f of files) {
    if (f.state !== "done") continue;
    for (const raw of pagesByFile[f.id] ?? []) {
      const p = ensureQuality(raw);
      const base = { fileId: f.id, fileName: f.name, page: p.page };
      const edited = p.edited.trim();
      if (p.confirmed && edited) items.push({ ...base, text: p.edited, source: "confirmed" });
      else if (p.quality === "failed" || p.quality === "empty") excluded.push({ ...base, reason: p.quality });
      else if (p.edited !== p.original && edited) items.push({ ...base, text: p.edited, source: "user-edited" }); // 사용자가 고쳤지만 아직 확정 전
      else if (p.quality === "usable") items.push({ ...base, text: p.original, source: "auto" });
      else if (p.includeApproved) items.push({ ...base, text: p.original, source: "approved-review" });
      else excluded.push({ ...base, reason: "review-not-approved" });
    }
  }
  return { items, excluded };
}
