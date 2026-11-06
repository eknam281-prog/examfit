// 스캔 페이지 비전 OCR 보조 로직(브라우저). 텍스트가 전혀 없는 페이지만 OCR 후보로 본다(짧은 표지는 텍스트가 있으므로 제외).
import type { PdfPage } from "./pdfStore";
import { loadPdfJs } from "./pdfExtract";

export const OCR_REVIEW_NOTE = "AI 인식 · 미검수: 위 항목을 원본과 비교해 확인하고, 승인하거나 수정·확정해 주세요.";
export const OCR_USABLE_NOTE = "AI 인식 · 자동 점검에서 눈에 띄는 이상이 감지되지 않았어요(원본과의 일치를 보장하지 않아요).";
export const OCR_NOTE = "AI 인식 · 미검수: 이미지에서 AI가 읽은 결과예요. 한자·병음·성조를 원본과 비교해 확인해 주세요.";
export const MAX_OCR_PAGES = 40; // 한 작업의 최대 페이지(= 최대 호출 수, 크레딧 보호)
export const OCR_WIDTH = 1500; // 시험에서 검증한 해상도(≈2.5배)

// OCR 대상: 일반 추출에서 텍스트가 없었고(empty), 아직 OCR 결과가 없는 페이지. 이미 완료한 페이지는 다시 처리하지 않는다.
export const needsOcr = (p: PdfPage) => p.status === "empty" && p.source !== "ocr" && p.ocrState !== "done";
export const ocrTargets = (pages: PdfPage[]) => pages.filter(needsOcr);

// selected가 주어지면 그 페이지만(그리고 아직 OCR하지 않은 페이지만) 대상으로 한다. 선택하지 않은 페이지는 호출하지 않는다.
export function planOcr(pages: PdfPage[], selected?: number[]) {
  const all = ocrTargets(pages).filter((p) => !selected || selected.includes(p.page));
  const targets = all.slice(0, MAX_OCR_PAGES);
  return { targets, calls: targets.length, skipped: all.length - targets.length };
}

const TONE = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/;
const LATIN_WORD = /[A-Za-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]+/g;
const HAN = /[\u4e00-\u9fff]/;
const HANGUL = /[\uac00-\ud7a3]/;

// OCR 텍스트 자동 점검. 눈에 띄는 이상 징후만 찾으며 원본과의 일치(정확도)를 판정하지 않는다.
// failed: 읽은 내용이 없거나 대부분 깨짐(제외) / review: 이상 징후(사용자 승인·수정 필요) / usable: 감지된 이상 없음.
export function assessOcrText(text: string): { quality: "usable" | "review" | "failed"; notes: string[] } {
  const compact = text.replace(/\s/g, "");
  if (!compact) return { quality: "failed", notes: ["이미지에서 읽은 글자가 없습니다."] };
  const bad = (text.match(/[\uFFFD\uE000-\uF8FF\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) ?? []).length;
  if (bad / compact.length > 0.3) return { quality: "failed", notes: ["깨진 문자가 대부분이라 사용할 수 없습니다."] };

  const notes = new Set<string>();
  if (bad > 0) notes.add(`깨진 문자 ${bad}개가 있습니다.`);
  const unclear = (text.match(/\[불명확\]/g) ?? []).length;
  if (unclear > 0) notes.add(`AI가 읽지 못한 부분([불명확]) ${unclear}곳이 있습니다.`);
  if (/([^\s.\-_=*~·…─━—•|])\1{14,}/.test(text)) notes.add("같은 글자가 비정상적으로 반복됩니다.");
  if (compact.length < 15) notes.add("인식된 글자가 매우 적습니다.");

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  // 병음 형식: 라틴 단어가 여러 개인 줄에서 글자·숫자 혼합 또는 성조 부호 전무
  let pinyinLines = 0;
  let toneLines = 0;
  let mixed = 0;
  for (const l of lines) {
    const words = l.replace(/\[필기:[^\]]*\]/g, " ").match(LATIN_WORD) ?? [];
    if (words.length >= 2 && HAN.test(text)) {
      pinyinLines++;
      if (TONE.test(l)) toneLines++;
    }
    if (/\b[A-Za-z]+\d+[A-Za-z]*\b|\b\d+[A-Za-z]+\b/.test(l.replace(/F&B|\d+쪽/g, ""))) mixed++;
    else if (words.length >= 3 && /(^|\s)\d+(\s|$)/.test(l)) mixed++; // 병음 사이에 떨어진 숫자
  }
  if (mixed > 0) notes.add(`병음 줄에 글자와 숫자가 섞인 곳이 ${mixed}줄 있습니다.`);
  if (pinyinLines >= 2 && toneLines === 0) notes.add("병음으로 보이는 줄에 성조 부호가 하나도 없습니다.");
  else if (pinyinLines >= 3 && toneLines / pinyinLines < 0.5) notes.add("병음 줄 상당수에 성조 부호가 없습니다.");

  // 단어 목록 구조: `한자 | 병음 | 품사 | 뜻` 형식 줄 점검
  const rows = lines.filter((l) => l.includes("|"));
  if (rows.length >= 2) {
    const broken = rows.filter((l) => {
      const f = l.replace(/\[필기:[^\]]*\]/g, "").split("|").map((x) => x.trim());
      return f.length < 3 || !HAN.test(f[0]) || !f[f.length - 1] || !HANGUL.test(f[f.length - 1]);
    }).length;
    if (broken > 0) notes.add(`단어·뜻 구조가 빠졌거나 어긋난 줄이 ${broken}줄 있습니다.`);
  }

  if (notes.size > 0) return { quality: "review", notes: [...notes, OCR_REVIEW_NOTE] };
  return { quality: "usable", notes: [OCR_USABLE_NOTE] };
}

// 성공한 OCR 텍스트를 기존 페이지 구조로 변환한다. 자동 점검을 통과한 쪽은 사용 가능, 이상 징후가 있으면 확인 권장
// (사용자 승인 또는 수정·확정 전에는 문제 생성에 쓰이지 않음), 읽은 내용이 없거나 깨졌으면 실패(제외)로 둔다.
// reviewed/confirmed는 사용자 동작으로만 바뀐다(자동 점검 통과를 검수 완료로 처리하지 않음).
export function applyOcrResult(p: PdfPage, text: string, usage?: { input: number; output: number }): PdfPage {
  const clean = text.trim();
  const a = assessOcrText(clean);
  if (a.quality === "failed") return { ...p, ocrState: "failed", ocrError: a.notes[0] };
  return { ...p, status: "ok", source: "ocr", original: clean, edited: clean, reviewed: false, confirmed: false, includeApproved: false, quality: a.quality, qualityNotes: a.notes, ocrState: "done", ocrError: undefined, ocrUsage: usage };
}

export function applyOcrFailure(p: PdfPage, msg: string): PdfPage {
  return { ...p, ocrState: "failed", ocrError: msg };
}

// 페이지를 PNG(base64, data URL 아님)로 렌더링한다.
export async function renderPagePng(doc: import("pdfjs-dist").PDFDocumentProxy, pageNo: number): Promise<string> {
  await loadPdfJs();
  const pg = await doc.getPage(pageNo);
  const base = pg.getViewport({ scale: 1 });
  const vp = pg.getViewport({ scale: OCR_WIDTH / base.width });
  const c = document.createElement("canvas");
  c.width = Math.floor(vp.width);
  c.height = Math.floor(vp.height);
  await pg.render({ canvas: c, viewport: vp }).promise;
  const url = c.toDataURL("image/png");
  c.width = c.height = 0;
  return url.slice(url.indexOf(",") + 1);
}

// Next.js API가 보낸 오류는 message가 있고, Vercel 방화벽(호출 제한)이 막으면 message 없이 403/429가 온다.
export function httpFailureText(status: number, message?: string): string {
  if (message) return message;
  if (status === 403 || status === 429) return "요청이 짧은 시간에 너무 많아 일시적으로 제한됐어요(보통 10분 안에 풀려요). 잠시 후 다시 시도해 주세요. 이미 인식한 쪽은 저장되어 있고 남은 쪽만 처리돼요.";
  return `HTTP ${status}`;
}

export type OcrResponse = { text?: string; usage?: { input: number; output: number }; message?: string; status: number };

export async function callOcr(imageB64: string, fileName: string, page: number, signal?: AbortSignal): Promise<OcrResponse> {
  const res = await fetch("/api/exam/ocr", { method: "POST", headers: { "Content-Type": "application/json" }, signal, body: JSON.stringify({ image: imageB64, fileName, page }) });
  const d = (await res.json().catch(() => ({}))) as { text?: string; usage?: { input: number; output: number }; message?: string; missing?: string[] };
  const miss = d.missing?.length ? ` 필요한 서버 설정: ${d.missing.join(", ")}` : "";
  return { status: res.status, text: d.text, usage: d.usage, message: res.ok ? undefined : `${httpFailureText(res.status, d.message)}${miss}` };
}
