/**
 * The village's data model. Everything here is plain data (JSON-safe) so the
 * whole village can be saved, restored, compared in tests and posted to the
 * page. Behaviour lives in the modules that act on it.
 */
import type { Labour, WeatherOverride, SkyOverride, Place as WorldPlace } from "./calendar";
import type { SceneId } from "./geography";

export const PILGRIM = 0;

export type Trade =
  | "labourer"
  | "ploughman"
  | "miller"
  | "reeve"
  | "priest"
  | "alewife"
  | "baker"
  | "smith"
  | "shepherd"
  | "swineherd"
  | "woodward"
  | "carpenter"
  | "weaver"
  | "thatcher"
  | "lord"
  | "lady"
  | "steward"
  | "servant"
  | "goosegirl"
  | "none";

/** What someone is doing. Numbers so they pack into frames. */
export const Act = {
  Idle: 0,
  Sleep: 1,
  Rest: 2,
  Eat: 3,
  Work: 4,
  Service: 6,
  Pray: 7,
  Drink: 8,
  Chat: 9,
  Argue: 10,
  Court: 11,
  Play: 12,
  FollowStranger: 13,
  WatchStranger: 14,
  GreetStranger: 15,
  Mourn: 16,
  Funeral: 17,
  Wedding: 18,
  Sick: 19,
  Carry: 20,
  Alms: 21,
  SaveFlock: 22,
  SkyWatch: 23,
  Sermon: 24,
  Feast: 25,
  Visit: 26,
  Baptism: 27,
  ChaseGoose: 28,
  Repair: 30,
  Fetch: 31,
  Dance: 32,
  Wander: 33,
} as const;
export type Act = (typeof Act)[keyof typeof Act];

/** The kind of work, which decides the pose and the tool. */
export const Work = {
  None: 0,
  Plough: 1,
  Sow: 2,
  Harrow: 3,
  Weed: 4,
  Mow: 5,
  Rake: 6,
  Reap: 7,
  Bind: 8,
  Cart: 9,
  Thresh: 10,
  Prune: 11,
  Dig: 12,
  Shear: 13,
  Herd: 14,
  Mill: 15,
  Bake: 16,
  Brew: 17,
  Smith: 18,
  Carpenter: 19,
  Thatch: 20,
  Spin: 21,
  Weave: 22,
  Garden: 23,
  Slaughter: 24,
  Woodcut: 25,
  Oversee: 26,
  Serve: 27,
  Geese: 28,
  Glean: 29,
  Scare: 30,
  Pannage: 31,
  Preach: 32,
  Office: 33,
} as const;
export type Work = (typeof Work)[keyof typeof Work];

/** What a figure carries in its hands or on its back. */
export const Carry = {
  None: 0,
  Grain: 1,
  Flour: 2,
  Water: 3,
  Wood: 4,
  Bread: 5,
  Sheaf: 6,
  Bier: 7,
  Babe: 8,
  Ale: 9,
  Hay: 10,
} as const;
export type Carry = (typeof Carry)[keyof typeof Carry];

export const Kin = {
  None: 0,
  Parent: 1,
  Child: 2,
  Sibling: 3,
  Spouse: 4,
  Grand: 5,
  InLaw: 6,
  Cousin: 7,
} as const;
export type Kin = (typeof Kin)[keyof typeof Kin];

/** A relationship, from one villager's side. */
export interface Tie {
  /** Kinship. */
  k: Kin;
  /** Affection, -1..1. */
  a: number;
  /** Grudge, 0..1. */
  g: number;
  /** What the grudge is over, as words ("the mill toll"). */
  gc?: string;
  /** Times met and talked. */
  m: number;
  /** Last met (sim ms). */
  t: number;
}

export type HistKind =
  | "born"
  | "married"
  | "widowed"
  | "childBorn"
  | "childBuried"
  | "buried"
  | "sick"
  | "recovered"
  | "quarrel"
  | "reconciled"
  | "grudge"
  | "courting"
  | "betrothed"
  | "trade"
  | "reeve"
  | "metStranger"
  | "blamedStranger"
  | "namedForStranger"
  | "savedFlock"
  | "sawStar"
  | "alms"
  | "moved"
  | "arrived"
  | "fined"
  | "lostSheep"
  | "postponed"
  | "built";

export interface HistEntry {
  /** Sim time (ms). */
  t: number;
  k: HistKind;
  /** Other villager involved, if any. */
  o?: number;
  /** Their name at the time. */
  on?: string;
  /** Extra words. */
  d?: string;
}

export interface Traits {
  curiosity: number;
  suspicion: number;
  sociability: number;
  piety: number;
  temper: number;
  gossip: number;
}

export interface Looks {
  /** Palette indices (see loom/palette). */
  tunic: number;
  hood: number;
  hose: number;
  hair: number;
}

export interface Villager {
  id: number;
  /** Key into the name tables ("0:Walter"). */
  name: string;
  byname: string;
  sex: 0 | 1;
  /** Sim ms; age runs on the compressed life clock. */
  born: number;
  household: number;
  trade: Trade;
  alive: boolean;
  died?: number;
  cause?: string;
  spouse: number;
  parents: [number, number];
  children: number[];
  traits: Traits;
  looks: Looks;
  health: number;
  hunger: number;
  fatigue: number;
  mood: number;
  /** Illness severity 0 (well) .. 1. */
  sick: number;
  pregnantUntil: number;
  /** Mourning lasts a while after a death in the family. */
  mourningUntil: number;
  courting: number;
  betrothed: number;
  ties: Record<number, Tie>;
  /** Rumours known: rumour id -> the version held and who told them. */
  rumours: Record<number, { v: number; from: number; at: number }>;
  history: HistEntry[];

  // Where and what, right now.
  x: number;
  y: number;
  tx: number;
  ty: number;
  act: Act;
  work: Work;
  carry: Carry;
  /** Sim ms when the current activity is next reconsidered. */
  until: number;
  /** A place, strip, villager or animal the activity is about. */
  target: number;
  /** Partner in a chat, quarrel, courtship; the followed. */
  with: number;
  facing: 1 | -1;
  inside: boolean;
  /** Goes indoors on arriving. */
  enter: boolean;
  /** The priest on his way to make peace between `target` and `with`. */
  mediate: boolean;
  /** Walking speed, cloth units per second. */
  speed: number;
  /** Seconds of work put in toward the current job. */
  progress: number;
}

export type AnimalKind = "sheep" | "goose" | "ox" | "dog" | "pig";

export interface Animal {
  id: number;
  kind: AnimalKind;
  /** Owning household (-1 the manor, or the common flock). */
  owner: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  alive: boolean;
  young: boolean;
  born: number;
  sick: number;
  /** Following a person (dogs, the flock behind the shepherd, oxen with the ploughman). */
  follow: number;
  /** Barking at, or fleeing from, a person or the stranger. */
  alarmUntil: number;
  /** Loose where it should not be (a goose escaped). */
  loose: boolean;
  until: number;
  facing: 1 | -1;
  /** Grazing, walking, lying. */
  state: 0 | 1 | 2;
}

export interface Household {
  id: number;
  name: string;
  building: string;
  members: number[];
  grain: number;
  flour: number;
  meat: number;
  strips: number[];
  founded: number;
  ended?: number;
}

export type StripState =
  | "fallow"
  | "ploughed"
  | "sown"
  | "shoots"
  | "green"
  | "ripe"
  | "reaped"
  | "stubble";

export interface StripData {
  id: number;
  /** Household id, or -1 for the lord's demesne. */
  owner: number;
  state: StripState;
  /** Worker-seconds put into the current job. */
  work: number;
  /** Which crop year its state belongs to. */
  year: number;
  /** Crop damaged by flood this year (0..1). */
  flood: number;
  /** Sown late or not at all lowers the yield. */
  care: number;
}

export type RumourKind = "stranger" | "quarrel" | "courting" | "sick" | "blame" | "omen" | "theft" | "birth" | "death";

export interface Rumour {
  id: number;
  kind: RumourKind;
  subj: number[];
  /** The version that started it. */
  v: number;
  origin: number;
  at: number;
  /** How many have heard it. */
  heard: number;
}

export type ChronicleKind =
  | "incipit"
  | "birth"
  | "marriage"
  | "burial"
  | "harvest"
  | "spate"
  | "bridge"
  | "bridgeMended"
  | "comet"
  | "meteors"
  | "visit"
  | "named"
  | "cottage"
  | "reeve"
  | "slaughter"
  | "feast"
  | "lostSheep"
  | "hunger"
  | "priest";

export interface ChronicleEntry {
  id: number;
  t: number;
  kind: ChronicleKind;
  la: string;
  en: string;
  scene: SceneId;
  /** Chronicle slot it is stitched in, or -1 if it was not given one. */
  slot: number;
  /** Stitched while the visitor was away (absence id), or null. */
  away: number | null;
  actors: number[];
}

export interface Grave {
  slot: number;
  villager: number;
  name: string;
  t: number;
}

export interface Inscription {
  slot: number;
  la: string;
  en: string;
  t: number;
  /** How important what it describes is; higher displaces sooner. */
  weight: number;
  /** Unique key of the situation described, so it is not restitched needlessly. */
  key: string;
}

export interface Visit {
  at: number;
  seconds: number;
  /** Where the stranger stood when the visitor left. */
  x: number;
}

export interface AbsenceNote {
  id: number;
  at: number;
  elapsedMs: number;
  en: string;
  la: string;
}

export interface Stranger {
  present: boolean;
  x: number;
  y: number;
  tx: number;
  facing: 1 | -1;
  /** Standing still since (for sitting down after a while). */
  stillSince: number;
  /** Sim ms the figure was last stitched anew (arrival or a long jump). */
  stitchedAt: number;
  arrivedAt: number;
}

export interface MillSack {
  household: number;
  by: number;
  bushels: number;
  /** Seconds of grinding still needed. */
  left: number;
}

export interface Build {
  building: string;
  work: number;
  /** Worker-seconds needed. */
  need: number;
  /** The couple the house is for. */
  for: number[];
}

export interface FuneralPlan {
  villager: number;
  at: number;
  started: boolean;
  done: boolean;
  mourners: number[];
  /** 0 gathering at the house, 1 in procession, 2 at the grave. */
  phase: number;
  phaseAt: number;
}

export interface WeddingPlan {
  a: number;
  b: number;
  at: number;
  started: boolean;
  done: boolean;
  guests: number[];
}

export interface Settings {
  place: WorldPlace;
  weather: WeatherOverride;
  sky: SkyOverride;
}

export interface VillageState {
  schema: number;
  seed: number;
  rng: [number, number, number, number];
  /** Sim clock (ms since epoch; follows the real clock). */
  now: number;
  tick: number;
  foundedAt: number;
  nextId: number;
  nextRumour: number;
  nextEntry: number;
  villagers: Villager[];
  animals: Animal[];
  households: Household[];
  /** Expansion plots that have been built on. */
  built: string[];
  strips: StripData[];
  manorGrain: number;
  churchGrain: number;
  mill: { queue: MillSack[]; flow: number; ground: number };
  /** The hay meadow this year: how much is mown and how much stacked in cocks. */
  meadow: { year: number; mown: number; stacked: number; carted: number };
  /** Carpentry waiting to be done: the bridge, or a new house for a couple. */
  builds: Build[];
  river: { level: number; bridge: boolean; lostAt: number; repair: number };
  rumours: Rumour[];
  chronicle: ChronicleEntry[];
  graves: Grave[];
  inscriptions: Inscription[];
  funerals: FuneralPlan[];
  weddings: WeddingPlan[];
  baptisms: { baby: number; at: number; done: boolean }[];
  /** When a new priest will arrive, after the old one dies. */
  priestDue: number;
  stranger: Stranger;
  visits: Visit[];
  absences: AbsenceNote[];
  /** Last crop year harvested, and how good it was. */
  harvest: { year: number; quality: number; gathered: number };
  /** Sermons preached after an omen, keyed by night. */
  omenNight: number;
  sermonDue: number;
  /** Last reeve election, as a calendar year. */
  reeveYear: number;
  lastLabour: Labour | null;
  /** What has just happened (for the inscriptions): kept with the village so it survives a reload. */
  recent: SimEvent[];
  /** Next absence id (ids must never repeat, though old notes are dropped). */
  nextAbsence: number;
  /** Transient counters for the parish roll. */
  counts: { births: number; marriages: number; burials: number; quarrels: number; reconciliations: number };
}

/** Events the simulation emits for inscriptions, narration and the needle. */
export interface SimEvent {
  kind:
    | "bell"
    | "passingBell"
    | "death"
    | "birth"
    | "marriage"
    | "betrothal"
    | "quarrel"
    | "reconcile"
    | "sick"
    | "recovered"
    | "stranger"
    | "strangerGreeted"
    | "strangerFollowed"
    | "strangerDistrusted"
    | "bark"
    | "goose"
    | "spate"
    | "bridgeLost"
    | "bridgeMended"
    | "flockSaved"
    | "sheepLost"
    | "comet"
    | "meteors"
    | "sermon"
    | "postponed"
    | "funeral"
    | "burial"
    | "wedding"
    | "harvestIn"
    | "strip"
    | "cottage"
    | "rumour"
    | "reeve"
    | "hunger"
    | "alms"
    | "restitch"
    | "chronicle";
  t: number;
  x: number;
  actors: number[];
  text: string;
  /** Scene-level things (a strip changed) are not narrated. */
  quiet?: boolean;
  data?: Record<string, number | string>;
}
