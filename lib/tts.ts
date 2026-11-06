"use client";
// 브라우저 내장 음성 합성(무료, 서버 호출 없음). OS/브라우저별 음질·속도 차이가 있다.
export function hasSpeech() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function findChineseVoice(): SpeechSynthesisVoice | null {
  if (!hasSpeech()) return null;
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang.toLowerCase().replace("_", "-").startsWith("zh-cn")) ?? voices.find((v) => v.lang.toLowerCase().startsWith("zh")) ?? null;
}

export function speak(text: string, rate: number, onEnd?: () => void, onError?: () => void) {
  if (!hasSpeech()) return onError?.();
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "zh-CN";
  const voice = findChineseVoice();
  if (voice) u.voice = voice;
  u.rate = rate;
  u.onend = () => onEnd?.();
  u.onerror = (e) => {
    if (e.error !== "canceled" && e.error !== "interrupted") onError?.();
  };
  synth.speak(u);
}

export function stopSpeech() {
  if (hasSpeech()) window.speechSynthesis.cancel();
}
