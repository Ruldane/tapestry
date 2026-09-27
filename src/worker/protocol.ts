/**
 * Messages between the page and the village worker.
 *
 * Per-frame positions travel as transferred ArrayBuffers (no copying, no
 * SharedArrayBuffer, so no cross-origin isolation); the page returns spent
 * buffers for reuse. Things that change at human pace (who people are, what
 * the fields look like, the inscriptions) travel as small objects only when
 * they change.
 */
import type { SkyOverride, WeatherOverride } from "../sim/calendar";
import type { Biography, Roll } from "../sim/census";
import type { AbsenceReport } from "../sim/catchup";
import type { ChronicleEntry, Grave, Inscription, SimEvent, StripState, Trade, Visit, AbsenceNote } from "../sim/types";

export interface InitParams {
  timeZone: string;
  offsetMinutes: number;
  /** Added to Date.now() for the village clock (testing and demonstration). */
  clockOffset: number;
  seed: number | null;
  fresh: boolean;
  weather: WeatherOverride;
  sky: SkyOverride;
  speed: number;
  persist: boolean;
  /** The stranger starts here (cloth units), if the page asks. */
  startX: number | null;
}

export type ForceWhat = "spate" | "comet" | "death" | "birth" | "quarrel" | "wedding" | "goose" | "sick";

export type ToWorker =
  | { type: "init"; params: InitParams }
  | { type: "speed"; speed: number }
  | { type: "visibility"; hidden: boolean }
  | { type: "gaze"; x: number }
  | { type: "inspect"; id: number | null }
  | { type: "roll"; on: boolean }
  | { type: "weave"; on: boolean }
  | { type: "summary" }
  | { type: "buffers"; buffers: ArrayBuffer[] }
  | { type: "save" }
  | { type: "reset" }
  | { type: "force"; what: ForceWhat };

/** Kinds of drawn thing in a frame. */
export const Kind = { villager: 0, sheep: 1, goose: 2, ox: 3, dog: 4, pig: 5, stranger: 6 } as const;

/** Floats per entity: x, y. */
export const ENT_F = 2;
/** Uint32 per entity: id, packed state. */
export const ENT_U = 2;

export function packState(o: {
  act: number;
  work: number;
  carry: number;
  facing: number;
  inside: boolean;
  sick: boolean;
  kind: number;
  young: boolean;
  alarm: boolean;
  anim: number;
  loose: boolean;
  selected: boolean;
}): number {
  return (
    (o.act & 63) |
    ((o.work & 63) << 6) |
    ((o.carry & 15) << 12) |
    ((o.facing > 0 ? 1 : 0) << 16) |
    ((o.inside ? 1 : 0) << 17) |
    ((o.sick ? 1 : 0) << 18) |
    ((o.alarm ? 1 : 0) << 19) |
    ((o.kind & 7) << 20) |
    ((o.young ? 1 : 0) << 23) |
    ((o.anim & 3) << 24) |
    ((o.loose ? 1 : 0) << 26) |
    ((o.selected ? 1 : 0) << 27)
  );
}

export function unpackState(v: number) {
  return {
    act: v & 63,
    work: (v >>> 6) & 63,
    carry: (v >>> 12) & 15,
    facing: (v >>> 16) & 1 ? 1 : -1,
    inside: ((v >>> 17) & 1) === 1,
    sick: ((v >>> 18) & 1) === 1,
    alarm: ((v >>> 19) & 1) === 1,
    kind: (v >>> 20) & 7,
    young: ((v >>> 23) & 1) === 1,
    anim: (v >>> 24) & 3,
    loose: ((v >>> 26) & 1) === 1,
    selected: ((v >>> 27) & 1) === 1,
  };
}

export interface WeaveEdge {
  a: number;
  b: number;
  kind: "kin" | "spouse" | "love" | "friend" | "grudge" | "gossip";
  /** Strength 0..1. */
  w: number;
}

export interface Env {
  hour: number;
  daylight: number;
  rain: number;
  snow: boolean;
  storm: boolean;
  fm: number;
  month: number;
  night: boolean;
  moon: number;
  comet: boolean;
  cometPhase: number;
  meteors: boolean;
  skyShow: boolean;
  river: number;
  millPower: number;
  bell: number;
  holy: boolean;
  speed: number;
  /** Village clock minus real clock (ms): positive when hastened ahead. */
  ahead: number;
}

export interface StrangerView {
  present: boolean;
  x: number;
  y: number;
  facing: number;
  stitchedAt: number;
  arrivedAt: number;
  still: number;
}

export interface FrameMsg {
  type: "frame";
  tick: number;
  now: number;
  n: number;
  f: ArrayBuffer;
  u: ArrayBuffer;
  env: Env;
  stranger: StrangerView;
}

export interface RosterEntry {
  id: number;
  name: string;
  sex: 0 | 1;
  /** 0 babe, 1 child, 2 youth, 3 adult, 4 old. */
  ageClass: number;
  trade: Trade;
  tunic: number;
  hood: number;
  hose: number;
  hair: number;
  /** Height in cloth units. */
  height: number;
  mourning: boolean;
  pregnant: boolean;
}

export interface SceneState {
  version: number;
  strips: StripState[];
  stripFlood: number[];
  meadow: { mown: number; stacked: number; carted: number };
  graves: Grave[];
  built: string[];
  building: string | null;
  bridge: boolean;
  inscriptions: Inscription[];
  chronicle: ChronicleEntry[];
  /** Absences whose entries are new to this visitor. */
  lastAbsence: number | null;
  snow: boolean;
  fm: number;
  flock: number;
  cropYear: number;
}

export interface ReadyInfo {
  seed: number;
  foundedAt: number;
  founded: boolean;
  resetReason: "schema" | "corrupt" | null;
  absence: AbsenceReport | null;
  visits: Visit[];
  absences: AbsenceNote[];
  now: number;
}

export type FromWorker =
  | ({ type: "ready" } & ReadyInfo)
  | FrameMsg
  | { type: "roster"; roster: RosterEntry[] }
  | { type: "scene"; scene: SceneState }
  | { type: "events"; events: SimEvent[] }
  | { type: "bio"; bio: Biography | null }
  | { type: "roll"; roll: Roll }
  | { type: "weave"; edges: WeaveEdge[] }
  | { type: "summary"; lines: string[] }
  | { type: "saved"; at: number }
  | { type: "perf"; msPerStep: number; population: number; animals: number }
  | { type: "returned"; report: AbsenceReport }
  | { type: "error"; message: string };
