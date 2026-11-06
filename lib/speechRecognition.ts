"use client";
// 브라우저 Web Speech API(SpeechRecognition) 기반 중국어(zh-CN) 음성 인식. 서버·API 키를 쓰지 않는다.
// 지원: Chrome·Edge·Safari 계열(webkitSpeechRecognition). Firefox 등은 지원하지 않는다. Chrome 계열은 인식을 위해 오디오가 브라우저 제공사의 서버로 전송될 수 있다.
// AI 구술시험의 실시간 음성 세션(lib/realtime.ts, lib/oralSession.ts)과는 완전히 별개이며 그 코드를 건드리지 않는다.
import { useCallback, useEffect, useRef, useState } from "react";

type RecEvent = { results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }> & { isFinal?: boolean }> };
export interface Recognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart?: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type RecognizerCtor = new () => Recognizer;

export function getRecognizerCtor(): RecognizerCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type SrPhase = "idle" | "listening" | "unsupported";
export type SrError = "permission" | "no-speech" | "no-mic" | "network" | "failed";
export const SR_ERROR_TEXT: Record<SrError, string> = {
  permission: "마이크 사용이 허용되지 않았어요. 브라우저 주소창의 권한 설정에서 마이크를 허용해 주세요. 평가 없이 학습을 완료할 수도 있어요.",
  "no-speech": "목소리가 잘 안 들렸어요. 틀렸다는 뜻은 아니에요. 다시 말해 볼까요?",
  "no-mic": "사용할 수 있는 마이크를 찾지 못했어요. 기기 설정을 확인해 주세요.",
  network: "음성 인식 서비스에 연결하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.",
  failed: "음성 인식에 실패했어요. 틀렸다는 뜻은 아니에요. 다시 시도해 주세요.",
};
export type SrOutcome = { text: string } | { error: SrError };

// React와 무관한 컨트롤러(테스트 가능). 한 번에 한 번만 듣고(중복 녹음 방지), 끝나면 항상 리소스를 정리한다.
export class SpeechController {
  private rec: Recognizer | null = null;
  private got = "";
  private err: SrError | null = null;
  private done = false;
  constructor(
    private Ctor: RecognizerCtor | null,
    private onPhase: (p: SrPhase) => void,
    private onOutcome: (o: SrOutcome) => void,
    private lang = "zh-CN",
  ) {}

  get supported() {
    return !!this.Ctor;
  }
  get active() {
    return this.rec !== null;
  }

  start(): boolean {
    if (!this.Ctor) return false;
    if (this.rec) return false; // 이미 듣는 중이면 새로 시작하지 않는다
    const r = new this.Ctor();
    r.lang = this.lang;
    r.continuous = false;
    r.interimResults = false;
    r.maxAlternatives = 1;
    this.got = "";
    this.err = null;
    this.done = false;
    r.onresult = (e) => {
      // 최종 결과의 첫 후보만 사용한다(여러 후보 중 목표와 가장 비슷한 것을 고르면 정답 편향이 생김)
      const parts: string[] = [];
      for (let i = 0; i < e.results.length; i++) if (e.results[i][0]) parts.push(e.results[i][0].transcript);
      this.got = parts.join("").trim();
    };
    r.onerror = (e) => {
      const c = e.error;
      if (c === "aborted") return;
      this.err = c === "not-allowed" || c === "service-not-allowed" ? "permission" : c === "no-speech" ? "no-speech" : c === "audio-capture" ? "no-mic" : c === "network" ? "network" : "failed";
    };
    r.onend = () => this.finish();
    this.rec = r;
    try {
      r.start();
      this.onPhase("listening");
      return true;
    } catch {
      this.rec = null;
      this.err = "failed";
      this.finish(true);
      return false;
    }
  }

  // 녹음 종료: 지금까지 들은 내용을 확정한다.
  stop() {
    try {
      this.rec?.stop();
    } catch {
      this.finish();
    }
  }

  // 화면을 떠날 때: 결과를 버리고 마이크·인식을 즉시 해제한다.
  dispose() {
    const r = this.rec;
    this.done = true;
    this.rec = null;
    if (r) {
      r.onresult = r.onerror = r.onend = null;
      try {
        r.abort();
      } catch {
        /* 이미 끝남 */
      }
    }
  }

  private finish(force = false) {
    if (this.done && !force) return;
    this.done = true;
    const r = this.rec;
    this.rec = null;
    if (r) r.onresult = r.onerror = r.onend = null;
    this.onPhase("idle");
    if (this.got) this.onOutcome({ text: this.got });
    else this.onOutcome({ error: this.err ?? "no-speech" }); // 아무것도 인식하지 못한 것은 오답이 아니라 인식 실패
  }
}

export function useSpeechRecognition() {
  const [phase, setPhase] = useState<SrPhase>("idle");
  const [outcome, setOutcome] = useState<SrOutcome | null>(null);
  const [supported, setSupported] = useState(true);
  const ctl = useRef<SpeechController | null>(null);

  useEffect(() => {
    const c = new SpeechController(getRecognizerCtor(), setPhase, setOutcome);
    ctl.current = c;
    setSupported(c.supported);
    if (!c.supported) setPhase("unsupported");
    return () => c.dispose(); // 화면 이동·언마운트 시 정리
  }, []);

  const toggle = useCallback(() => {
    const c = ctl.current;
    if (!c || !c.supported) return;
    if (c.active) return c.stop();
    setOutcome(null);
    c.start();
  }, []);
  const reset = useCallback(() => setOutcome(null), []);
  return { phase, supported, outcome, toggle, reset, listening: phase === "listening" };
}
