/**
 * The Village: the saved state plus the conveniences every rule needs
 * (the clock and weather sampled for this step, lookups, ties, history,
 * events). Rules live in their own modules and act on a Village.
 */
import {
  BELL_HOURS,
  cropYear,
  daylightAt,
  farmMonth,
  farmMonthFraction,
  feastOn,
  localTime,
  MONTH_LABOURS,
  rainAt,
  skyOn,
  sunTimes,
  weatherOn,
  type DayWeather,
  type Feast,
  type Labour,
  type LocalTime,
  type Sky,
} from "./calendar";
import { CHILD_AGE, HISTORY_MAX, LIFE_YEAR_MS, OLD_AGE, TIES_MAX } from "./constants";
import { BUILDING, type Building } from "./geography";
import { nameByKey, type GivenName } from "./names";
import { Rng } from "./rng";
import {
  Kin,
  type Animal,
  type HistEntry,
  type Household,
  type Settings,
  type SimEvent,
  type Tie,
  type Villager,
  type VillageState,
} from "./types";

export interface Env {
  now: number;
  lt: LocalTime;
  dayNumber: number;
  /** Farming month (shifted in the south). */
  fm: number;
  frac: number;
  labours: readonly Labour[];
  hour: number;
  rise: number;
  set: number;
  daylight: number;
  wake: number;
  bed: number;
  night: boolean;
  weather: DayWeather;
  rain: number;
  snowCover: boolean;
  storm: boolean;
  sky: Sky;
  /** True from dusk while the sky shows falling stars or a comet. */
  skyShow: boolean;
  feast: Feast | null;
  sunday: boolean;
  holy: boolean;
  cropYear: number;
  /** Index into BELL_HOURS of the last bell rung at or before now. */
  bell: number;
}

function skyShowFor(sky: Sky, daylight: number): boolean {
  return (sky.meteors !== null || sky.comet) && daylight < 0.25;
}

export class Village {
  s: VillageState;
  rng: Rng;
  settings: Settings;
  env!: Env;
  events: SimEvent[] = [];
  private byId = new Map<number, Villager>();
  private living_: Villager[] | null = null;
  private hh = new Map<number, Household>();
  /** Set by the live loop; the absence model steps without it. */
  live = true;
  /** Called with every event as it is emitted (the inscriptions keep what they can stitch). */
  remember: ((e: SimEvent) => void) | null = null;

  constructor(state: VillageState, settings: Settings) {
    this.s = state;
    this.settings = settings;
    this.rng = new Rng(state.rng);
    this.reindex();
    this.refreshEnv();
  }

  reindex(): void {
    this.byId.clear();
    for (const v of this.s.villagers) this.byId.set(v.id, v);
    this.hh.clear();
    for (const h of this.s.households) this.hh.set(h.id, h);
    this.living_ = null;
  }

  /** Call after anyone is born, dies, arrives or leaves. */
  changed(): void {
    this.living_ = null;
  }

  saveRng(): void {
    this.s.rng = this.rng.state();
  }

  // -------------------------------------------------------------------------
  // Time
  // -------------------------------------------------------------------------

  refreshEnv(): void {
    const now = this.s.now;
    const place = this.settings.place;
    const lt = localTime(now, place.offsetMinutes);
    const fm = farmMonth(lt, place);
    const { rise, set } = sunTimes(lt.dayOfYear, place.latitude);
    const weather = weatherOn(this.s.seed, lt.dayNumber, fm, this.settings.weather);
    const yesterday = weatherOn(this.s.seed, lt.dayNumber - 1, (fm + 11) % 12, this.settings.weather);
    const twoDays = weatherOn(this.s.seed, lt.dayNumber - 2, (fm + 11) % 12, this.settings.weather);
    const wake = Math.max(4.4, Math.min(7.2, rise - 0.4));
    const bed = Math.max(20, Math.min(22.4, set + 2.2));
    const feast = feastOn(lt);
    const sky = skyOn(this.s.seed, now, place.offsetMinutes, this.settings.sky);
    let bell = -1;
    for (let i = 0; i < BELL_HOURS.length; i++) if (lt.hour >= BELL_HOURS[i].hour) bell = i;
    const daylight = daylightAt(lt.hour, rise, set);
    this.env = {
      now,
      lt,
      dayNumber: lt.dayNumber,
      fm,
      frac: farmMonthFraction(lt),
      labours: MONTH_LABOURS[fm],
      hour: lt.hour,
      rise,
      set,
      daylight,
      wake,
      bed,
      night: lt.hour < wake || lt.hour >= bed + (skyShowFor(sky, daylight) ? (sky.comet ? 1.5 : 1) : 0),
      weather,
      rain: rainAt(weather, lt.hour),
      snowCover: (weather.snow && lt.hour > 6) || yesterday.snow || (twoDays.snow && fm !== 1),
      storm: weather.storm,
      sky,
      skyShow: (sky.meteors !== null || sky.comet) && daylight < 0.25,
      feast,
      sunday: lt.weekday === 0,
      holy: lt.weekday === 0 || (feast?.holy ?? false),
      cropYear: cropYear(lt, place),
      bell,
    };
  }

  // -------------------------------------------------------------------------
  // People
  // -------------------------------------------------------------------------

  get(id: number): Villager | undefined {
    return this.byId.get(id);
  }

  living(): Villager[] {
    if (!this.living_) this.living_ = this.s.villagers.filter((v) => v.alive);
    return this.living_;
  }

  household(id: number): Household | undefined {
    return this.hh.get(id);
  }

  addHousehold(h: Household): void {
    this.s.households.push(h);
    this.hh.set(h.id, h);
  }

  addVillager(v: Villager): void {
    this.s.villagers.push(v);
    this.byId.set(v.id, v);
    this.changed();
  }

  home(v: Villager): Building {
    const h = this.hh.get(v.household);
    return BUILDING[h?.building ?? "cottage-a"];
  }

  age(v: Villager, at = this.s.now): number {
    return (at - v.born) / LIFE_YEAR_MS;
  }

  isChild(v: Villager): boolean {
    return this.age(v) < CHILD_AGE;
  }

  isOld(v: Villager): boolean {
    return this.age(v) >= OLD_AGE;
  }

  given(v: Villager): GivenName {
    return nameByKey(v.name);
  }

  /** "Walter Miller", "Agnes atte Well". */
  fullName(v: Villager): string {
    return v.byname ? `${this.given(v).en} ${v.byname}` : this.given(v).en;
  }

  first(v: Villager): string {
    return this.given(v).en;
  }

  // -------------------------------------------------------------------------
  // Ties
  // -------------------------------------------------------------------------

  peek(a: Villager, b: number): Tie | undefined {
    return a.ties[b];
  }

  /** The tie from a to b, made on first need. Keeps the strongest few. */
  tie(a: Villager, b: number): Tie {
    let t = a.ties[b];
    if (!t) {
      t = { k: Kin.None, a: 0, g: 0, m: 0, t: this.s.now };
      const keys = Object.keys(a.ties);
      if (keys.length >= TIES_MAX) this.pruneTies(a);
      a.ties[b] = t;
    }
    return t;
  }

  private pruneTies(a: Villager): void {
    let weakest = -1;
    let score = Infinity;
    const recent = this.s.now - 2 * 3_600_000;
    for (const k in a.ties) {
      const t = a.ties[k];
      if (t.k !== Kin.None || Number(k) === 0 || t.t > recent) continue;
      const s = Math.abs(t.a) + t.g * 1.4 + Math.min(1, t.m / 12) * 0.3;
      if (s < score) {
        score = s;
        weakest = Number(k);
      }
    }
    if (weakest >= 0) delete a.ties[weakest];
  }

  /** Change affection both ways. */
  warm(a: Villager, b: Villager, amount: number): void {
    const ab = this.tie(a, b.id);
    const ba = this.tie(b, a.id);
    ab.a = Math.max(-1, Math.min(1, ab.a + amount));
    ba.a = Math.max(-1, Math.min(1, ba.a + amount));
  }

  // -------------------------------------------------------------------------
  // History and events
  // -------------------------------------------------------------------------

  hist(v: Villager, e: Omit<HistEntry, "t"> & { t?: number }): void {
    v.history.push({ t: e.t ?? this.s.now, ...e });
    if (v.history.length > HISTORY_MAX) {
      // Keep birth and marriages; forget the oldest small things first.
      const keep = new Set(["born", "married", "childBuried", "widowed", "namedForStranger", "reeve"]);
      const i = v.history.findIndex((h) => !keep.has(h.k));
      v.history.splice(i >= 0 ? i : 1, 1);
    }
  }

  emit(e: Omit<SimEvent, "t"> & { t?: number }): void {
    if (!this.live && e.kind !== "chronicle") return;
    const ev = { t: this.s.now, ...e };
    this.events.push(ev);
    this.remember?.(ev);
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
  }

  animals(): Animal[] {
    return this.s.animals;
  }
}
