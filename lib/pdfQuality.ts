// pdf.js 추출 결과의 자동 품질 점검. 원본과의 일치(정확도)를 판정하지 않으며,
// 명백한 추출 이상 징후만 찾는다. 표·다단의 읽기 순서 오류와 이미지 속 글자는 검출할 수 없다.
export type Quality = "usable" | "review" | "failed" | "empty";

export const QUALITY_LABEL: Record<Quality, string> = { usable: "사용 가능", review: "확인 권장", failed: "처리 실패", empty: "텍스트 없음" };

const SHORT_LEN = 15; // 이보다 짧은 페이지는 길이만으로 경고하지 않고 다른 이상 징후를 함께 본다

export function assessPage(text: string, status: "ok" | "empty" | "failed", error?: string): { quality: Quality; notes: string[] } {
  if (status === "failed") return { quality: "failed", notes: [error ?? "텍스트 추출에 실패했습니다."] };
  const compact = text.replace(/\s/g, "");
  if (status === "empty" || compact.length === 0) {
    return { quality: "empty", notes: ["추출할 텍스트가 없습니다. 스캔 PDF라면 AI 이미지 인식으로 처리할 수 있습니다."] };
  }

  const notes: string[] = [];
  const total = text.length;
  const count = (re: RegExp) => (text.match(re) ?? []).length;

  const repl = count(/�/g);
  if (repl > 0) notes.push(`깨진 글자(�) ${repl}개가 있습니다.`);

  const ctrl = count(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g);
  if (ctrl / total > 0.01) notes.push("제어문자가 많이 섞여 있습니다.");

  // 사설 영역 문자: 폰트 매핑 실패로 글자가 깨질 때 자주 나타난다.
  const pua = count(/[-]/g);
  if (pua / compact.length > 0.05) notes.push("폰트 매핑 문제로 보이는 특수 문자가 많습니다.");

  const spaces = count(/[ \t]/g);
  if (total > 40 && spaces / total > 0.6) notes.push("공백 비율이 매우 높습니다.");

  // 같은 글자가 비정상적으로 길게 반복(점선·밑줄·구분선 문자는 제외)
  const run = text.match(/([^\s.\-_=*~·…─━—•])\1{19,}/);
  if (run) notes.push("같은 글자가 비정상적으로 반복됩니다.");

  if (compact.length < SHORT_LEN) {
    // 짧은 페이지(표지·구분 슬라이드 등)는 길이만으로 경고하지 않는다. 문자 없이 기호 위주일 때만 의심한다.
    const letters = count(/[\p{L}\p{N}]/gu);
    if (letters / compact.length < 0.5) notes.push("글자가 거의 없고 기호 위주입니다.");
    else if (notes.length === 0) return { quality: "usable", notes: ["글자가 적은 페이지입니다. 표지나 그림 중심 페이지일 수 있습니다."] };
  }

  return { quality: notes.length ? "review" : "usable", notes };
}

// 기존 저장 데이터(품질 필드 없음)는 읽을 때 계산해 보강한다. 저장소 내용은 바꾸지 않는다.
export function ensureQuality<T extends { status: "ok" | "empty" | "failed"; error?: string; original: string; quality?: Quality; qualityNotes?: string[] }>(p: T): T & { quality: Quality; qualityNotes: string[] } {
  if (p.quality) return p as T & { quality: Quality; qualityNotes: string[] };
  const a = assessPage(p.original, p.status, p.error);
  return { ...p, quality: a.quality, qualityNotes: a.notes };
}
