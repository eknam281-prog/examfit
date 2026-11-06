"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { Icon } from "./Icons";
import { Badge, btnLarge, btnPrimary, btnSecondary, Card } from "./ui";
import { describeError, extractPageText, MAX_FILE_BYTES, MAX_PAGES, openPdf } from "@/lib/pdfExtract";
import { selectForGeneration } from "@/lib/materials";
import { applyOcrFailure, applyOcrResult, assessOcrText, callOcr, MAX_OCR_PAGES, planOcr, renderPagePng } from "@/lib/ocr";
import { assessPage, ensureQuality, QUALITY_LABEL, type Quality } from "@/lib/pdfQuality";
import { deleteFile, listFiles, listPages, putFile, putPage, putPages, storeAvailable, type PdfFile, type PdfPage } from "@/lib/pdfStore";

// 시스템 처리(추출·자동 점검)와 사용자 검수(reviewed/confirmed)는 별도로 집계한다.
export type MaterialSummary = {
  files: number;
  failedFiles: number;
  pages: number;
  usable: number;
  review: number;
  empty: number;
  failed: number;
  reviewed: number; // 사용자 검수 완료
  confirmed: number; // 사용자 확정
  selected: number; // 문제 생성에 쓰일 페이지 수(선택 규칙 적용 결과)
  extracting: boolean;
};

const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
const isPdf = (f: File) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
const STATUS_NOTE = { empty: "텍스트가 없는 페이지입니다. 스캔 PDF라면 AI 이미지 인식으로 처리할 수 있습니다.", failed: "이 페이지의 텍스트를 추출하지 못했습니다." } as const;
const pageList = (ns: number[]) => (ns.length > 12 ? `${ns.slice(0, 12).join(", ")} 외 ${ns.length - 12}쪽` : ns.join(", ")) + "쪽";

export function PdfReview({ onSummary, onContinue }: { onSummary: (s: MaterialSummary) => void; onContinue: () => void }) {
  const [files, setFiles] = useState<PdfFile[]>([]);
  const [pages, setPages] = useState<Record<string, PdfPage[]>>({});
  const [progress, setProgress] = useState<Record<string, { done: number; total: number }>>({});
  const [msgs, setMsgs] = useState<string[]>([]);
  const [fileId, setFileId] = useState<string | null>(null);
  const [pageNo, setPageNo] = useState(1);
  const [detail, setDetail] = useState(false);
  const [storeErr, setStoreErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const busy = useRef(false);
  // 스캔 페이지 비전 OCR: 사용자가 승인해야 시작하고, 페이지당 1회 순차 호출한다.
  const [ocrPlan, setOcrPlan] = useState<{ fileId: string; selected: number[] } | null>(null);
  const [ocrJob, setOcrJob] = useState<{ fileId: string; done: number; total: number; ok: number; failures: string[]; tokens: { input: number; output: number } | null; running: boolean } | null>(null);
  const ocrRunning = useRef(false);
  const ocrAbort = useRef<AbortController | null>(null);
  const pagesRef = useRef<Record<string, PdfPage[]>>({});
  const cancelled = useRef<Set<string>>(new Set());
  const extracting = Object.keys(progress).length > 0;
  pagesRef.current = pages;

  // 저장된 자료 복원 (기존 데이터는 삭제·재추출하지 않고, 품질 필드만 읽을 때 보강)
  useEffect(() => {
    if (!storeAvailable()) {
      setStoreErr("이 브라우저는 자료 저장(IndexedDB)을 지원하지 않습니다.");
      setReady(true);
      return;
    }
    (async () => {
      try {
        const fs = await listFiles();
        const map: Record<string, PdfPage[]> = {};
        for (const f of fs) {
          const stored = await listPages(f.id);
          // 마이그레이션: 자동 점검 도입 전에 저장된 미검수 OCR 페이지만 저장된 텍스트로 다시 점검한다(API 재호출·데이터 삭제 없음).
          // 사용자가 검수·승인·확정했거나 텍스트를 수정한 페이지는 건드리지 않는다.
          const changed: PdfPage[] = [];
          const migrated = stored.map((p) => {
            if (p.source !== "ocr" || p.reviewed || p.confirmed || p.includeApproved || p.edited !== p.original) return p;
            const a = assessOcrText(p.original);
            if (a.quality === p.quality && a.notes.join("\n") === (p.qualityNotes ?? []).join("\n")) return p;
            const next = { ...p, quality: a.quality, qualityNotes: a.notes };
            changed.push(next);
            return next;
          });
          if (changed.length) await putPages(changed).catch(() => setStoreErr("재점검 결과를 저장하지 못했습니다. 화면에는 반영되지만 새로고침하면 다시 계산돼요."));
          map[f.id] = migrated.map(ensureQuality);
        }
        // 추출 도중 닫힌 파일은 중단 상태로 표시
        const fixed = fs.map((f) => (f.state === "extracting" ? { ...f, state: "failed" as const, error: "추출이 중단되었습니다. 파일을 삭제하고 다시 선택해 주세요." } : f));
        setFiles(fixed);
        setPages(map);
        if (fixed[0]) setFileId(fixed[0].id);
      } catch {
        setStoreErr("저장된 자료를 불러오지 못했습니다. 새로 선택하면 이 세션에서만 사용할 수 있습니다.");
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const all = Object.values(pages).flat().map(ensureQuality);
  const count = (q: Quality) => all.filter((p) => p.quality === q).length;
  const sel = selectForGeneration(files, pages);
  // 문제 생성에 쓰이는 페이지 수 = selectForGeneration 결과(페이지당 1항목이라 중복 계산되지 않음). 근거별로 나눠서 표시한다.
  const bySource = (rows: typeof sel.items) => ({
    auto: rows.filter((i) => i.source === "auto").length,
    approved: rows.filter((i) => i.source !== "auto").length, // 사용자 승인·확정·수정한 페이지
  });
  const selSplit = bySource(sel.items);
  const summary: MaterialSummary = {
    files: files.length,
    failedFiles: files.filter((f) => f.state === "failed").length,
    pages: all.length,
    usable: count("usable"),
    review: count("review"),
    empty: count("empty"),
    failed: count("failed"),
    reviewed: all.filter((p) => p.reviewed).length,
    confirmed: all.filter((p) => p.confirmed).length,
    selected: sel.items.length,
    extracting,
  };
  const sKey = JSON.stringify(summary);
  useEffect(() => {
    if (ready) onSummary(JSON.parse(sKey) as MaterialSummary);
  }, [sKey, ready, onSummary]);

  const persist = useCallback(async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      setStoreErr(null);
    } catch {
      setStoreErr("브라우저 저장에 실패했습니다(저장 공간 부족 가능). 이 변경은 새로고침하면 사라질 수 있습니다.");
    }
  }, []);

  function dropFile(id: string) {
    setFiles((p) => p.filter((x) => x.id !== id));
    setPages((p) => {
      const { [id]: _, ...rest } = p;
      return rest;
    });
    setProgress((p) => {
      const { [id]: _, ...rest } = p;
      return rest;
    });
    setFileId((cur) => (cur === id ? null : cur));
  }

  async function addFiles(list: FileList | null) {
    if (!list || busy.current) return;
    busy.current = true;
    const errs: string[] = [];
    const queue: { f: File; base: PdfFile }[] = [];
    for (const f of Array.from(list)) {
      if (!isPdf(f)) errs.push(`${f.name}: PDF만 선택할 수 있습니다.`);
      else if (f.size > MAX_FILE_BYTES) errs.push(`${f.name}: 파일이 너무 큽니다(최대 ${kb(MAX_FILE_BYTES)}, 현재 ${kb(f.size)}).`);
      else queue.push({ f, base: { id: crypto.randomUUID(), name: f.name, size: f.size, pageCount: 0, addedAt: Date.now(), state: "extracting", blob: f } });
    }
    setMsgs(errs);
    // 모든 파일을 먼저 목록에 올리고(대기 중), 파일별로 독립 처리한다. 결과는 항상 파일 id로만 기록한다.
    setFiles((p) => [...p, ...queue.map((q) => q.base)]);
    setPages((p) => ({ ...p, ...Object.fromEntries(queue.map((q) => [q.base.id, [] as PdfPage[]])) }));
    setProgress((p) => ({ ...p, ...Object.fromEntries(queue.map((q) => [q.base.id, { done: 0, total: 0 }])) }));
    for (const { f, base } of queue) {
      if (cancelled.current.has(base.id)) continue;
      await persist(() => putFile(base));
      let doc: PDFDocumentProxy | null = null;
      try {
        doc = await openPdf(f);
        if (doc.numPages > MAX_PAGES) throw Object.assign(new Error(`페이지가 너무 많습니다(최대 ${MAX_PAGES}쪽, 현재 ${doc.numPages}쪽). 파일을 나눠 주세요.`), { name: "TooManyPages" });
        const withCount = { ...base, pageCount: doc.numPages };
        setFiles((p) => p.map((x) => (x.id === base.id ? withCount : x)));
        const done: PdfPage[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
          if (cancelled.current.has(base.id)) break;
          setProgress((p) => ({ ...p, [base.id]: { done: n - 1, total: doc!.numPages } }));
          let rec: PdfPage = { key: `${base.id}:${n}`, fileId: base.id, page: n, status: "ok", original: "", edited: "", reviewed: false, confirmed: false };
          try {
            const text = await extractPageText(await doc.getPage(n));
            rec = { ...rec, original: text, edited: text, status: text.replace(/\s/g, "") ? "ok" : "empty" };
          } catch (e) {
            rec = { ...rec, status: "failed", error: describeError(e) };
          }
          const a = assessPage(rec.original, rec.status, rec.error);
          rec = { ...rec, quality: a.quality, qualityNotes: a.notes };
          done.push(rec);
          setPages((p) => ({ ...p, [base.id]: [...done] }));
        }
        if (cancelled.current.has(base.id)) {
          dropFile(base.id);
          await persist(() => deleteFile(base.id));
          continue;
        }
        const fin = { ...withCount, state: "done" as const };
        setFiles((p) => p.map((x) => (x.id === base.id ? fin : x)));
        await persist(async () => {
          await putPages(done);
          await putFile(fin);
        });
      } catch (e) {
        const failed = { ...base, state: "failed" as const, error: (e as Error).name === "TooManyPages" ? (e as Error).message : describeError(e) };
        setFiles((p) => p.map((x) => (x.id === base.id ? failed : x)));
        await persist(() => putFile(failed));
      } finally {
        void doc?.loadingTask.destroy();
        setProgress((p) => {
          const { [base.id]: _, ...rest } = p;
          return rest;
        });
        cancelled.current.delete(base.id);
      }
    }
    busy.current = false;
  }

  // 업로드/추출 취소: 진행 중이면 중단 후 해당 파일만 제거, 대기 중이면 건너뛴다.
  function cancel(id: string) {
    cancelled.current.add(id);
    dropFile(id);
    void persist(() => deleteFile(id));
  }

  async function remove(id: string) {
    dropFile(id);
    await persist(() => deleteFile(id));
  }

  function updatePage(rec: PdfPage) {
    setPages((p) => ({ ...p, [rec.fileId]: (p[rec.fileId] ?? []).map((x) => (x.key === rec.key ? rec : x)) }));
    void persist(() => putPage(rec));
  }

  const file = files.find((f) => f.id === fileId) ?? null;
  const fpages = file ? (pages[file.id] ?? []) : [];
  const page = fpages.find((p) => p.page === pageNo) ?? fpages[0] ?? null;
  const reviewedCount = fpages.filter((p) => p.reviewed).length;

  function confirmReviewed() {
    const next = fpages.map((p) => (p.reviewed && !p.confirmed ? { ...p, confirmed: true } : p));
    setPages((p) => ({ ...p, [file!.id]: next }));
    void persist(() => putPages(next.filter((p, i) => p !== fpages[i])));
  }

  function askOcr(id: string) {
    if (ocrRunning.current || extracting) return;
    if (planOcr(pagesRef.current[id] ?? []).targets.length > 0) setOcrPlan({ fileId: id, selected: [] }); // 기본값: 미선택
  }

  // 승인 후 시작: 이미 OCR한 페이지는 대상에서 빠지므로 중단 후 다시 시작해도 완료 페이지를 재처리하지 않는다.
  async function runOcr() {
    if (!ocrPlan || ocrRunning.current || ocrPlan.selected.length === 0) return;
    const f = files.find((x) => x.id === ocrPlan.fileId);
    if (!f?.blob) return setOcrPlan(null);
    ocrRunning.current = true;
    const ac = new AbortController();
    ocrAbort.current = ac;
    const targets = planOcr(pagesRef.current[f.id] ?? [], ocrPlan.selected).targets; // 선택한 페이지만, 이미 완료한 쪽은 제외
    const job = { fileId: f.id, done: 0, total: targets.length, ok: 0, failures: [] as string[], tokens: null as { input: number; output: number } | null, running: true };
    setOcrPlan(null);
    setOcrJob({ ...job });
    let doc: PDFDocumentProxy | null = null;
    let consecutive = 0;
    try {
      doc = await openPdf(f.blob);
      for (const t of targets) {
        if (ac.signal.aborted) break;
        const cur = (pagesRef.current[f.id] ?? []).find((x) => x.key === t.key) ?? t;
        let next: PdfPage;
        let fatal = false;
        try {
          const r = await callOcr(await renderPagePng(doc, t.page), f.name, t.page, ac.signal);
          if (r.status === 200 && r.text) {
            next = applyOcrResult(cur, r.text, r.usage);
            if (next.ocrState === "done") {
              job.ok++;
              consecutive = 0;
              if (r.usage) job.tokens = { input: (job.tokens?.input ?? 0) + r.usage.input, output: (job.tokens?.output ?? 0) + r.usage.output };
            } else {
              job.failures.push(`${t.page}쪽: ${next.ocrError}`);
            }
          } else {
            next = applyOcrFailure(cur, r.message ?? "OCR에 실패했습니다.");
            job.failures.push(`${t.page}쪽: ${next.ocrError}`);
            consecutive++;
            fatal = [400, 429, 503].includes(r.status);
          }
        } catch (e) {
          if (ac.signal.aborted) break;
          next = applyOcrFailure(cur, (e as Error).message || "OCR 처리 중 오류가 발생했습니다.");
          job.failures.push(`${t.page}쪽: ${next.ocrError}`);
          consecutive++;
        }
        updatePage(next); // 페이지 완료 즉시 IndexedDB에 저장
        job.done++;
        setOcrJob({ ...job });
        if (fatal || consecutive >= 2) break; // 설정·한도 오류나 연속 실패는 멈춘다(자동 재시도 없음)
      }
    } catch (e) {
      job.failures.push((e as Error).message || "PDF를 열지 못했습니다.");
    } finally {
      void doc?.loadingTask.destroy();
      ocrRunning.current = false;
      ocrAbort.current = null;
      setOcrJob({ ...job, running: false });
    }
  }

  function openDetail(id: string, first?: number) {
    setFileId(id);
    setPageNo(first ?? 1);
    setDetail(true);
  }

  // 문제가 있는 페이지(확인 권장·실패·텍스트 없음)를 파일별로 정리
  const problems = files
    .filter((f) => f.state === "done")
    .map((f) => {
      const ps = (pages[f.id] ?? []).map(ensureQuality);
      const by = (q: Quality) => ps.filter((p) => p.quality === q).map((p) => p.page);
      return { f, review: by("review"), failed: by("failed"), empty: by("empty"), total: ps.length };
    })
    .filter((x) => x.review.length + x.failed.length + x.empty.length > 0);
  const firstProblem = problems[0] && ([...problems[0].review, ...problems[0].failed, ...problems[0].empty].sort((a, b) => a - b)[0] ?? 1);
  const doneFiles = files.filter((f) => f.state === "done");
  const finished = !extracting && doneFiles.length > 0;
  const problemCount = summary.review + summary.failed + summary.empty;
  const mode: "A" | "B" | "C" | null = !finished ? null : summary.selected === 0 && summary.review === 0 ? "C" : problemCount === 0 && summary.failedFiles === 0 ? "A" : "B";

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">강의자료 PDF</h2>
          <Badge tone="gray">이 기기에만 저장</Badge>
        </div>
        <label className={`mt-4 flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-sage-dark/40 bg-sage-soft/60 p-6 text-center transition hover:bg-sage-soft focus-within:outline-2 ${extracting ? "pointer-events-none opacity-60" : ""}`}>
          <Icon name="upload" className="h-8 w-8 text-sage-dark" />
          <span className="font-semibold">PDF 파일 선택 · 자동으로 텍스트를 추출해요</span>
          <span className="text-xs text-warm">텍스트 PDF만 · 여러 파일 가능 · 파일당 {kb(MAX_FILE_BYTES)}·{MAX_PAGES}쪽까지 · 스캔 PDF는 AI 이미지 인식을 통해 처리할 수 있습니다</span>
          <input type="file" accept=".pdf,application/pdf" multiple disabled={extracting} onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} aria-label="강의자료 PDF 선택" className="sr-only" />
        </label>
        {msgs.map((m) => (
          <p key={m} role="alert" className="mt-3 rounded-2xl bg-sand p-3 text-sm font-medium">
            ⚠ {m}
          </p>
        ))}
        {storeErr && (
          <p role="alert" className="mt-3 rounded-2xl bg-sand p-3 text-sm font-medium">
            ⚠ {storeErr}
          </p>
        )}
        <p className="mt-3 text-xs text-warm">파일은 서버로 전송되지 않습니다. 추출은 pdf.js(텍스트 추출, AI 아님)로 이 브라우저에서 이뤄지며, 추출 원문은 수정해도 따로 보존됩니다.</p>
      </Card>

      {files.length > 0 && (
        <Card tone="soft">
          <ul className="space-y-2">
            {files.map((f) => {
              const ps = (pages[f.id] ?? []).map(ensureQuality);
              const pr = progress[f.id];
              const usable = ps.filter((p) => p.quality === "usable").length;
              const need = ps.filter((p) => p.quality !== "usable").length;
              const needScan = ps.filter((p) => p.status === "empty" && p.source !== "ocr" && p.ocrState !== "done").length;
              const hasOcr = ps.some((p) => p.source === "ocr");
              return (
                <li key={f.id} className="rounded-2xl bg-white p-3 text-sm">
                  <div className="flex items-center gap-3">
                    <Icon name="file" className="h-5 w-5 shrink-0 text-sage-dark" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{f.name}</span>
                      <span className="block text-xs text-warm">
                        {kb(f.size)}
                        {f.pageCount ? ` · ${f.pageCount}쪽` : ""}
                        {f.state === "done" && ` · 문제 생성에 사용 ${sel.items.filter((i) => i.fileId === f.id).length}쪽`}
                        {f.state === "done" && need > 0 && ` · 확인 필요 ${need}쪽`}
                      </span>
                    </span>
                    {f.state === "extracting" && <Badge tone="gray">{pr && pr.total ? "추출 중" : "대기 중"}</Badge>}
                    {f.state === "failed" && <Badge tone="dark">처리 실패</Badge>}
                    {f.state === "done" && (needScan > 0 ? <Badge tone="dark">AI 인식 필요</Badge> : hasOcr ? <Badge>인식 완료</Badge> : <Badge>추출 완료</Badge>)}
                  </div>
                  {f.state === "extracting" && (
                    <div role="status" className="mt-2">
                      <div className="h-2 overflow-hidden rounded-full bg-charcoal/10">
                        <div className="h-full rounded-full bg-olive-deep transition-all" style={{ width: `${pr && pr.total ? (pr.done / pr.total) * 100 : 0}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-warm">{pr && pr.total ? `${pr.done}/${pr.total}쪽 처리` : "순서를 기다리는 중"}</p>
                    </div>
                  )}
                  {f.state === "failed" && <p role="alert" className="mt-2 rounded-xl bg-sand p-2 text-xs font-medium">⚠ {f.error}</p>}
                  <div className="mt-2 flex flex-wrap justify-end gap-1">
                    {f.state === "extracting" && (
                      <button onClick={() => cancel(f.id)} className="min-h-9 rounded-xl px-3 text-xs font-semibold text-warm hover:bg-sand">
                        취소
                      </button>
                    )}
                    {f.state === "done" && (
                      <button onClick={() => (detail && fileId === f.id ? setDetail(false) : openDetail(f.id))} className="min-h-9 rounded-xl bg-sand px-3 text-xs font-semibold hover:bg-sand/70" aria-expanded={detail && fileId === f.id}>
                        {detail && fileId === f.id ? "상세 확인 닫기" : "상세 확인 · 텍스트 수정"}
                      </button>
                    )}
                    {f.state !== "extracting" && (
                      <button onClick={() => void remove(f.id)} className="min-h-9 rounded-xl px-3 text-xs font-semibold text-warm hover:bg-sand" aria-label={`${f.name} 삭제`}>
                        삭제
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* 스캔 페이지(텍스트 없음) 비전 OCR */}
      {doneFiles.map((f) => {
        const ps = (pages[f.id] ?? []).map(ensureQuality);
        const scan = ps.filter((p) => p.status === "empty" && p.source !== "ocr" && p.ocrState !== "done");
        const ocrDone = ps.filter((p) => p.source === "ocr");
        const job = ocrJob?.fileId === f.id ? ocrJob : null;
        const plan = ocrPlan?.fileId === f.id ? ocrPlan : null;
        if (scan.length === 0 && ocrDone.length === 0 && !job) return null;
        return (
          <Card key={`ocr-${f.id}`} tone="soft" className="ring-2 ring-cocoa/20">
            <p className="font-bold">스캔 페이지 AI 인식 · {f.name}</p>
            {scan.length > 0 && (
              <p className="mt-1 text-sm">
                텍스트가 없는 페이지 {scan.length}쪽({pageList(scan.map((p) => p.page))})이 있어요. 이미지로 된 페이지일 수 있어요.
              </p>
            )}
            {ocrDone.length > 0 && (
              <p className="mt-1 text-xs text-warm">
                AI 인식 완료 {ocrDone.length}쪽 · 자동 점검: 사용 가능 {ocrDone.filter((p) => p.quality === "usable").length}쪽(별도 검수 없이 문제 생성에 포함) · 확인 권장 {ocrDone.filter((p) => p.quality === "review").length}쪽(승인 또는 수정·확정 후 포함). 점검 통과가 원본과의 일치를 뜻하지는 않아요.
              </p>
            )}
            {plan ? (
              <div className="mt-3 rounded-2xl bg-white p-3 text-sm" role="dialog" aria-label="OCR 페이지 선택">
                <p className="font-bold">인식할 페이지 선택</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className={`${btnSecondary} !min-h-9 !px-3 text-xs`} onClick={() => setOcrPlan({ ...plan, selected: scan.map((p) => p.page) })}>
                    전체 선택
                  </button>
                  <button className={`${btnSecondary} !min-h-9 !px-3 text-xs`} onClick={() => setOcrPlan({ ...plan, selected: [] })}>
                    선택 해제
                  </button>
                </div>
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="OCR 대상 페이지">
                  {scan.map((p) => {
                    const on = plan.selected.includes(p.page);
                    return (
                      <li key={p.key}>
                        <label className={`flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-xs font-semibold ${on ? "bg-cocoa text-white" : "bg-sand"}`}>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => setOcrPlan({ ...plan, selected: on ? plan.selected.filter((n) => n !== p.page) : [...plan.selected, p.page].sort((x, y) => x - y) })}
                            className="h-4 w-4 accent-olive-deep"
                          />
                          {p.page}쪽
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-xs font-semibold">
                  선택 {plan.selected.length}쪽 → AI 호출 예정 {Math.min(plan.selected.length, MAX_OCR_PAGES)}회 (선택하지 않은 쪽은 호출하지 않아요)
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-warm">
                  {plan.selected.length > MAX_OCR_PAGES && <li>한 번에 최대 {MAX_OCR_PAGES}쪽까지만 처리해요. 나머지는 다음 작업에서 처리해요.</li>}
                  <li>호출은 페이지당 1회, 순차 처리예요. 호출마다 크레딧이 사용되고 정확한 비용은 알 수 없어요. 실패해도 자동 재시도하지 않아요.</li>
                  <li>인식 결과는 틀릴 수 있어요(특히 병음·성조·손글씨). 원본과 비교해 확인해 주세요.</li>
                </ul>
                <div className="mt-3 flex gap-2">
                  <button className={btnPrimary} disabled={plan.selected.length === 0} onClick={() => void runOcr()}>
                    선택한 {plan.selected.length}쪽 인식 시작
                  </button>
                  <button className={btnSecondary} onClick={() => setOcrPlan(null)}>
                    취소
                  </button>
                </div>
              </div>
            ) : job?.running ? (
              <div className="mt-3" role="status">
                <div className="h-2 overflow-hidden rounded-full bg-charcoal/10">
                  <div className="h-full rounded-full bg-olive-deep transition-all" style={{ width: `${(job.done / Math.max(1, job.total)) * 100}%` }} />
                </div>
                <p className="mt-1 text-xs text-warm">
                  인식 중 {job.done}/{job.total}쪽 · 성공 {job.ok}쪽
                </p>
                <button className={`${btnSecondary} mt-2 !min-h-9 !px-3 text-xs`} onClick={() => ocrAbort.current?.abort()}>
                  중단 (완료한 쪽은 보존)
                </button>
              </div>
            ) : (
              scan.length > 0 && (
                <button className={`${btnPrimary} mt-3`} disabled={extracting} onClick={() => askOcr(f.id)}>
                  AI로 스캔 페이지 인식 · 페이지 선택 ({scan.length}쪽 후보)
                </button>
              )
            )}
            {job && !job.running && (
              <div role="status" className="mt-3 rounded-2xl bg-white p-3 text-xs">
                <p className="font-semibold">
                  {job.ok}/{job.total}쪽 인식 완료{job.done < job.total ? ` · 미처리 ${job.total - job.done}쪽(다시 시작하면 남은 쪽만 처리)` : ""}
                </p>
                {job.tokens && <p className="mt-1 text-warm">AI 응답 기준 토큰 사용량: 입력 {job.tokens.input} · 출력 {job.tokens.output}</p>}
                {job.failures.map((m) => (
                  <p key={m} className="mt-1">⚠ {m}</p>
                ))}
                {job.ok > 0 && <p className="mt-1 text-warm">확인 권장 페이지만 ‘상세 확인’에서 원본과 비교해 승인하거나 수정·확정해 주세요. 사용 가능 페이지는 이미 문제 설정에 반영돼요.</p>}
              </div>
            )}
          </Card>
        );
      })}

      {/* 처리 결과 요약 — 시스템 점검 결과이며 사용자 검수와는 별개 */}
      {mode === "A" && (
        <Card tone="sage">
          <p className="flex items-center gap-2 text-lg font-bold">
            <Icon name="check" className="h-5 w-5 text-olive-deep" /> 강의자료 처리 완료
          </p>
          <p className="mt-1 text-sm">
            {summary.pages}쪽 모두 사용 가능해요. 검수 없이 문제 설정으로 넘어갈 수 있어요.
          </p>
          <p className="mt-1 text-xs text-warm">자동 점검은 눈에 띄는 추출 이상만 확인하며 원본과의 일치를 보장하지 않아요. 표·다단 읽기 순서와 이미지 속 글자는 점검되지 않아요. 사용자 검수는 따로 기록돼요.</p>
          <button className={`${btnPrimary} ${btnLarge} mt-4 w-full md:w-auto`} onClick={onContinue}>
            문제 설정으로
          </button>
        </Card>
      )}
      {mode === "B" && (
        <Card tone="soft" className="ring-2 ring-cocoa/30">
          <p className="text-lg font-bold">일부 페이지 확인 권장</p>
          <p className="mt-1 text-sm">
            전체 {summary.pages}쪽 중 <b>{summary.selected}쪽</b>을 문제 생성에 사용할 수 있어요
            {summary.selected > 0 && ` (자동 점검 통과 ${selSplit.auto}쪽 · 사용자 승인·확정 ${selSplit.approved}쪽)`}.
            {summary.failedFiles > 0 && ` 처리에 실패한 파일이 ${summary.failedFiles}개 있어요.`}
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {problems.map(({ f, review, failed, empty }) => (
              <li key={f.id} className="rounded-xl bg-white/70 p-2">
                <b className="break-all">{f.name}</b>
                {review.length > 0 && <span className="block">확인 권장: {pageList(review)}</span>}
                {failed.length > 0 && <span className="block">처리 실패: {pageList(failed)}</span>}
                {empty.length > 0 && <span className="block">텍스트 없음: {pageList(empty)} (스캔 PDF는 AI 이미지 인식을 통해 처리할 수 있습니다)</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-warm">계속하면 사용 가능한 페이지의 텍스트만 문제 생성에 쓰이고, 위 페이지는 사용되지 않아요(확인 후 포함을 승인하면 확인 권장 페이지는 쓸 수 있어요).</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button className={`${btnPrimary} ${btnLarge}`} disabled={summary.selected === 0} onClick={onContinue}>
              추출된 내용으로 계속하기 ({summary.selected}쪽)
            </button>
            {problems.length > 0 && (
              <button className={`${btnSecondary} ${btnLarge}`} onClick={() => openDetail(problems[0].f.id, firstProblem)}>
                문제 페이지 확인하기
              </button>
            )}
          </div>
        </Card>
      )}
      {mode === "C" && (
        <Card tone="soft" className="ring-2 ring-cocoa/30">
          <p className="text-lg font-bold">사용할 수 있는 텍스트가 없어요</p>
          <p className="mt-1 text-sm">모든 페이지에서 텍스트를 추출하지 못했거나 텍스트가 없었어요. 문제 설정으로 진행할 수 없습니다.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
            <li>스캔 PDF는 AI 이미지 인식을 통해 처리할 수 있습니다. 위의 ‘AI로 스캔 페이지 인식’에서 페이지를 선택해 주세요.</li>
            <li>다른 PDF 파일을 선택해 보세요.</li>
            <li>‘상세 확인 · 텍스트 수정’에서 페이지에 내용을 직접 입력하고 확정할 수도 있어요.</li>
          </ul>
        </Card>
      )}

      {detail && file && fpages.length > 0 && page && (
        <Viewer
          key={file.id}
          file={file}
          fpages={fpages}
          page={page}
          setPageNo={setPageNo}
          updatePage={updatePage}
          confirmReviewed={confirmReviewed}
          reviewedCount={reviewedCount}
        />
      )}
    </div>
  );
}

type PanelMode = "view" | "edit" | null;

function statusOf(p: PdfPage) {
  if (p.confirmed) return { label: "확정", tone: "sage" as const };
  if (p.reviewed) return { label: "검수 완료", tone: "dark" as const };
  const q = ensureQuality(p).quality;
  if (q === "failed") return { label: QUALITY_LABEL.failed, tone: "gray" as const };
  if (q === "empty") return { label: QUALITY_LABEL.empty, tone: "gray" as const };
  if (q === "review") return { label: QUALITY_LABEL.review, tone: "gray" as const };
  return { label: "미검수", tone: "gray" as const };
}

// 원본 PDF 페이지를 중심으로 보는 열람 화면. 텍스트 검수는 버튼을 눌렀을 때만 패널로 열린다.
function Viewer(props: {
  file: PdfFile;
  fpages: PdfPage[];
  page: PdfPage;
  setPageNo: (n: number) => void;
  updatePage: (p: PdfPage) => void;
  confirmReviewed: () => void;
  reviewedCount: number;
}) {
  const { file, fpages, page, setPageNo, updatePage, confirmReviewed, reviewedCount } = props;
  const [panel, setPanel] = useState<PanelMode>(null);
  const [showOrig, setShowOrig] = useState(false);
  const [jump, setJump] = useState("");
  const curChip = useRef<HTMLLIElement>(null);
  const total = fpages.length;
  const st = statusOf(page);
  const edited = page.edited !== page.original;
  const go = useCallback((d: number) => setPageNo(Math.min(total, Math.max(1, page.page + d))), [page.page, total, setPageNo]);

  useEffect(() => {
    curChip.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [page.page]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "Escape") return setPanel(null);
      if (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || panel) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, panel]);

  function doJump() {
    const n = Number(jump);
    if (Number.isInteger(n) && n >= 1 && n <= total) setPageNo(n);
    setJump("");
  }

  const pendingConfirm = fpages.some((p) => p.reviewed && !p.confirmed);
  const open = panel !== null;

  return (
    <section aria-label="PDF 원본 열람" className={open ? "xl:mr-[24rem]" : ""}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="truncate font-bold">{file.name}</h3>
          <p className="text-xs text-warm">
            <b className="text-charcoal">
              {page.page} / {total}쪽
            </b>{" "}
            · 검수 {reviewedCount}쪽 · 확정 {fpages.filter((p) => p.confirmed).length}쪽
          </p>
        </div>
        <button className={`${btnPrimary} !min-h-10 !px-4`} disabled={!pendingConfirm} onClick={confirmReviewed}>
          검수 완료 {reviewedCount}쪽 확정
        </button>
      </div>

      {/* 페이지 탐색: 가로 스크롤 */}
      <div className="mt-3 flex items-center gap-2">
        <ul className="flex min-w-0 flex-1 snap-x gap-1.5 overflow-x-auto px-1 pb-2 pt-1.5" aria-label="페이지 선택">
          {fpages.map((p) => {
            const cur = p.page === page.page;
            const tone = cur ? "bg-cocoa text-white" : p.confirmed ? "bg-olive/30 text-charcoal" : p.reviewed ? "bg-white text-cocoa ring-2 ring-cocoa/60" : ensureQuality(p).quality !== "usable" ? "bg-sand text-warm" : "bg-white text-charcoal ring-1 ring-charcoal/15";
            return (
              <li key={p.key} ref={cur ? curChip : undefined} className="shrink-0 snap-center">
                <button
                  onClick={() => setPageNo(p.page)}
                  aria-current={cur ? "page" : undefined}
                  aria-label={`${p.page}쪽 ${statusOf(p).label}${p.edited !== p.original ? ", 수정됨" : ""}`}
                  className={`relative flex h-10 min-w-10 items-center justify-center rounded-xl px-2 text-xs font-bold ${tone}`}
                >
                  {p.page}
                  {p.confirmed && <Icon name="check" className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-olive-deep p-0.5 text-white" />}
                  {!p.confirmed && ensureQuality(p).quality !== "usable" && <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-warm ring-2 ring-ivory" />}
                  {p.edited !== p.original && <span aria-hidden className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-cocoa ring-2 ring-ivory" />}
                </button>
              </li>
            );
          })}
        </ul>
        {total > 12 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              doJump();
            }}
            className="shrink-0"
          >
            <input value={jump} onChange={(e) => setJump(e.target.value)} inputMode="numeric" placeholder="쪽 이동" aria-label="페이지 번호로 이동" className="h-10 w-20 rounded-xl border border-charcoal/15 bg-white px-2 text-center text-xs" />
          </form>
        )}
      </div>
      <p className="text-[11px] text-warm">체크=확정 · 코코아 테두리=검수 완료 · 회색 점=텍스트 없음/실패 · 코코아 점=수정됨</p>

      {/* 원본 PDF 페이지 (스캔 노트 느낌) */}
      <div className="mt-3 rounded-3xl bg-sand/70 p-3 md:p-6">
        <Preview blob={file.blob} pageNo={page.page} />
      </div>

      {/* 하단 액션 */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className={`${btnSecondary} !px-4`} onClick={() => go(-1)} disabled={page.page <= 1} aria-label="이전 페이지">
          <Icon name="prev" className="h-4 w-4" /> 이전
        </button>
        <button className={`${btnSecondary} !px-4`} onClick={() => go(1)} disabled={page.page >= total} aria-label="다음 페이지">
          다음 <Icon name="next" className="h-4 w-4" />
        </button>
        <Badge tone={st.tone}>{st.label}</Badge>
        {edited && <Badge tone="gray">수정됨</Badge>}
        <span className="flex-1" />
        <button className={btnSecondary} onClick={() => setPanel("view")}>
          AI 추출 텍스트 보기
        </button>
        <button className={btnPrimary} onClick={() => setPanel("edit")}>
          텍스트 검수하기
        </button>
      </div>

      {open && <div className="fixed inset-0 z-20 bg-charcoal/30 md:hidden" onClick={() => setPanel(null)} aria-hidden />}
      {open && (
        <aside
          key={page.key}
          role="dialog"
          aria-label={`${page.page}쪽 텍스트 검수`}
          className="anim-pop fixed inset-x-0 bottom-0 z-30 flex max-h-[88vh] flex-col overflow-y-auto rounded-t-3xl bg-ivory p-5 shadow-[0_-8px_30px_rgb(41_39_36/0.18)] md:inset-y-0 md:bottom-auto md:left-auto md:right-0 md:max-h-none md:w-96 md:rounded-none md:rounded-l-3xl md:shadow-[-8px_0_30px_rgb(41_39_36/0.12)]"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <h4 className="font-bold">{page.page}쪽</h4>
              <Badge tone={st.tone}>{st.label}</Badge>
              {edited && <Badge tone="gray">수정됨</Badge>}
            </div>
            <button onClick={() => setPanel(null)} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-sand" aria-label="검수 패널 닫기">
              <Icon name="x" />
            </button>
          </div>

          {ensureQuality(page).quality === "review" && (
            <div role="alert" className="mt-3 rounded-2xl bg-sand p-3 text-xs">
              <p className="font-semibold">확인 권장</p>
              <ul className="mt-1 list-disc pl-4">
                {ensureQuality(page).qualityNotes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              <p className="mt-1 text-warm">자동 점검 결과일 뿐 오류로 확정된 것은 아니에요. 원본과 비교해 확인해 주세요.</p>
              <button className={`${page.includeApproved ? btnSecondary : btnPrimary} mt-2 !min-h-9 !px-3 text-xs`} onClick={() => updatePage({ ...page, includeApproved: !page.includeApproved })}>
                {page.includeApproved ? "문제 생성 포함 취소" : "이 페이지를 문제 생성에 포함"}
              </button>
            </div>
          )}
          {page.status !== "ok" && (
            <p role="alert" className="mt-3 rounded-2xl bg-sand p-3 text-xs font-medium">
              ⚠ {page.status === "failed" && page.error ? page.error : STATUS_NOTE[page.status]} 필요하면 직접 입력할 수 있습니다.
            </p>
          )}

          {panel === "view" ? (
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-semibold text-warm">AI가 추출한 원문</p>
              <pre lang="zh" className="max-h-[40vh] overflow-auto whitespace-pre-wrap rounded-2xl bg-sand p-3 text-sm leading-relaxed md:max-h-[50vh]">
                {page.original || "추출된 텍스트가 없습니다."}
              </pre>
              {edited && <p className="mt-2 text-xs text-warm">이 페이지는 수정본이 있습니다. 확인·수정은 &lsquo;텍스트 수정하기&rsquo;에서 할 수 있습니다.</p>}
              <button className={`${btnSecondary} mt-3`} onClick={() => setPanel("edit")}>
                텍스트 수정하기
              </button>
            </div>
          ) : (
            <div className="mt-4 flex flex-col">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-xs font-semibold text-warm">수정 가능한 텍스트</p>
                {page.original && (
                  <button className="text-xs font-semibold text-warm underline" onClick={() => setShowOrig((v) => !v)}>
                    {showOrig ? "추출 원문 숨기기" : "추출 원문 보기"}
                  </button>
                )}
              </div>
              {showOrig && page.original && (
                <pre lang="zh" className="mb-2 max-h-36 overflow-auto whitespace-pre-wrap rounded-2xl bg-sand p-3 text-xs leading-relaxed">
                  {page.original}
                </pre>
              )}
              <textarea
                autoFocus
                value={page.edited}
                onChange={(e) => updatePage({ ...page, edited: e.target.value, reviewed: false, confirmed: false })}
                rows={10}
                lang="zh"
                aria-label={`${page.page}쪽 추출 텍스트`}
                className="min-h-56 w-full rounded-2xl border border-charcoal/15 bg-white p-3 text-sm leading-relaxed"
              />
              <p className="mt-1 text-[11px] text-warm">수정하면 검수 완료·확정이 해제됩니다. 추출 원문은 따로 보존돼요.</p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button className={page.reviewed ? btnSecondary : btnPrimary} disabled={!page.edited.trim()} onClick={() => updatePage({ ...page, reviewed: !page.reviewed, confirmed: false })}>
              {page.reviewed ? "검수 취소" : "검수 완료"}
            </button>
            {page.reviewed && !page.confirmed && (
              <button className={btnPrimary} onClick={() => updatePage({ ...page, confirmed: true })}>
                이 페이지 확정
              </button>
            )}
            <button className={btnSecondary} disabled={!edited} onClick={() => updatePage({ ...page, edited: page.original, reviewed: false, confirmed: false })}>
              원문으로 되돌리기
            </button>
          </div>
          <p className="mt-3 text-xs text-warm">
            {page.confirmed ? "✓ 확정된 페이지입니다. 이후 문제 생성에 사용될 수 있어요." : page.reviewed ? "검수 완료 상태입니다. 확정하면 확정 페이지로 집계돼요." : "아직 검수하지 않았습니다."}
          </p>
          {page.page < total && (
            <button className="mt-3 min-h-11 self-start text-sm font-semibold text-sage-dark underline" onClick={() => go(1)}>
              다음 페이지로 →
            </button>
          )}
        </aside>
      )}
    </section>
  );
}

function Preview({ blob, pageNo }: { blob?: Blob; pageNo: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const [ratio, setRatio] = useState(1.414);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.round(el.clientWidth / 16) * 16));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!blob) return void setErr("원본을 불러올 수 없습니다.");
    let dead = false;
    let d: PDFDocumentProxy | null = null;
    setDoc(null);
    setErr(null);
    openPdf(blob)
      .then((x) => {
        if (dead) return void x.loadingTask.destroy();
        d = x;
        setDoc(x);
      })
      .catch((e) => !dead && setErr(describeError(e)));
    return () => {
      dead = true;
      void d?.loadingTask.destroy();
    };
  }, [blob]);

  // 현재 페이지만 렌더링한다(전체 페이지를 한꺼번에 그리지 않음).
  useEffect(() => {
    if (!doc || !canvas.current || !width) return;
    let task: RenderTask | null = null;
    let dead = false;
    setBusy(true);
    (async () => {
      try {
        const pg = await doc.getPage(pageNo);
        if (dead || !canvas.current) return;
        const base = pg.getViewport({ scale: 1 });
        setRatio(base.height / base.width);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const vp = pg.getViewport({ scale: (width / base.width) * dpr });
        const c = canvas.current;
        c.width = Math.floor(vp.width);
        c.height = Math.floor(vp.height);
        task = pg.render({ canvas: c, viewport: vp });
        await task.promise;
        if (!dead) setBusy(false);
      } catch (e) {
        if ((e as { name?: string }).name !== "RenderingCancelledException" && !dead) setErr("페이지 미리보기를 그리지 못했습니다.");
      }
    })();
    return () => {
      dead = true;
      task?.cancel();
    };
  }, [doc, pageNo, width]);

  return (
    <div ref={wrap} className="mx-auto w-full max-w-3xl">
      {err ? (
        <p className="rounded-2xl bg-white p-4 text-sm">⚠ {err}</p>
      ) : (
        <div className="relative overflow-hidden rounded-md border border-charcoal/10 bg-white shadow-[0_2px_12px_rgb(41_39_36/0.14)]" style={{ aspectRatio: `1 / ${ratio}` }}>
          <canvas ref={canvas} aria-label={`원본 PDF ${pageNo}쪽`} className="block h-full w-full" />
          {busy && (
            <p role="status" className="absolute inset-0 flex items-center justify-center text-sm text-warm">
              페이지 불러오는 중…
            </p>
          )}
        </div>
      )}
    </div>
  );
}
