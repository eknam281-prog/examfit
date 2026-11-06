// 한자 따라 쓰기 중 발음 듣기·반복 듣기 컨트롤러(순수 로직, 브라우저 TTS는 주입받는다).
// 한 번에 하나의 발화만 존재하고(중첩 없음), 반복은 '발화가 끝난 뒤 간격 후 다음 발화'로만 예약한다. 대상이 바뀌거나 정지·정리되면 발화와 타이머를 모두 취소한다.
export const LOOP_INTERVAL_MS = 3000;
export const RATE_NORMAL = 1;
export const RATE_SLOW = 0.7;

export type SpeechDeps = {
  speak(text: string, rate: number, onEnd: () => void, onError: () => void): void;
  stop(): void;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(h: unknown): void;
};
export type SpeakerEvents = { onPlaying?: (playing: boolean) => void; onLoop?: (on: boolean) => void; onError?: () => void };

export class LoopSpeaker {
  private text: string | null = null;
  private rate = RATE_NORMAL;
  private loop = false;
  private paused = false; // 탭이 숨겨져 잠시 멈춘 상태(반복 설정은 유지)
  private gen = 0; // 발화 세대: 취소된 발화의 늦은 콜백을 무시한다
  private timer: unknown = null;
  private playing = false;
  private disposed = false;

  constructor(private d: SpeechDeps, private ev: SpeakerEvents = {}, private intervalMs = LOOP_INTERVAL_MS) {}

  get isLooping() {
    return this.loop;
  }
  get isPlaying() {
    return this.playing;
  }
  get hasTimer() {
    return this.timer !== null;
  }

  private cancel() {
    this.gen++;
    if (this.timer !== null) {
      this.d.clearTimer(this.timer);
      this.timer = null;
    }
    this.d.stop();
    this.setPlaying(false);
  }
  private setPlaying(p: boolean) {
    if (this.playing !== p) {
      this.playing = p;
      this.ev.onPlaying?.(p);
    }
  }

  private play() {
    if (this.disposed || !this.text) return;
    const my = ++this.gen;
    if (this.timer !== null) {
      this.d.clearTimer(this.timer);
      this.timer = null;
    }
    this.setPlaying(true);
    this.d.speak(
      this.text,
      this.rate,
      () => {
        if (my !== this.gen || this.disposed) return; // 이미 취소·교체된 발화
        this.setPlaying(false);
        if (this.loop && !this.paused) this.schedule(my);
      },
      () => {
        if (my !== this.gen || this.disposed) return;
        this.setPlaying(false);
        this.setLoop(false); // 재생 실패 시 반복도 멈춘다
        this.ev.onError?.();
      },
    );
  }

  private schedule(afterGen: number) {
    this.timer = this.d.setTimer(() => {
      this.timer = null;
      if (afterGen !== this.gen || this.disposed || !this.loop || this.paused) return;
      this.play();
    }, this.intervalMs);
  }

  private setLoop(on: boolean) {
    if (this.loop !== on) {
      this.loop = on;
      this.ev.onLoop?.(on);
    }
  }

  // 읽을 대상이 바뀌면(다른 한자·읽는 단위 변경) 이전 발화와 예약을 즉시 취소하고 반복도 끈다.
  setTarget(text: string | null) {
    if (text === this.text) return;
    this.cancel();
    this.setLoop(false);
    this.text = text;
  }

  // 속도 변경: 진행 중인 발화·예약을 취소하고, 반복 중이면 새 속도로 바로 다시 시작한다(겹치지 않음).
  setRate(r: number) {
    if (r === this.rate) return;
    this.rate = r;
    const was = this.loop && !this.paused;
    this.cancel();
    if (was) this.play();
  }

  playOnce() {
    this.cancel(); // 반복 설정은 유지하되 현재 발화만 새로 시작: 끝나면 반복이 켜져 있으면 다음 예약
    this.play();
  }

  startLoop() {
    if (!this.text) return;
    this.setLoop(true);
    this.paused = false;
    this.cancel();
    this.play();
  }

  stopLoop() {
    this.setLoop(false);
    this.cancel();
  }

  // 탭이 숨겨지면 멈추고, 다시 보이면(반복이 켜져 있던 경우) 이어서 재생한다.
  setHidden(hidden: boolean) {
    if (hidden === this.paused) return;
    this.paused = hidden;
    if (hidden) this.cancel();
    else if (this.loop) this.play();
  }

  dispose() {
    this.disposed = true;
    this.cancel();
    this.loop = false;
  }
}

// 단어 병음을 공백으로 나눈 음절 수가 한자 수와 같을 때만 해당 글자의 병음을 돌려준다(그 외에는 임의로 만들지 않는다).
export function syllableOf(wordPinyin: string, index: number, total: number): string | null {
  const parts = wordPinyin.trim().split(/\s+/);
  if (total === 1) return wordPinyin.trim() || null;
  return parts.length === total ? parts[index] ?? null : null;
}
