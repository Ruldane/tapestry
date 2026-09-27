/// <reference lib="webworker" />
/**
 * Ashcombe lives here, off the main thread.
 *
 * A fixed-step loop advances the village in step with the real clock (or
 * stopped, or hastened a little, never more than an hour ahead of the real
 * day). Each step posts one frame of packed positions in transferred
 * buffers. The village is saved to IndexedDB every twenty seconds and when
 * the page is hidden; on return the absence is modelled coarsely.
 */
import { HOUR_MS, placeFromTimeZone } from "../sim/calendar";
import { biography, nowSummary, parishRoll } from "../sim/census";
import { catchUp } from "../sim/catchup";
import { CHILD_AGE, STEP_MS } from "../sim/constants";
import { millPower } from "../sim/economy";
import { foundVillage } from "../sim/founding";
import { die } from "../sim/life";
import { moonPhase } from "../sim/calendar";
import { deserialize, serialize } from "../sim/persist";
import { settle, step, type Village } from "../sim/sim";
import { quarrel } from "../sim/social";
import { arrive, depart, gaze } from "../sim/stranger";
import { inscriptionsTick } from "../sim/inscriptions";
import { Act, Kin, PILGRIM, type Settings } from "../sim/types";
import {
  ENT_F,
  ENT_U,
  Kind,
  packState,
  type Env,
  type FromWorker,
  type InitParams,
  type RosterEntry,
  type SceneState,
  type ToWorker,
  type WeaveEdge,
} from "./protocol";
import { clearSnapshot, loadSnapshot, saveSnapshot } from "./store";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let vil: Village | null = null;
let params: InitParams | null = null;
let settings: Settings | null = null;
let speed = 1;
let hidden = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastReal = 0;
let acc = 0;
let lastSave = 0;
let lastRoster = 0;
let rosterSig = "";
let lastScene = 0;
let sceneSig = "";
let sceneVersion = 0;
let lastBio = 0;
let lastRoll = 0;
let lastPerf = 0;
let stepMsSum = 0;
let stepCount = 0;
let inspectId: number | null = null;
let rollOn = false;
let weaveOn = false;
let lastWeave = 0;
let saving = false;
let lastAbsence: number | null = null;

const LOOP_MS = 50;
/** Hastening may run the village this far ahead of the real day. */
const MAX_AHEAD = HOUR_MS;

const post = (msg: FromWorker, transfer: Transferable[] = []) => ctx.postMessage(msg, transfer);
const realNow = () => Date.now() + (params?.clockOffset ?? 0);

// ---------------------------------------------------------------------------
// Buffer pool: the page hands spent frame buffers back.
// ---------------------------------------------------------------------------

const pool: ArrayBuffer[] = [];
function take(bytes: number): ArrayBuffer {
  for (let i = 0; i < pool.length; i++) if (pool[i].byteLength >= bytes) return pool.splice(i, 1)[0];
  return new ArrayBuffer(Math.ceil((bytes * 1.3) / 64) * 64 + 64);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

async function init(p: InitParams): Promise<void> {
  params = p;
  speed = p.speed;
  const place = placeFromTimeZone(p.timeZone, p.offsetMinutes);
  settings = { place, weather: p.weather, sky: p.sky };
  const now = realNow();
  let resetReason: "schema" | "corrupt" | null = null;
  let absence: ReturnType<typeof catchUp> | null = null;
  let founded = false;

  if (p.fresh) await clearSnapshot();
  const snap = p.persist && !p.fresh ? await loadSnapshot() : null;
  if (snap) {
    const r = deserialize(snap, settings);
    if (r.ok) vil = r.vil;
    else {
      resetReason = r.reason;
      await clearSnapshot();
    }
  }
  if (!vil) {
    const seed = p.seed ?? (Math.random() * 0xffffffff) >>> 0;
    vil = foundVillage({ seed, now, settings });
    settle(vil);
    founded = true;
  } else {
    const gap = now - vil.s.now;
    if (gap > 30 * 60_000) {
      absence = catchUp(vil, gap);
      lastAbsence = absence.id;
    } else if (gap > 0) {
      runSteps(Math.round(gap / STEP_MS));
    }
  }
  vil.s.now = Math.max(vil.s.now, now);
  // For demonstration: ask for a spate and the river is already high.
  if (p.weather === "spate") vil.s.river.level = Math.max(vil.s.river.level, 0.8);
  vil.refreshEnv();
  vil.events = [];
  arrive(vil, p.startX);
  inscriptionsTick(vil);
  if (absence) {
    // Over the stranger's head, what happened while they were away.
    const slot = vil.s.inscriptions.findIndex((i) => i.slot === slotFor(vil!.s.stranger.x));
    const ins = { slot: slotFor(vil.s.stranger.x), la: absence.la, en: absence.en, t: vil.s.now, weight: 20, key: `away:${absence.id}` };
    if (slot >= 0) vil.s.inscriptions[slot] = ins;
    else vil.s.inscriptions.push(ins);
  }

  post({
    type: "ready",
    seed: vil.s.seed,
    foundedAt: vil.s.foundedAt,
    founded,
    resetReason,
    absence,
    visits: vil.s.visits.slice(),
    absences: vil.s.absences.slice(),
    now: vil.s.now,
  });
  postRoster(true);
  postScene(true);
  postFrame();
  drainEvents();
  if (p.persist) void save();
  start();
}

function slotFor(x: number): number {
  const slots = [
    [138, 236],
    [242, 398],
    [404, 560],
    [566, 770],
    [776, 940],
    [946, 1108],
    [1114, 1306],
    [1312, 1504],
  ];
  const i = slots.findIndex(([a, b]) => x >= a - 3 && x <= b + 3);
  return i >= 0 ? i : 0;
}

function runSteps(n: number): void {
  if (!vil) return;
  const capped = Math.min(n, 8000);
  const wasLive = vil.live;
  for (let i = 0; i < capped; i++) step(vil);
  vil.live = wasLive;
}

function start(): void {
  stop();
  lastReal = performance.now();
  acc = 0;
  timer = setTimeout(loop, LOOP_MS);
}

function stop(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}

function effectiveSpeed(): number {
  if (!vil || speed <= 0) return 0;
  const ahead = vil.s.now - realNow();
  if (speed > 1) return ahead > MAX_AHEAD ? 1 : speed;
  // At ordinary pace: drift back to the real day if hastened, hurry if behind.
  if (ahead > 2000) return 0.5;
  if (ahead < -4000) return 4;
  return 1;
}

function loop(): void {
  timer = null;
  if (!vil || hidden) return;
  const now = performance.now();
  const elapsed = Math.min(250, now - lastReal);
  lastReal = now;

  // Far behind (a long pause): model it coarsely rather than hurry for ages.
  if (speed > 0 && realNow() - vil.s.now > 30 * 60_000) {
    catchUp(vil, realNow() - vil.s.now);
    postRoster(true);
    postScene(true);
  }

  const eff = effectiveSpeed();
  let steps = 0;
  if (eff > 0) {
    acc += elapsed * eff;
    const maxSteps = Math.max(2, Math.ceil(eff * 3));
    const t0 = performance.now();
    while (acc >= STEP_MS && steps < maxSteps) {
      step(vil);
      acc -= STEP_MS;
      steps++;
    }
    if (acc > STEP_MS * 4) acc = STEP_MS * 4;
    if (steps) {
      stepMsSum += performance.now() - t0;
      stepCount += steps;
    }
  }
  if (steps > 0) postFrame();
  drainEvents();
  if (now - lastRoster > 4000) postRoster(false);
  if (now - lastScene > 900) postScene(false);
  if (inspectId !== null && now - lastBio > 700) postBio();
  if (rollOn && now - lastRoll > 3000) postRoll();
  if (weaveOn && now - lastWeave > 2500) postWeave();
  if (now - lastPerf > 2000 && stepCount) {
    post({ type: "perf", msPerStep: stepMsSum / stepCount, population: vil.living().length, animals: vil.s.animals.filter((a) => a.alive).length });
    stepMsSum = 0;
    stepCount = 0;
    lastPerf = now;
  }
  if (params?.persist && now - lastSave > 20_000) void save();
  timer = setTimeout(loop, Math.max(4, LOOP_MS - (performance.now() - now)));
}

async function save(): Promise<void> {
  if (!vil || saving || !params?.persist) return;
  saving = true;
  lastSave = performance.now();
  const last = vil.s.visits[vil.s.visits.length - 1];
  if (last) last.seconds = Math.round((vil.s.now - last.at) / 1000);
  const ok = await saveSnapshot(serialize(vil));
  saving = false;
  if (ok) post({ type: "saved", at: realNow() });
}

// ---------------------------------------------------------------------------
// Outgoing
// ---------------------------------------------------------------------------

function drainEvents(): void {
  if (!vil || !vil.events.length) return;
  const events = vil.events;
  vil.events = [];
  post({ type: "events", events });
}

function envOf(v: Village): Env {
  const e = v.env;
  return {
    hour: e.hour,
    daylight: e.daylight,
    rain: e.rain,
    snow: e.snowCover,
    storm: e.storm,
    fm: e.fm,
    month: e.lt.month,
    night: e.night,
    moon: moonPhase(v.s.now),
    comet: e.sky.comet,
    cometPhase: e.sky.cometPhase,
    meteors: e.sky.meteors !== null,
    skyShow: e.skyShow,
    river: v.s.river.level,
    millPower: millPower(v.s.river.level),
    bell: e.bell,
    holy: e.holy,
    speed,
    ahead: v.s.now - realNow(),
  };
}

const ANIMAL_KIND = { sheep: Kind.sheep, goose: Kind.goose, ox: Kind.ox, dog: Kind.dog, pig: Kind.pig } as const;

function postFrame(): void {
  if (!vil) return;
  const s = vil.s;
  const people = vil.living();
  const beasts = s.animals.filter((a) => a.alive);
  const n = people.length + beasts.length;
  const fBuf = take(n * ENT_F * 4);
  const uBuf = take(n * ENT_U * 4);
  const f = new Float32Array(fBuf, 0, n * ENT_F);
  const u = new Uint32Array(uBuf, 0, n * ENT_U);
  let k = 0;
  for (const v of people) {
    f[k * 2] = v.x;
    f[k * 2 + 1] = v.y;
    u[k * 2] = v.id;
    u[k * 2 + 1] = packState({
      act: v.act,
      work: v.work,
      carry: v.carry,
      facing: v.facing,
      inside: v.inside,
      sick: v.sick > 0.3,
      kind: Kind.villager,
      young: false,
      alarm: false,
      anim: 0,
      loose: false,
      selected: v.id === inspectId,
    });
    k++;
  }
  for (const a of beasts) {
    f[k * 2] = a.x;
    f[k * 2 + 1] = a.y;
    u[k * 2] = a.id;
    u[k * 2 + 1] = packState({
      act: 0,
      work: 0,
      carry: 0,
      facing: a.facing,
      inside: false,
      sick: a.sick > 0.3,
      kind: ANIMAL_KIND[a.kind],
      young: a.young,
      alarm: a.alarmUntil > s.now,
      anim: a.state,
      loose: a.loose,
      selected: false,
    });
    k++;
  }
  const st = s.stranger;
  post(
    {
      type: "frame",
      tick: s.tick,
      now: s.now,
      n,
      f: fBuf,
      u: uBuf,
      env: envOf(vil),
      stranger: { present: st.present, x: st.x, y: st.y, facing: st.facing, stitchedAt: st.stitchedAt, arrivedAt: st.arrivedAt, still: s.now - st.stillSince },
    },
    [fBuf, uBuf],
  );
}

function postRoster(force: boolean): void {
  if (!vil) return;
  lastRoster = performance.now();
  const v0 = vil;
  const roster: RosterEntry[] = v0.living().map((v) => {
    const age = v0.age(v);
    const ageClass = age < 2.5 ? 0 : age < CHILD_AGE ? 1 : age < 17 ? 2 : age < 58 ? 3 : 4;
    const height = age < 2.5 ? 4.5 : age < 17 ? 5.8 + Math.min(age, 17) * 0.36 : age < 58 ? (v.sex ? 11.8 : 12.6) : v.sex ? 11.2 : 11.8;
    return {
      id: v.id,
      name: v0.fullName(v),
      sex: v.sex,
      ageClass,
      trade: v.trade,
      tunic: v.looks.tunic,
      hood: v.looks.hood,
      hose: v.looks.hose,
      hair: age >= 58 ? 10 : v.looks.hair,
      height: Math.round(height * 10) / 10,
      mourning: v.mourningUntil > v0.s.now,
      pregnant: v.pregnantUntil > v0.s.now && v.pregnantUntil - v0.s.now < 0.5 * 4 * 86_400_000,
    };
  });
  const sig = JSON.stringify(roster);
  if (!force && sig === rosterSig) return;
  rosterSig = sig;
  post({ type: "roster", roster });
}

function postScene(force: boolean): void {
  if (!vil) return;
  lastScene = performance.now();
  const s = vil.s;
  const scene: Omit<SceneState, "version"> = {
    strips: s.strips.map((x) => x.state),
    stripFlood: s.strips.map((x) => Math.round(x.flood * 10) / 10),
    meadow: { mown: Math.floor(s.meadow.mown * 6) / 6, stacked: Math.floor(s.meadow.stacked * 6) / 6, carted: Math.floor(s.meadow.carted * 6) / 6 },
    graves: s.graves.slice(),
    built: s.built.slice(),
    building: s.builds.find((b) => b.building.startsWith("plot"))?.building ?? null,
    bridge: s.river.bridge,
    inscriptions: s.inscriptions.slice(),
    chronicle: s.chronicle.filter((c) => c.slot >= 0),
    lastAbsence,
    snow: vil.env.snowCover,
    fm: vil.env.fm,
    flock: s.animals.filter((a) => a.alive && a.kind === "sheep").length,
    cropYear: vil.env.cropYear,
  };
  const sig = JSON.stringify(scene);
  if (!force && sig === sceneSig) return;
  sceneSig = sig;
  post({ type: "scene", scene: { ...scene, version: ++sceneVersion } });
}

function postBio(): void {
  if (!vil || inspectId === null) return;
  lastBio = performance.now();
  post({ type: "bio", bio: biography(vil, inspectId) });
}

/** The threads on the back of the cloth: ties between lives, and who told whom about the stranger. */
function postWeave(): void {
  if (!vil) return;
  lastWeave = performance.now();
  const v0 = vil;
  const edges: WeaveEdge[] = [];
  const seen = new Set<string>();
  for (const v of v0.living()) {
    for (const k in v.ties) {
      const o = Number(k);
      const t = v.ties[k];
      if (o === PILGRIM) {
        if (t.m > 0) edges.push({ a: v.id, b: PILGRIM, kind: "gossip", w: Math.min(1, t.m / 5) });
        continue;
      }
      const key = v.id < o ? `${v.id}-${o}` : `${o}-${v.id}`;
      if (seen.has(key)) continue;
      const other = v0.get(o);
      if (!other || !other.alive) continue;
      const back = other.ties[v.id];
      const g = Math.max(t.g, back?.g ?? 0);
      const a = Math.min(t.a, back?.a ?? t.a);
      let kind: WeaveEdge["kind"] | null = null;
      let w = 0;
      if (t.k === Kin.Spouse) {
        kind = "spouse";
        w = Math.max(0.2, a);
      } else if (g > 0.3) {
        kind = "grudge";
        w = g;
      } else if (v.courting === o || v.betrothed === o) {
        kind = "love";
        w = 0.8;
      } else if (t.k === Kin.Parent || t.k === Kin.Child || t.k === Kin.Sibling) {
        kind = "kin";
        w = Math.max(0.2, a);
      } else if (a > 0.45) {
        kind = "friend";
        w = a;
      }
      if (!kind) continue;
      seen.add(key);
      edges.push({ a: v.id, b: o, kind, w });
    }
  }
  // How word of the stranger went round: each hearer tied to their teller.
  const r = v0.s.rumours.find((x) => x.kind === "stranger");
  if (r) {
    for (const v of v0.living()) {
      const h = v.rumours[r.id];
      if (h && h.from !== v.id && v0.get(h.from)?.alive) edges.push({ a: h.from, b: v.id, kind: "gossip", w: 0.5 });
    }
  }
  post({ type: "weave", edges });
}

function postRoll(): void {
  if (!vil) return;
  lastRoll = performance.now();
  post({ type: "roll", roll: parishRoll(vil) });
}

// ---------------------------------------------------------------------------
// Visibility: pause when hidden, catch up on return
// ---------------------------------------------------------------------------

function onHidden(): void {
  hidden = true;
  stop();
  if (vil) depart(vil);
  void save();
}

function onVisible(): void {
  if (!vil) return;
  hidden = false;
  const gap = realNow() - vil.s.now;
  if (speed > 0 && gap > 1000) {
    if (gap > 30 * 60_000) {
      const report = catchUp(vil, gap);
      lastAbsence = report.id;
      post({ type: "returned", report });
    } else runSteps(Math.round(gap / STEP_MS));
  }
  vil.s.now = Math.max(vil.s.now, realNow() - (speed > 0 ? 0 : gap));
  arrive(vil, null);
  vil.refreshEnv();
  postRoster(true);
  postScene(true);
  postFrame();
  start();
}

// ---------------------------------------------------------------------------
// For tests and demonstration
// ---------------------------------------------------------------------------

function force(what: string): void {
  if (!vil) return;
  const v0 = vil;
  const s = v0.s;
  const L = v0.living();
  const nearStranger = [...L].sort((a, b) => Math.abs(a.x - s.stranger.x) - Math.abs(b.x - s.stranger.x));
  switch (what) {
    case "spate":
      if (settings) settings.weather = "spate";
      s.river.level = Math.max(s.river.level, 0.9);
      break;
    case "comet":
      if (settings) settings.sky = "comet";
      break;
    case "death": {
      const old = [...L].sort((a, b) => v0.age(b) - v0.age(a))[0];
      if (old) die(v0, old, "old age");
      break;
    }
    case "birth": {
      const m = L.find((v) => v.sex === 1 && v.spouse >= 0 && v0.age(v) > 18 && v0.age(v) < 40);
      if (m) m.pregnantUntil = s.now;
      break;
    }
    case "quarrel": {
      const a = nearStranger.find((v) => v0.age(v) > 16 && !v.inside && v.act !== Act.Sleep);
      const b = a && nearStranger.find((v) => v.id !== a.id && v0.age(v) > 16 && !v.inside && v.act !== Act.Sleep);
      if (a && b) {
        b.x = a.x + 3;
        b.y = a.y;
        const t = v0.tie(a, b.id);
        t.g = Math.max(t.g, 0.5);
        t.gc = t.gc ?? "a hen that went missing";
        quarrel(v0, a, b);
      }
      break;
    }
    case "sick": {
      const v = nearStranger.find((x) => v0.age(x) > 20 && x.sick === 0);
      if (v) v.sick = 0.6;
      break;
    }
    case "goose": {
      const g = s.animals.find((a) => a.alive && a.kind === "goose");
      if (g) {
        g.loose = true;
        g.tx = s.stranger.x + 10;
        g.ty = 80;
        g.until = s.now + 120_000;
      }
      break;
    }
  }
  drainEvents();
  postScene(true);
}

// ---------------------------------------------------------------------------
// Incoming
// ---------------------------------------------------------------------------

ctx.onmessage = (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  try {
    switch (m.type) {
      case "init":
        void init(m.params);
        break;
      case "buffers":
        for (const b of m.buffers) if (b && b.byteLength && pool.length < 24) pool.push(b);
        break;
      case "speed":
        speed = m.speed;
        postFrame();
        break;
      case "visibility":
        if (m.hidden) onHidden();
        else if (hidden) onVisible();
        break;
      case "gaze":
        if (vil) gaze(vil, m.x);
        break;
      case "inspect":
        inspectId = m.id;
        postBio();
        break;
      case "roll":
        rollOn = m.on;
        if (m.on) postRoll();
        break;
      case "weave":
        weaveOn = m.on;
        if (m.on) postWeave();
        break;
      case "summary":
        if (vil) post({ type: "summary", lines: nowSummary(vil) });
        break;
      case "save":
        void save();
        break;
      case "reset":
        stop();
        void (async () => {
          await clearSnapshot();
          vil = null;
          lastAbsence = null;
          if (params) await init({ ...params, fresh: true, seed: null, startX: null });
        })();
        break;
      case "force":
        force(m.what);
        break;
    }
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
