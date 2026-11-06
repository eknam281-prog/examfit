// 브라우저 전송 계층: 서버가 발급한 1회용 토큰으로 WebSocket에 연결하고, 마이크(PCM16 24kHz) 입력과 음성 재생을 담당한다.
// API 키는 이 코드에 없다(서버 라우트가 발급한 토큰만 사용). 음성 원본은 저장하지 않는다.
import type { Transport } from "./oralSession";

const RATE = 24000;

function b64FromInt16(a: Int16Array): string {
  const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function int16FromB64(b64: string): Int16Array {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Int16Array(buf.buffer, 0, Math.floor(buf.length / 2));
}

export class BrowserTransport implements Transport {
  private ws: WebSocket | null = null;
  private msgCb: (raw: string) => void = () => {};
  private closeCb: (i: { code: number; reason: string }) => void = () => {};
  private ctx: AudioContext | null = null;
  private playHead = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private mic: { stream: MediaStream; node: ScriptProcessorNode; src: MediaStreamAudioSourceNode; ctx: AudioContext } | null = null;

  constructor(private url: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let opened = false;
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => {
        opened = true;
        resolve();
      };
      ws.onmessage = (e) => this.msgCb(typeof e.data === "string" ? e.data : "");
      ws.onerror = () => {
        if (!opened) reject(new Error("음성 서버에 연결하지 못했어요. 네트워크를 확인해 주세요."));
      };
      ws.onclose = (e) => {
        if (!opened) reject(new Error("음성 서버 연결이 거부되었어요."));
        this.closeCb({ code: e.code, reason: e.reason });
      };
    });
  }

  send(ev: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(ev));
  }
  onMessage(cb: (raw: string) => void) {
    this.msgCb = cb;
  }
  onClose(cb: (i: { code: number; reason: string }) => void) {
    this.closeCb = cb;
  }

  async startMic(onChunk: (b64: string) => void) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("이 브라우저는 마이크를 지원하지 않아요");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    const ctx = new AudioContext();
    try {
      // 권한 대기 뒤에 만든 컨텍스트는 suspended일 수 있다. 활성화되지 않으면 입력 콜백이 호출되지 않는다.
      if (ctx.state === "suspended") await ctx.resume();
      if (ctx.state !== "running") throw new Error("오디오 장치를 활성화하지 못했어요");
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
      throw e;
    }
    if (process.env.NODE_ENV === "development") console.debug("[oral] mic ready", { state: ctx.state, sampleRate: ctx.sampleRate });
    const src = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    const ratio = ctx.sampleRate / RATE;
    node.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const n = Math.floor(input.length / ratio);
      const out = new Int16Array(n);
      for (let i = 0; i < n; i++) {
        const pos = i * ratio;
        const i0 = Math.floor(pos);
        const f = input[i0] + ((input[Math.min(i0 + 1, input.length - 1)] - input[i0]) * (pos - i0));
        out[i] = Math.max(-1, Math.min(1, f)) * 0x7fff;
      }
      onChunk(b64FromInt16(out));
    };
    src.connect(node);
    node.connect(ctx.destination); // ScriptProcessor는 출력에 연결해야 동작한다(출력은 무음)
    this.mic = { stream, node, src, ctx };
  }

  // 마이크 입력 해제: 트랙과 오디오 노드를 모두 정리한다.
  stopMic() {
    const m = this.mic;
    if (!m) return;
    this.mic = null;
    m.node.onaudioprocess = null;
    m.src.disconnect();
    m.node.disconnect();
    m.stream.getTracks().forEach((t) => t.stop());
    void m.ctx.close();
  }

  playAudio(b64: string) {
    if (!this.ctx) this.ctx = new AudioContext();
    const ctx = this.ctx;
    if (ctx.state === "suspended") void ctx.resume();
    const pcm = int16FromB64(b64);
    if (pcm.length === 0) return;
    const buf = ctx.createBuffer(1, pcm.length, RATE);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const at = Math.max(ctx.currentTime + 0.02, this.playHead);
    src.start(at);
    this.playHead = at + buf.duration;
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  }

  drained(): Promise<void> {
    return new Promise((resolve) => {
      const tick = () => {
        if (!this.ctx || this.ctx.currentTime >= this.playHead) resolve();
        else setTimeout(tick, 80);
      };
      tick();
    });
  }

  stopAudio() {
    this.sources.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* 이미 끝난 소스 */
      }
    });
    this.sources.clear();
    this.playHead = 0;
  }

  close() {
    this.stopMic();
    this.stopAudio();
    try {
      this.ws?.close(1000, "client end");
    } catch {
      /* 이미 닫힘 */
    }
    this.ws = null;
    void this.ctx?.close();
    this.ctx = null;
  }
}
