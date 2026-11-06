"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";
import { btnPrimary } from "./ui";
import { LoopSpeaker, RATE_NORMAL, RATE_SLOW, syllableOf, type SpeechDeps } from "@/lib/charSpeech";
import { findChineseVoice, hasSpeech, speak, stopSpeech } from "@/lib/tts";

const realDeps: SpeechDeps = {
  speak,
  stop: stopSpeech,
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

// 한자 따라 쓰기 중 발음 듣기. 브라우저 TTS(zh-CN)를 쓰며 반복은 사용자가 켰을 때만 시작한다.
// 학습 단어의 맥락(단어 전체)으로 읽는 것이 기본이다: 한 글자만 읽으면 TTS가 다른 발음을 고를 수 있다.
// 최종 쓰기 퀴즈와 정답 공개 화면에서는 이 컴포넌트를 쓰지 않는다(정답 힌트 방지).
export function CharSound({ char, wordHanzi, wordPinyin, index, total }: { char: string; wordHanzi: string; wordPinyin: string; index: number; total: number }) {
  const multi = total > 1;
  const [unit, setUnit] = useState<"word" | "char">("word");
  const [slow, setSlow] = useState(false);
  const [loop, setLoop] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [err, setErr] = useState(false);
  const [voice, setVoice] = useState<"ok" | "missing" | "unsupported">("ok");
  const ctl = useRef<LoopSpeaker | null>(null);
  const text = unit === "word" ? wordHanzi : char;
  const syl = syllableOf(wordPinyin, index, total);

  useEffect(() => {
    const c = new LoopSpeaker(realDeps, { onPlaying: setPlaying, onLoop: setLoop, onError: () => setErr(true) });
    ctl.current = c;
    let off: (() => void) | undefined;
    if (!hasSpeech()) setVoice("unsupported");
    else {
      const check = () => setVoice(findChineseVoice() ? "ok" : "missing");
      check();
      window.speechSynthesis.addEventListener("voiceschanged", check);
      off = () => window.speechSynthesis.removeEventListener("voiceschanged", check);
    }
    const onVis = () => c.setHidden(document.hidden); // 탭이 비활성화되면 멈추고 돌아오면 이어서
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      off?.();
      c.dispose(); // 한자 전환·화면 이동·언마운트 시 발화와 타이머 정리
      ctl.current = null;
    };
  }, []);

  useEffect(() => ctl.current?.setTarget(text), [text]); // 읽는 대상이 바뀌면 이전 발화 즉시 중지
  useEffect(() => ctl.current?.setRate(slow ? RATE_SLOW : RATE_NORMAL), [slow]);

  const disabled = voice === "unsupported";
  return (
    <div className="mt-3 rounded-2xl bg-sand p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button className={`${btnPrimary} !min-h-10 !px-4`} disabled={disabled} onClick={() => (setErr(false), ctl.current?.playOnce())}>
          <Icon name="play" className="mr-1 h-4 w-4" fill /> 발음 듣기
        </button>
        <button role="switch" aria-checked={loop} disabled={disabled} onClick={() => (setErr(false), loop ? ctl.current?.stopLoop() : ctl.current?.startLoop())} className={`inline-flex min-h-10 items-center gap-1.5 rounded-2xl px-4 text-sm font-semibold disabled:opacity-50 ${loop ? "bg-charcoal text-white" : "bg-white"}`}>
          <Icon name="repeat" className="h-4 w-4" /> 반복 듣기 {loop ? "끄기" : "켜기"}
        </button>
        <div className="flex rounded-full bg-white/70 p-1" role="group" aria-label="발음 속도">
          <button aria-pressed={!slow} onClick={() => setSlow(false)} className={`min-h-9 rounded-full px-3 text-xs font-semibold ${!slow ? "bg-charcoal text-white" : "text-warm"}`}>
            보통 속도
          </button>
          <button aria-pressed={slow} onClick={() => setSlow(true)} className={`min-h-9 rounded-full px-3 text-xs font-semibold ${slow ? "bg-charcoal text-white" : "text-warm"}`}>
            천천히 듣기
          </button>
        </div>
      </div>
      {multi && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="text-warm">읽는 단위</span>
          <div className="flex rounded-full bg-white/70 p-1" role="group" aria-label="읽는 단위">
            <button aria-pressed={unit === "word"} onClick={() => setUnit("word")} className={`min-h-8 rounded-full px-3 font-semibold ${unit === "word" ? "bg-charcoal text-white" : "text-warm"}`}>
              단어(권장)
            </button>
            <button aria-pressed={unit === "char"} onClick={() => setUnit("char")} className={`min-h-8 rounded-full px-3 font-semibold ${unit === "char" ? "bg-charcoal text-white" : "text-warm"}`}>
              글자만
            </button>
          </div>
        </div>
      )}
      <p role="status" aria-live="polite" className="mt-2 min-h-4 text-xs font-medium">
        {loop ? `● 반복 듣기 켜짐 — ${playing ? "재생 중" : "약 3초 간격으로 다시 들려줘요"}` : playing ? "재생 중" : ""}
      </p>
      <p className="mt-1 text-[11px] text-warm">
        기준 발음: <b lang="zh">{unit === "word" ? wordHanzi : char}</b> ({unit === "word" ? wordPinyin : syl ?? `${wordPinyin} 중 이 글자의 병음은 확인할 수 없어요`}).
        {unit === "char" && " 한 글자만 읽으면 브라우저 음성이 다른 발음을 고를 수 있어요."} 브라우저 내장 음성(TTS)이라 성조가 어색할 수 있어요.
      </p>
      {voice === "unsupported" && <p role="alert" className="mt-1 rounded-xl bg-white p-2 text-xs font-medium">이 브라우저는 음성 합성을 지원하지 않아 발음을 들을 수 없어요.</p>}
      {voice === "missing" && <p role="status" className="mt-1 rounded-xl bg-white p-2 text-xs">기기에서 중국어 음성을 찾지 못했어요. 소리가 나지 않거나 다르게 읽을 수 있어요.</p>}
      {err && (
        <p role="alert" className="mt-1 rounded-xl bg-white p-2 text-xs font-medium">
          ⚠ 음성 재생에 실패했어요. 기기 음량과 브라우저 음성 설정을 확인해 주세요.
        </p>
      )}
    </div>
  );
}
