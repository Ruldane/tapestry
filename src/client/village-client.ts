/**
 * The page's side of the village worker.
 *
 * Owns the worker, keeps the last two frames for interpolation, mirrors the
 * roster and the scene, returns spent buffers, and fans out events and
 * readings to subscribers. Nothing here touches React state per frame.
 */
import type { Biography, Roll } from "../sim/census";
import type { AbsenceReport } from "../sim/catchup";
import type { SimEvent } from "../sim/types";
import {
  ENT_F,
  ENT_U,
  unpackState,
  type Env,
  type ForceWhat,
  type FrameMsg,
  type FromWorker,
  type InitParams,
  type ReadyInfo,
  type RosterEntry,
  type SceneState,
  type StrangerView,
  type ToWorker,
  type WeaveEdge,
} from "../worker/protocol";

export interface Frame {
  tick: number;
  now: number;
  arrived: number;
  n: number;
  f: Float32Array;
  u: Uint32Array;
  env: Env;
  stranger: StrangerView;
  /** id -> index. */
  index: Map<number, number>;
  buffers: ArrayBuffer[];
}

type Listener<T> = (v: T) => void;

export class Channel<T> {
  private ls = new Set<Listener<T>>();
  on(l: Listener<T>): () => void {
    this.ls.add(l);
    return () => void this.ls.delete(l);
  }
  emit(v: T): void {
    for (const l of this.ls) l(v);
  }
}

export class VillageClient {
  private worker: Worker | null = null;
  prev: Frame | null = null;
  cur: Frame | null = null;
  interval = 250;
  roster = new Map<number, RosterEntry>();
  scene: SceneState | null = null;
  framesReceived = 0;
  msPerStep = 0;
  population = 0;
  private spare: ArrayBuffer[] = [];

  readonly onReady = new Channel<ReadyInfo>();
  readonly onFrame = new Channel<Frame>();
  readonly onRoster = new Channel<Map<number, RosterEntry>>();
  readonly onScene = new Channel<SceneState>();
  readonly onEvents = new Channel<SimEvent[]>();
  readonly onBio = new Channel<Biography | null>();
  readonly onRoll = new Channel<Roll>();
  readonly onWeave = new Channel<WeaveEdge[]>();
  readonly onSummary = new Channel<string[]>();
  readonly onReturned = new Channel<AbsenceReport>();
  readonly onSaved = new Channel<number>();
  readonly onError = new Channel<string>();

  start(params: InitParams): void {
    this.worker = new Worker(new URL("../worker/village.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.receive(ev.data);
    this.worker.onerror = (ev) => this.onError.emit(ev.message || "The village worker stopped.");
    this.send({ type: "init", params });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  send(msg: ToWorker, transfer: Transferable[] = []): void {
    this.worker?.postMessage(msg, transfer);
  }

  speed(s: number): void {
    this.send({ type: "speed", speed: s });
  }
  gaze(x: number): void {
    this.send({ type: "gaze", x });
  }
  inspect(id: number | null): void {
    this.send({ type: "inspect", id });
  }
  roll(on: boolean): void {
    this.send({ type: "roll", on });
  }
  weave(on: boolean): void {
    this.send({ type: "weave", on });
  }
  summary(): void {
    this.send({ type: "summary" });
  }
  visibility(hidden: boolean): void {
    this.send({ type: "visibility", hidden });
  }
  save(): void {
    this.send({ type: "save" });
  }
  reset(): void {
    this.send({ type: "reset" });
  }
  force(what: ForceWhat): void {
    this.send({ type: "force", what });
  }

  private receive(m: FromWorker): void {
    switch (m.type) {
      case "ready":
        this.onReady.emit(m);
        break;
      case "frame":
        this.takeFrame(m);
        break;
      case "roster":
        this.roster = new Map(m.roster.map((r) => [r.id, r]));
        this.onRoster.emit(this.roster);
        break;
      case "scene":
        this.scene = m.scene;
        this.onScene.emit(m.scene);
        break;
      case "events":
        this.onEvents.emit(m.events);
        break;
      case "bio":
        this.onBio.emit(m.bio);
        break;
      case "roll":
        this.onRoll.emit(m.roll);
        break;
      case "weave":
        this.onWeave.emit(m.edges);
        break;
      case "summary":
        this.onSummary.emit(m.lines);
        break;
      case "returned":
        this.onReturned.emit(m.report);
        break;
      case "saved":
        this.onSaved.emit(m.at);
        break;
      case "perf":
        this.msPerStep = m.msPerStep;
        this.population = m.population;
        break;
      case "error":
        this.onError.emit(m.message);
        break;
    }
  }

  private takeFrame(m: FrameMsg): void {
    const now = performance.now();
    const f = new Float32Array(m.f, 0, m.n * ENT_F);
    const u = new Uint32Array(m.u, 0, m.n * ENT_U);
    const index = new Map<number, number>();
    for (let i = 0; i < m.n; i++) index.set(u[i * 2], i);
    const frame: Frame = { tick: m.tick, now: m.now, arrived: now, n: m.n, f, u, env: m.env, stranger: m.stranger, index, buffers: [m.f, m.u] };
    if (this.cur) {
      if (this.prev) this.spare.push(...this.prev.buffers);
      this.prev = this.cur;
      const gap = now - this.cur.arrived;
      if (gap > 0 && gap < 1000) this.interval = this.interval * 0.85 + gap * 0.15;
    }
    this.cur = frame;
    this.framesReceived++;
    if (this.spare.length >= 6) {
      const give = this.spare;
      this.spare = [];
      this.send({ type: "buffers", buffers: give }, give);
    }
    this.onFrame.emit(frame);
  }

  /** An entity's interpolated position now (for drawing and hit tests). */
  position(id: number, t: number): { x: number; y: number; state: ReturnType<typeof unpackState> } | null {
    const cur = this.cur;
    if (!cur) return null;
    const i = cur.index.get(id);
    if (i === undefined) return null;
    const x1 = cur.f[i * 2];
    const y1 = cur.f[i * 2 + 1];
    const state = unpackState(cur.u[i * 2 + 1]);
    const prev = this.prev;
    const j = prev?.index.get(id);
    if (!prev || j === undefined) return { x: x1, y: y1, state };
    const a = Math.min(1, Math.max(0, (t - cur.arrived) / Math.max(40, this.interval)));
    const x0 = prev.f[j * 2];
    const y0 = prev.f[j * 2 + 1];
    // Big jumps (arrival indoors, a long catch-up) are not smoothed.
    if (Math.abs(x1 - x0) > 20) return { x: x1, y: y1, state };
    return { x: x0 + (x1 - x0) * a, y: y0 + (y1 - y0) * a, state };
  }
}
