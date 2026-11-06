// 시험 대비 자료 저장소(IndexedDB `examfit-materials`)의 요약·삭제 도구. 이 데이터베이스 하나만 다룬다.
import { IDB_NAME } from "./backup";
import { closeStore } from "./pdfStore";

export type IdbSummary = { state: "none" } | { state: "unknown" } | { state: "ok"; files: number; pages: number } | { state: "error"; message: string };

export async function idbSummary(): Promise<IdbSummary> {
  if (typeof indexedDB === "undefined") return { state: "none" };
  const list = (indexedDB as unknown as { databases?: () => Promise<{ name?: string }[]> }).databases;
  if (!list) return { state: "unknown" }; // 존재 여부를 확인할 수 없으면 열지 않는다(빈 DB가 새로 생기지 않게)
  try {
    const dbs = await list.call(indexedDB);
    if (!dbs.some((d) => d.name === IDB_NAME)) return { state: "none" };
    return await new Promise<IdbSummary>((resolve) => {
      const req = indexedDB.open(IDB_NAME);
      req.onerror = () => resolve({ state: "error", message: "자료 저장소를 열지 못했어요." });
      req.onsuccess = () => {
        const db = req.result;
        const names = Array.from(db.objectStoreNames);
        if (!names.includes("files") || !names.includes("pages")) {
          db.close();
          return resolve({ state: "ok", files: 0, pages: 0 });
        }
        const tx = db.transaction(["files", "pages"]);
        const f = tx.objectStore("files").count();
        const p = tx.objectStore("pages").count();
        tx.oncomplete = () => {
          db.close();
          resolve({ state: "ok", files: f.result, pages: p.result });
        };
        tx.onerror = () => {
          db.close();
          resolve({ state: "error", message: "자료 개수를 읽지 못했어요." });
        };
      };
    });
  } catch {
    return { state: "error", message: "자료 저장소를 확인하지 못했어요." };
  }
}

export async function deleteIdb(): Promise<{ ok: true } | { ok: false; message: string }> {
  if (typeof indexedDB === "undefined") return { ok: true };
  await closeStore(); // 이 페이지에서 열어 둔 연결 정리
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: { ok: true } | { ok: false; message: string }) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    const req = indexedDB.deleteDatabase(IDB_NAME);
    req.onsuccess = () => done({ ok: true });
    req.onerror = () => done({ ok: false, message: "시험 대비 자료 저장소를 삭제하지 못했어요." });
    req.onblocked = () => setTimeout(() => done({ ok: false, message: "다른 탭에서 자료 저장소를 사용 중이라 삭제하지 못했어요. 다른 탭을 닫고 다시 시도해 주세요." }), 3000);
  });
}
