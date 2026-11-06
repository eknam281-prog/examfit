// 브라우저에서 pdf.js로 PDF 텍스트를 페이지별 추출한다. OCR 없음, 서버 전송 없음.
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";

export const MAX_FILE_BYTES = 30 * 1024 * 1024; // 30MB
export const MAX_PAGES = 150;

type PdfJs = typeof import("pdfjs-dist");
let lib: Promise<PdfJs> | null = null;

export function loadPdfJs(): Promise<PdfJs> {
  if (!lib) {
    lib = import("pdfjs-dist").then((m) => {
      m.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      return m;
    });
    lib.catch(() => (lib = null));
  }
  return lib;
}

export async function openPdf(blob: Blob): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await blob.arrayBuffer());
  return pdfjs.getDocument({ data, cMapUrl: "/pdfjs/cmaps/", cMapPacked: true, standardFontDataUrl: "/pdfjs/standard_fonts/" }).promise;
}

export function describeError(e: unknown): string {
  const name = (e as { name?: string })?.name;
  const msg = (e as { message?: string })?.message ?? "";
  if (name === "PasswordException") return "비밀번호로 보호된 PDF입니다. 이번 단계에서는 지원하지 않습니다.";
  if (name === "InvalidPDFException") return "손상되었거나 올바른 PDF 형식이 아닙니다.";
  if (name === "MissingPDFException") return "PDF 파일을 찾을 수 없습니다.";
  if (/memory|allocation/i.test(msg)) return "메모리가 부족해 처리하지 못했습니다. 파일을 나눠 다시 시도해 주세요.";
  return `PDF를 읽는 중 오류가 발생했습니다.${msg ? ` (${msg})` : ""}`;
}

// 텍스트 조각을 줄 단위로 조립한다. 내용을 추가·보정하지 않고 PDF에 있는 문자만 이어 붙인다.
// 줄바꿈은 (1) y좌표 변화 (2) pdf.js의 hasEOL 표시 둘 다에서 생기므로 중복 없이 한 번만 넣고,
// 줄 간격이 글자 높이보다 훨씬 크면 문단 구분(빈 줄)으로 보존한다.
export async function extractPageText(page: PDFPageProxy): Promise<string> {
  const content = await page.getTextContent();
  let out = "";
  let lastY: number | null = null;
  let lastH = 0;
  let lastEndX = 0;
  const newline = () => {
    if (out && !out.endsWith("\n")) out += "\n";
  };
  for (const raw of content.items) {
    if (!("str" in raw)) continue;
    const it = raw as TextItem;
    if (it.str === "") {
      // 빈 조각은 줄 끝 표시만 담는다. 좌표는 다음 줄의 값이라 기준으로 쓰지 않는다.
      if (it.hasEOL) newline();
      continue;
    }
    const x = it.transform[4];
    const y = it.transform[5];
    const h = Math.abs(it.height) || Math.abs(it.transform[3]) || 10;
    if (out && lastY !== null) {
      const gap = Math.abs(y - lastY);
      if (gap > h * 0.6) {
        newline();
        // 줄 간격이 글자 높이의 약 2배를 넘으면 문단 구분
        if (gap > Math.max(h, lastH) * 2 && !out.endsWith("\n\n")) out += "\n";
      } else if (x - lastEndX > h * 0.25 && !/\s$/.test(out) && !/^\s/.test(it.str)) out += " ";
    }
    out += it.str;
    if (it.hasEOL) newline();
    if (it.str.trim() !== "") {
      lastY = y;
      lastH = h;
    }
    lastEndX = x + it.width;
  }
  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
