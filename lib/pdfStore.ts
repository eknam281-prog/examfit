// 시험 자료(PDF) 저장소. localStorage와 분리해 IndexedDB에 보관한다(이 기기·브라우저 전용, 서버 전송 없음).
export type PageStatus = "ok" | "empty" | "failed";

export type PdfFile = {
  id: string;
  name: string;
  size: number;
  pageCount: number;
  addedAt: number;
  state: "extracting" | "done" | "failed";
  error?: string;
  blob?: Blob; // 원본 PDF (미리보기용, 수정하지 않음)
};

export type PdfPage = {
  key: string; // `${fileId}:${page}`
  fileId: string;
  page: number; // 1부터
  status: PageStatus;
  error?: string;
  original: string; // 추출 원문 (불변)
  edited: string; // 사용자 수정본 (처음엔 original과 동일)
  reviewed: boolean;
  confirmed: boolean;
  // 자동 품질 점검(시스템 판단, 사용자 검수와 별개). 구버전 데이터에는 없을 수 있어 읽을 때 보강한다.
  quality?: "usable" | "review" | "failed" | "empty";
  qualityNotes?: string[];
  includeApproved?: boolean; // 확인 권장 페이지를 문제 생성에 포함하도록 사용자가 승인
  source?: "text" | "ocr"; // 없으면 pdf.js 텍스트 추출(구버전 데이터)
  ocrState?: "done" | "failed";
  ocrError?: string;
  ocrUsage?: { input: number; output: number }; // 응답에 usage가 있을 때만
};

const DB = "examfit-materials";
let dbp: Promise<IDBDatabase> | null = null;

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore("files", { keyPath: "id" });
        db.createObjectStore("pages", { keyPath: "key" }).createIndex("fileId", "fileId");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB를 열 수 없습니다."));
    });
    dbp.catch(() => (dbp = null));
  }
  return dbp;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export const storeAvailable = () => typeof indexedDB !== "undefined";

export async function listFiles(): Promise<PdfFile[]> {
  const db = await open();
  const all = await wrap(db.transaction("files").objectStore("files").getAll() as IDBRequest<PdfFile[]>);
  return all.sort((a, b) => a.addedAt - b.addedAt);
}

export async function listPages(fileId: string): Promise<PdfPage[]> {
  const db = await open();
  const all = await wrap(db.transaction("pages").objectStore("pages").index("fileId").getAll(fileId) as IDBRequest<PdfPage[]>);
  return all.sort((a, b) => a.page - b.page);
}

export async function putFile(f: PdfFile) {
  const db = await open();
  await wrap(db.transaction("files", "readwrite").objectStore("files").put(f));
}

export async function putPage(p: PdfPage) {
  const db = await open();
  await wrap(db.transaction("pages", "readwrite").objectStore("pages").put(p));
}

export async function putPages(ps: PdfPage[]) {
  const db = await open();
  const tx = db.transaction("pages", "readwrite");
  const st = tx.objectStore("pages");
  ps.forEach((p) => st.put(p));
  await new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function getFile(id: string): Promise<PdfFile | undefined> {
  const db = await open();
  return wrap(db.transaction("files").objectStore("files").get(id) as IDBRequest<PdfFile | undefined>);
}

export async function deleteFile(id: string) {
  const pages = await listPages(id);
  const db = await open();
  const tx = db.transaction(["files", "pages"], "readwrite");
  tx.objectStore("files").delete(id);
  pages.forEach((p) => tx.objectStore("pages").delete(p.key));
  await new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

// 열려 있는 IndexedDB 연결을 닫는다(데이터베이스 삭제가 연결 때문에 막히지 않도록 전체 초기화 전에 호출).
export async function closeStore() {
  if (!dbp) return;
  try {
    (await dbp).close();
  } catch {
    /* 열리지 않았으면 닫을 것 없음 */
  }
  dbp = null;
}
