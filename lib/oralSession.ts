// AI 구술시험 세션 컨트롤러. 전송 계층(Transport)을 주입받아 상태 전환·답변 횟수 규칙을 담당한다.
// 횟수는 '정상 처리된 평가 결과를 받은 순간'에만 차감하므로 연결 오류·서버 오류·마이크 오류·음성 미전송은 차감되지 않는다.
import { applyEvaluation, canAnswer, reconcileEvaluation, EVAL_TOOL, evalInstructions, feedbackSpeech, hideAnswer, initQ, parseEvaluation, questionInstructions, remaining, revealAnswer, SESSION_INSTRUCTIONS, skipQ, speakInstructions, speakKoInstructions, type Evaluation, type OralQ, type QState } from "./oral";

export interface Transport {
  connect(): Promise<void>;
  send(ev: object): void;
  onMessage(cb: (raw: string) => void): void;
  onClose(cb: (info: { code: number; reason: string }) => void): void;
  startMic(onChunk: (b64: string) => void): Promise<void>; // 권한 거부 등은 예외
  stopMic(): void;
  playAudio(b64: string): void;
  drained(): Promise<void>; // 대기 중인 음성 재생이 끝나면 resolve
  stopAudio(): void;
  close(): void;
}

export type Phase = "connecting" | "asking" | "ready" | "recording" | "evaluating" | "feedback" | "finished" | "error";
export type OralState = { micPending?: boolean; phase: Phase; index: number; qs: QState[]; notice: string | null; error: string | null; last: Evaluation | null };

export type ServerEvent =
  | { kind: "created" | "updated" | "other" }
  | { kind: "audio"; delta: string }
  | { kind: "done"; status: string; calls: { name: string; args: string; id: string }[] }
  | { kind: "error"; message: string };

// OpenAI Realtime 이벤트(베타/GA 이름 모두)를 정규화한다.
export function parseServerEvent(raw: string): ServerEvent {
  let e: Record<string, unknown>;
  try {
    e = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { kind: "other" };
  }
  switch (e.type) {
    case "session.created":
      return { kind: "created" };
    case "session.updated":
      return { kind: "updated" };
    case "response.output_audio.delta":
    case "response.audio.delta":
      return typeof e.delta === "string" ? { kind: "audio", delta: e.delta } : { kind: "other" };
    case "response.done": {
      const r = (e.response ?? {}) as { status?: string; output?: Record<string, unknown>[] };
      const calls = (r.output ?? [])
        .filter((o) => o.type === "function_call" && typeof o.name === "string")
        .map((o) => ({ name: o.name as string, args: typeof o.arguments === "string" ? o.arguments : "", id: typeof o.call_id === "string" ? o.call_id : "" }));
      return { kind: "done", status: r.status ?? "completed", calls };
    }
    case "error": {
      const m = (e.error as { message?: string } | undefined)?.message;
      return { kind: "error", message: m ?? "서버 오류" };
    }
    default:
      return { kind: "other" };
  }
}

const MIN_AUDIO_BYTES = 24000 * 2 * 0.4; // 24kHz PCM16 기준 약 0.4초 미만은 음성이 전송되지 않은 것으로 본다

export function closeMessage(code: number, reason: string): string {
  if (code === 4402) return "FactChat 크레딧이 부족해 연결이 종료되었어요.";
  if (code === 1008) return "음성 세션 인증 또는 모델 설정 오류로 연결이 거부되었어요(토큰은 60초 1회용이에요).";
  if (code === 1013) return "서버가 바빠요. 잠시 후 다시 연결해 주세요.";
  if (code === 1000 && /cap/i.test(reason)) return "세션 최대 시간에 도달해 종료되었어요.";
  return "음성 연결이 끊겼어요. 답변 횟수는 차감되지 않았어요.";
}

// 시험 시간: 학생이 실제로 답변할 수 있는 동안에만 흐른다. now를 주입받아 테스트할 수 있다.
export class ExamClock {
  private remaining: number;
  private since: number | null = null;
  constructor(limitMs: number, private now: () => number = Date.now) {
    this.remaining = limitMs;
  }
  start() {
    if (this.since === null) this.since = this.now(); // 이미 실행 중이면 무시(중복 차감 방지)
  }
  pause() {
    if (this.since !== null) {
      this.remaining = Math.max(0, this.remaining - (this.now() - this.since));
      this.since = null;
    }
  }
  get running() {
    return this.since !== null;
  }
  leftMs() {
    return this.since === null ? this.remaining : Math.max(0, this.remaining - (this.now() - this.since));
  }
  get expired() {
    return this.leftMs() <= 0;
  }
}

export type ClockOpts = { limitSec?: number; now?: () => number; setTimer?: (fn: () => void, ms: number) => unknown; clearTimer?: (h: unknown) => void };

export class OralSession {
  state: OralState;
  private expecting: "question" | "eval" | "feedback" | null = null;
  private pendingCall: { id: string } | null = null;
  private sentBytes = 0;
  private micTok = 0; // 마이크 시작 대기 중 중단·이동·종료되면 결과를 버리기 위한 토큰
  private closedByUs = false;
  private ready: { resolve: () => void; reject: (e: Error) => void } | null = null;
  private turn = 0; // 중단·이동 시 이전 응답을 무시하기 위한 토큰
  private clock: ExamClock | null = null;
  private setTimer: (fn: () => void, ms: number) => unknown;
  private clearTimer: (h: unknown) => void;
  private expiryTimer: unknown = null; // 항상 하나만 유지(중복 생성 방지)
  private expiryHandled = false;
  private finishAfterFeedback = false;

  constructor(
    private qsrc: OralQ[],
    private t: Transport,
    private onChange: (s: OralState) => void = () => {},
    opts: ClockOpts = {},
  ) {
    if (opts.limitSec) this.clock = new ExamClock(opts.limitSec * 1000, opts.now);
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.state = { phase: "connecting", index: 0, qs: qsrc.map(initQ), notice: null, error: null, last: null };
    this.bind();
  }

  private set(p: Partial<OralState>) {
    this.state = { ...this.state, ...p };
    this.syncClock();
    this.onChange(this.state);
  }

  // 시간이 흐르는 상태: 답변 대기(마이크 준비 중 제외, 문제가 끝나지 않음)와 녹음 중뿐이다.
  // 질문 재생·마이크 준비·평가·피드백·모범답안 확인·문제 전환·연결 오류·종료에서는 멈춘다.
  private activeTime() {
    const st = this.state;
    if (st.phase === "recording") return true;
    return st.phase === "ready" && !st.micPending && !st.error && !this.state.qs[st.index].done;
  }

  get timer() {
    return { leftSec: this.clock ? Math.ceil(this.clock.leftMs() / 1000) : null, running: !!this.clock?.running, expired: !!this.clock?.expired };
  }

  private syncClock() {
    const c = this.clock;
    if (!c) return;
    if (this.expiryTimer !== null) {
      this.clearTimer(this.expiryTimer);
      this.expiryTimer = null;
    }
    if (this.state.phase === "finished" || !this.activeTime()) return c.pause();
    c.start();
    if (c.expired) return this.onExpire();
    this.expiryTimer = this.setTimer(() => {
      this.expiryTimer = null;
      this.syncClock(); // 남은 시간을 다시 계산해 만료를 처리한다
    }, c.leftMs() + 20);
  }

  // 00:00 처리: 새 답변은 막는다. 녹음 중이면 이미 시작한 답변은 제출·평가·피드백까지 이어 간다.
  private onExpire() {
    if (this.expiryHandled) return;
    this.expiryHandled = true;
    if (this.state.phase === "recording") {
      this.finishAfterFeedback = true;
      this.state = { ...this.state, notice: "제한 시간이 끝났어요. 지금 하는 답변은 마저 제출할 수 있어요." };
      return;
    }
    // 답변을 기다리는 중이었다면 더 할 일이 없으므로 종료한다(이미 제출한 결과는 보존).
    queueMicrotask(() => this.finish("제한 시간이 끝나 시험을 종료했어요."));
  }

  private bind() {
    this.t.onMessage((raw) => void this.handle(raw));
    this.t.onClose((info) => {
      if (this.closedByUs || this.state.phase === "finished") return;
      this.t.stopMic();
      this.t.stopAudio();
      this.expecting = null;
      if (this.ready) {
        this.ready.reject(new Error(closeMessage(info.code, info.reason)));
        this.ready = null;
      }
      // 진행 중이던 답변은 평가 결과를 받지 못했으므로 차감하지 않는다.
      this.set({ phase: "error", error: closeMessage(info.code, info.reason) });
    });
  }

  get q() {
    return this.qsrc[this.state.index];
  }
  get qs() {
    return this.state.qs[this.state.index];
  }

  async start() {
    this.closedByUs = false;
    this.set({ phase: "connecting", error: null, notice: null });
    try {
      const handshake = new Promise<void>((resolve, reject) => {
        this.ready = { resolve, reject };
        setTimeout(() => reject(new Error("세션 준비 시간이 초과되었어요.")), 10000);
      });
      handshake.catch(() => {});
      await this.t.connect();
      await handshake;
    } catch (e) {
      this.ready = null;
      this.closedByUs = true;
      this.t.close();
      this.set({ phase: "error", error: (e as Error).message || "음성 연결에 실패했어요." });
      return;
    }
    this.ask();
  }

  private ask() {
    if (this.qs.done) return this.set({ phase: "ready" });
    this.turn++;
    this.expecting = "question";
    this.set({ phase: "asking", last: null });
    this.t.send({ type: "response.create", response: { output_modalities: ["audio"], conversation: "none", tool_choice: "none", instructions: questionInstructions(this.q) } });
  }

  private async handle(raw: string) {
    const ev = parseServerEvent(raw);
    const myTurn = this.turn;
    if (ev.kind === "created") {
      this.t.send({
        type: "session.update",
        session: { type: "realtime", output_modalities: ["audio"], instructions: SESSION_INSTRUCTIONS, tools: [EVAL_TOOL], tool_choice: "none", audio: { input: { turn_detection: null } } },
      });
      return;
    }
    if (ev.kind === "updated") {
      this.ready?.resolve();
      this.ready = null;
      return;
    }
    if (ev.kind === "audio") {
      if (this.expecting === "question" || this.expecting === "feedback") this.t.playAudio(ev.delta);
      return;
    }
    if (ev.kind === "error") {
      if (this.ready) return void (this.ready.reject(new Error(ev.message)), (this.ready = null));
      // 평가 요청 중 오류: 답변은 처리되지 않았으므로 횟수를 차감하지 않고 다시 말할 수 있게 한다.
      if (this.state.phase === "evaluating") {
        this.expecting = null;
        this.set({ phase: "ready", notice: "서버 처리에 실패했어요. 답변 횟수는 차감되지 않았어요. 다시 말해 주세요." });
      } else if (this.state.phase === "recording") {
        this.set({ notice: "서버 오류가 있었어요. 답변 횟수는 차감되지 않아요." });
      }
      return;
    }
    if (ev.kind !== "done") return;

    const exp = this.expecting;
    if (exp === "question" || exp === "feedback") {
      this.expecting = null;
      await this.t.drained();
      if (myTurn !== this.turn) return;
      if (this.finishAfterFeedback && exp === "feedback") return this.finish("제한 시간이 끝나 시험을 종료했어요. 마지막 피드백까지 들었어요.");
      if (ev.status === "failed") return this.set({ phase: "ready", notice: "음성 생성에 실패했어요. 화면의 내용을 확인해 주세요." });
      return this.set({ phase: "ready" });
    }
    if (exp !== "eval") return;
    this.expecting = null;
    if (ev.status !== "completed") return this.set({ phase: "ready", notice: "평가 처리에 실패했어요. 답변 횟수는 차감되지 않았어요. 다시 말해 주세요." });
    const call = ev.calls.find((c) => c.name === "report_evaluation");
    const parsed = call ? parseEvaluation(call.args) : null;
    const evaluation = parsed ? reconcileEvaluation(parsed, this.q) : null; // 정답 판정 안전장치
    if (!call || !evaluation) return this.set({ phase: "ready", notice: "평가 결과를 읽지 못했어요. 답변 횟수는 차감되지 않았어요. 다시 말해 주세요." });

    // 정상 처리된 평가 결과 → 이 시점에만 횟수 차감
    const idx = this.state.index;
    const next = applyEvaluation(this.state.qs[idx], evaluation);
    const qs = this.state.qs.map((x, i) => (i === idx ? next : x));
    // 재시도 기회가 남았으면 정답 정보를 숨긴 평가만 화면·음성에 사용한다(원본은 qs.attempts에 보관).
    if (this.clock?.expired) this.finishAfterFeedback = true; // 만료 뒤 제출된 답변도 피드백까지 완료한 뒤 종료
    const shown = next.done ? evaluation : hideAnswer(evaluation, this.q);
    this.set({ qs, last: shown, phase: "feedback", notice: null });
    this.t.send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: call.id, output: JSON.stringify({ ok: true }) } });
    this.expecting = "feedback";
    const text = feedbackSpeech(shown, remaining(next), next.done);
    this.t.send({ type: "response.create", response: { output_modalities: ["audio"], conversation: "none", tool_choice: "none", instructions: speakKoInstructions(text) } });
  }

  // 답변 시작(마이크 열기). 마이크 권한·오디오 활성화가 끝난 뒤에만 recording 상태로 바뀐다(그 전에는 '답변 종료'가 나타나지 않는다).
  // AI가 말하는 중·평가 중·횟수 소진·문제 종료·마이크 준비 중에는 거부한다.
  async beginAnswer(): Promise<boolean> {
    if (this.state.phase !== "ready" || this.state.micPending || !canAnswer(this.qs)) return false;
    if (this.clock?.expired) return false; // 시간이 끝나면 새 답변 시작 차단
    const tok = ++this.micTok;
    this.set({ micPending: true, notice: null }); // 동기적으로 잠가 중복 시작 방지
    this.sentBytes = 0;
    try {
      await this.t.startMic((b64) => {
        if (this.state.phase !== "recording" || tok !== this.micTok) return;
        this.sentBytes += (b64.length * 3) / 4;
        this.t.send({ type: "input_audio_buffer.append", audio: b64 });
      });
    } catch (e) {
      this.t.stopMic();
      if (tok === this.micTok) this.set({ micPending: false, phase: "ready", notice: `마이크를 사용할 수 없어요(${(e as Error).message || "권한 거부"}). 답변 횟수는 차감되지 않았어요.` });
      return false;
    }
    if (tok !== this.micTok || this.state.phase !== "ready") {
      this.t.stopMic(); // 대기 중 이동·종료됨
      return false;
    }
    this.t.send({ type: "input_audio_buffer.clear" });
    this.set({ micPending: false, phase: "recording" });
    return true;
  }

  // 답변 종료: 오디오를 확정하고 평가를 요청한다. 같은 답변은 한 번만 제출된다.
  endAnswer(): boolean {
    if (this.state.phase !== "recording") return false;
    this.t.stopMic();
    if (process.env.NODE_ENV === "development") console.debug("[oral] answer audio bytes sent", Math.round(this.sentBytes), "min", MIN_AUDIO_BYTES);
    if (this.sentBytes < MIN_AUDIO_BYTES) {
      this.t.send({ type: "input_audio_buffer.clear" });
      this.set({ phase: "ready", notice: "음성이 충분히 전송되지 않았어요. 답변 횟수는 차감되지 않았어요. 다시 말해 주세요." });
      return false;
    }
    const q = this.qs;
    if (!canAnswer(q)) return false; // 서버 처리 로직에서도 횟수 제한 적용
    this.turn++;
    this.expecting = "eval";
    this.set({ phase: "evaluating" });
    this.t.send({ type: "input_audio_buffer.commit" });
    this.t.send({
      type: "response.create",
      response: { output_modalities: ["text"], tool_choice: { type: "function", name: "report_evaluation" }, instructions: evalInstructions(this.q, q.used + 1, remaining(q) - 1) },
    });
    return true;
  }

  private interrupt() {
    this.turn++;
    this.micTok++;
    this.expecting = null;
    this.t.stopMic();
    this.t.stopAudio();
  }

  // '다음 문제': 현재 문제의 남은 기회를 종료하고 이동한다(마지막 문제면 false).
  next(): boolean {
    const i = this.state.index;
    if (i >= this.qsrc.length - 1) return false;
    this.interrupt();
    const qs = this.state.qs.map((x, k) => (k === i ? skipQ(x) : x));
    this.set({ qs, index: i + 1, notice: null, last: null });
    if (this.clock?.expired) {
      this.finish("제한 시간이 끝나 시험을 종료했어요.");
      return true;
    }
    this.ask();
    return true;
  }

  // 이전 문제로 돌아가도 사용한 횟수는 그대로 유지된다. 다시 질문하지 않는다.
  prev(): boolean {
    const i = this.state.index;
    if (i <= 0) return false;
    this.interrupt();
    this.set({ index: i - 1, phase: "ready", notice: null, last: null });
    return true;
  }

  // 문제가 끝난 뒤에만 모범답안을 중국어 음성으로 들려준다(답변 횟수와 무관, AI 호출 1회).
  playModelAnswer(): boolean {
    const q = this.q;
    if (this.state.phase !== "ready" || !this.qs.done || !q.modelAnswer) return false;
    this.turn++;
    this.expecting = "feedback";
    this.set({ phase: "feedback" });
    this.t.send({ type: "response.create", response: { output_modalities: ["audio"], conversation: "none", tool_choice: "none", instructions: speakInstructions(q.modelAnswer) } });
    return true;
  }

  // 문제를 다시 들려 달라는 요청(답변 횟수와 무관, AI 호출 1회)
  replay(): boolean {
    if (this.state.phase !== "ready") return false;
    this.ask();
    return true;
  }

  // 시험 종료: 마이크·재생·소켓을 즉시 해제한다. 끝내지 않은 문제는 그대로 남는다.
  finish(notice?: string) {
    this.closedByUs = true;
    this.interrupt();
    this.t.close();
    this.set({ phase: "finished", notice: notice ?? null }); // syncClock이 타이머를 정리하고 시계를 멈춘다
  }

  // 연결 오류 뒤 새 전송 계층으로 이어서 진행(사용한 횟수 유지)
  async reconnect(t: Transport) {
    this.t = t;
    this.bind();
    await this.start();
  }

  get revealed() {
    return revealAnswer(this.qs);
  }
}
