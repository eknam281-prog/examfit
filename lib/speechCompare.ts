// 따라 말하기 평가: 음성 인식으로 얻은 중국어 문장을 목표 문장과 글자 단위로 비교한다(순수 로직).
// 이것은 '인식된 문장의 일치도'일 뿐 발음·성조 점수가 아니다. 인식 엔진이 비슷한 소리를 같은 글자로 적을 수 있어, 일치해도 발음이 정확하다는 뜻은 아니다.

// 번체 → 간체(자주 쓰는 글자). 브라우저가 번체로 돌려주는 경우를 위한 소규모 표이며 모든 글자를 포함하지는 않는다.
const T2S_PAIRS =
  "謝谢認认識识歡欢對对見见學学圖图館馆師师們们嗎吗這这個个愛爱麼么買买錢钱點点單单貴贵試试顏颜讓让說说話话請请問问煩烦號号時时間间飯饭廳厅區区鐵铁場场計计車车習习業业績绩週周電电約约預预訂订護护證证鑰钥運运樂乐讀读書书歲岁還还沒没現现邊边課课臺台灣湾馬马錯错開开關关與与為为來来過过會会長长門门親亲難难樣样裡里後后幾几兩两無无論论盡尽儘尽漸渐經经驗验興兴聽听記记憶忆觀观該该當当從从帶带備备語语寫写氣气溫温種种東东蘇苏飛飞兒儿園园國国學学體体備备專专題题義义務务員员組组議议連连環环響响應应產产價价錄录";
const T2S = new Map<string, string>();
for (let i = 0; i + 1 < T2S_PAIRS.length; i += 2) T2S.set(T2S_PAIRS[i], T2S_PAIRS[i + 1]);

const HAN = "零一二三四五六七八九";
function numToHan(n: number): string {
  if (n < 10) return HAN[n];
  if (n < 20) return "十" + (n % 10 ? HAN[n % 10] : "");
  if (n < 100) return HAN[Math.floor(n / 10)] + "十" + (n % 10 ? HAN[n % 10] : "");
  return String(n).split("").map((d) => HAN[Number(d)]).join("");
}

// 비교용 정규화: 아라비아 숫자→한자 숫자, 번체→간체, 공백·구두점·기호 제거, 소문자
export function normalizeZh(s: string): string {
  const num = s.replace(/\d+/g, (m) => numToHan(Number(m)));
  return Array.from(num.normalize("NFKC"))
    .map((c) => T2S.get(c) ?? c)
    .join("")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase();
}

export type SegKind = "match" | "missing" | "replaced" | "extra";
export type Seg = { kind: SegKind; target: string; heard: string };
export type Verdict = "exact" | "close" | "different" | "empty";
export type SpeechCompare = { verdict: Verdict; segments: Seg[]; matched: number; targetLen: number; heardLen: number; tips: string[] };

export function compareSpeech(target: string, heard: string): SpeechCompare {
  const t = Array.from(normalizeZh(target));
  const h = Array.from(normalizeZh(heard));
  if (h.length === 0) return { verdict: "empty", segments: [], matched: 0, targetLen: t.length, heardLen: 0, tips: ["인식된 문장이 없어요."] };

  // LCS로 정렬
  const dp: number[][] = Array.from({ length: t.length + 1 }, () => new Array(h.length + 1).fill(0));
  for (let i = t.length - 1; i >= 0; i--) for (let j = h.length - 1; j >= 0; j--) dp[i][j] = t[i] === h[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops: { k: "m" | "d" | "i"; c: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < t.length && j < h.length) {
    if (t[i] === h[j]) (ops.push({ k: "m", c: t[i] }), i++, j++);
    else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push({ k: "d", c: t[i++] });
    else ops.push({ k: "i", c: h[j++] });
  }
  while (i < t.length) ops.push({ k: "d", c: t[i++] });
  while (j < h.length) ops.push({ k: "i", c: h[j++] });

  // 연속된 구간으로 묶는다: 목표에만 있으면 누락, 인식에만 있으면 추가, 둘 다 있으면 다르게 인식
  const segments: Seg[] = [];
  let k = 0;
  while (k < ops.length) {
    if (ops[k].k === "m") {
      let s = "";
      while (k < ops.length && ops[k].k === "m") s += ops[k++].c;
      segments.push({ kind: "match", target: s, heard: s });
    } else {
      let d = "";
      let ins = "";
      while (k < ops.length && ops[k].k !== "m") (ops[k].k === "d" ? (d += ops[k].c) : (ins += ops[k].c), k++);
      segments.push({ kind: d && ins ? "replaced" : d ? "missing" : "extra", target: d, heard: ins });
    }
  }
  const matched = dp[0][0];
  const diff = t.length - matched + (h.length - matched);
  const verdict: Verdict = diff === 0 ? "exact" : diff <= Math.max(2, Math.floor(t.length * 0.2)) ? "close" : "different";

  const tips: string[] = [];
  for (const sg of segments) {
    if (sg.kind === "missing") tips.push(`빠진 부분: ‘${sg.target}’`);
    else if (sg.kind === "replaced") tips.push(`‘${sg.target}’ 대신 ‘${sg.heard}’(으)로 인식됐어요 — 다른 표현으로 말했거나 발음이 달랐거나 인식이 달랐을 수 있어요`);
    else if (sg.kind === "extra") tips.push(`추가로 인식된 부분: ‘${sg.heard}’`);
  }
  return { verdict, segments, matched, targetLen: t.length, heardLen: h.length, tips };
}
