/**
 * The world outside the cloth: the visitor's real clock and calendar, a
 * guessed place, the sun, the moon, the labours of the month, the feasts,
 * the bells, the weather and the sky.
 *
 * Weather and sky are deterministic per village and per local calendar day,
 * so the absence model asks "did it rain on Tuesday?" and gets the same
 * answer the live simulation saw.
 */
import { hash01 } from "./rng";

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
const RAD = Math.PI / 180;

export interface Place {
  timeZone: string;
  /** +1 northern, -1 southern. */
  hemisphere: 1 | -1;
  /** Degrees; a coarse guess from the time zone. */
  latitude: number;
  /** Minutes east of UTC when the page loaded. */
  offsetMinutes: number;
}

const SOUTHERN = [
  "Australia/",
  "Antarctica/",
  "Pacific/Auckland",
  "Pacific/Chatham",
  "Pacific/Fiji",
  "Pacific/Noumea",
  "Pacific/Tongatapu",
  "America/Argentina",
  "America/Buenos_Aires",
  "America/Santiago",
  "America/Sao_Paulo",
  "America/Montevideo",
  "America/Asuncion",
  "America/Punta_Arenas",
  "America/La_Paz",
  "America/Lima",
  "Africa/Johannesburg",
  "Africa/Maputo",
  "Africa/Windhoek",
  "Africa/Harare",
  "Africa/Lusaka",
  "Indian/Mauritius",
  "Indian/Reunion",
  "Atlantic/Stanley",
];

export function placeFromTimeZone(timeZone: string, offsetMinutes: number): Place {
  const tz = timeZone || "Europe/London";
  if (SOUTHERN.some((p) => tz.startsWith(p))) return { timeZone: tz, hemisphere: -1, latitude: -35, offsetMinutes };
  let latitude = 48;
  if (tz.startsWith("America/")) latitude = 40;
  else if (tz.startsWith("Asia/")) latitude = 32;
  else if (tz.startsWith("Africa/")) latitude = 20;
  else if (tz.startsWith("Europe/")) latitude = 51;
  if (/Stockholm|Oslo|Helsinki|Reykjavik|Anchorage|Tallinn|Riga/.test(tz)) latitude = 60;
  return { timeZone: tz, hemisphere: 1, latitude, offsetMinutes };
}

export interface LocalTime {
  year: number;
  /** Calendar month 0..11. */
  month: number;
  date: number;
  /** 0 = Sunday. */
  weekday: number;
  dayOfYear: number;
  /** Local calendar day number since the epoch. */
  dayNumber: number;
  hour: number;
}

export function localTime(now: number, offsetMinutes: number): LocalTime {
  const local = now + offsetMinutes * 60_000;
  const d = new Date(local);
  const y = d.getUTCFullYear();
  return {
    year: y,
    month: d.getUTCMonth(),
    date: d.getUTCDate(),
    weekday: d.getUTCDay(),
    dayOfYear: Math.floor((local - Date.UTC(y, 0, 1)) / DAY_MS),
    dayNumber: Math.floor(local / DAY_MS),
    hour: d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600,
  };
}

/** The month of the farming year: shifted by six in the south. */
export function farmMonth(lt: LocalTime, place: Place): number {
  return place.hemisphere === 1 ? lt.month : (lt.month + 6) % 12;
}

/** Fraction through the farming month, 0..1. */
export function farmMonthFraction(lt: LocalTime): number {
  return Math.min(0.999, (lt.date - 1) / 30);
}

/** The farming year: the calendar year in the north, shifted half a year in the south. */
export function farmYear(lt: LocalTime, place: Place): number {
  return place.hemisphere === 1 ? lt.year : lt.month >= 6 ? lt.year : lt.year - 1;
}

/** The calendar month and year of a farming month. */
export function farmToCalendar(fm: number, fy: number, place: Place): { month: number; year: number } {
  if (place.hemisphere === 1) return { month: fm, year: fy };
  return fm < 6 ? { month: fm + 6, year: fy } : { month: fm - 6, year: fy + 1 };
}

/**
 * The crop year begins with winter sowing in the farming October: the field
 * sown then is reaped the next August, and the spring corn of the same crop
 * year is in by the end of September.
 */
export function cropYear(lt: LocalTime, place: Place): number {
  const fy = farmYear(lt, place);
  return farmMonth(lt, place) >= 9 ? fy : fy - 1;
}

// ---------------------------------------------------------------------------
// The labours of the months
// ---------------------------------------------------------------------------

export type Labour =
  | "feasting"
  | "pruning"
  | "sowing"
  | "lambing"
  | "weeding"
  | "haymaking"
  | "shearing"
  | "harvest"
  | "threshing"
  | "ploughing"
  | "pannage"
  | "slaughter";

export const MONTH_LABOURS: readonly (readonly Labour[])[] = [
  ["feasting"],
  ["pruning"],
  ["sowing", "pruning"],
  ["sowing", "lambing"],
  ["weeding"],
  ["haymaking", "shearing"],
  ["haymaking", "weeding"],
  ["harvest"],
  ["threshing", "harvest"],
  ["ploughing", "sowing"],
  ["pannage", "slaughter"],
  ["slaughter", "feasting"],
];

export const LABOUR_WORDS: Record<Labour, string> = {
  feasting: "feasting",
  pruning: "pruning and hedging",
  sowing: "sowing",
  lambing: "lambing",
  weeding: "weeding",
  haymaking: "haymaking",
  shearing: "shearing",
  harvest: "the harvest",
  threshing: "threshing",
  ploughing: "ploughing",
  pannage: "driving the pigs to the acorns",
  slaughter: "the slaughter",
};

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// ---------------------------------------------------------------------------
// Feasts (fixed; the moveable ones are left out)
// ---------------------------------------------------------------------------

export interface Feast {
  month: number;
  date: number;
  en: string;
  /** Latin, ablative after "in festo": e.g. "SANCTI MICHAELIS". */
  la: string;
  /** A holy day of obligation: no field work, most go to mass. */
  holy: boolean;
}

export const FEASTS: readonly Feast[] = [
  { month: 0, date: 1, en: "New Year's Day", la: "CIRCUMCISIONIS", holy: true },
  { month: 0, date: 6, en: "Twelfth Day", la: "EPIPHANIAE", holy: true },
  { month: 1, date: 2, en: "Candlemas", la: "PURIFICATIONIS", holy: true },
  { month: 2, date: 25, en: "Lady Day", la: "ANNUNTIATIONIS", holy: true },
  { month: 3, date: 23, en: "St George's Day", la: "SANCTI GEORGII", holy: false },
  { month: 4, date: 1, en: "May Day", la: "APOSTOLORUM PHILIPPI ET IACOBI", holy: true },
  { month: 5, date: 24, en: "Midsummer", la: "SANCTI IOHANNIS", holy: true },
  { month: 5, date: 29, en: "St Peter's Day", la: "SANCTI PETRI", holy: true },
  { month: 6, date: 25, en: "St James's Day", la: "SANCTI IACOBI", holy: false },
  { month: 7, date: 1, en: "Lammas", la: "SANCTI PETRI AD VINCULA", holy: false },
  { month: 7, date: 15, en: "the Assumption", la: "ASSUMPTIONIS", holy: true },
  { month: 8, date: 8, en: "Lady Day in harvest", la: "NATIVITATIS MARIAE", holy: true },
  { month: 8, date: 29, en: "Michaelmas", la: "SANCTI MICHAELIS", holy: true },
  { month: 9, date: 18, en: "St Luke's Day", la: "SANCTI LUCAE", holy: false },
  { month: 10, date: 1, en: "All Hallows", la: "OMNIUM SANCTORUM", holy: true },
  { month: 10, date: 2, en: "All Souls", la: "ANIMARUM", holy: false },
  { month: 10, date: 11, en: "Martinmas", la: "SANCTI MARTINI", holy: true },
  { month: 10, date: 30, en: "St Andrew's Day", la: "SANCTI ANDREAE", holy: false },
  { month: 11, date: 6, en: "St Nicholas's Day", la: "SANCTI NICOLAI", holy: false },
  { month: 11, date: 25, en: "Christmas", la: "NATIVITATIS DOMINI", holy: true },
  { month: 11, date: 26, en: "St Stephen's Day", la: "SANCTI STEPHANI", holy: true },
];

export function feastOn(lt: LocalTime): Feast | null {
  return FEASTS.find((f) => f.month === lt.month && f.date === lt.date) ?? null;
}

/** "at Michaelmas", "three days before Martinmas", "in late September". */
export function datePhrase(now: number, offsetMinutes: number): string {
  const lt = localTime(now, offsetMinutes);
  for (let d = -3; d <= 3; d++) {
    const other = localTime(now + d * DAY_MS, offsetMinutes);
    const f = feastOn(other);
    if (!f) continue;
    if (d === 0) return `at ${f.en}`;
    const n = Math.abs(d);
    const words = ["", "the day", "two days", "three days"][n];
    return d > 0 ? `${words} before ${f.en}` : `${words} after ${f.en}`;
  }
  const part = lt.date <= 10 ? "early" : lt.date <= 20 ? "mid-" : "late";
  return `in ${part}${part === "mid-" ? "" : " "}${MONTH_NAMES[lt.month]}`;
}

// ---------------------------------------------------------------------------
// Sun, moon, bells
// ---------------------------------------------------------------------------

function declination(dayOfYear: number): number {
  return -23.44 * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));
}

/** Local sunrise and sunset in hours, with an hour's allowance for clocks. */
export function sunTimes(dayOfYear: number, latitude: number): { rise: number; set: number } {
  const d = declination(dayOfYear) * RAD;
  const phi = latitude * RAD;
  const c = Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(d)));
  const half = Math.acos(c) / RAD / 15;
  const noon = 12.6;
  return { rise: noon - half, set: noon + half };
}

/** 0 at night, 1 in full day, smoothed through an hour of twilight. */
export function daylightAt(hour: number, rise: number, set: number): number {
  const a = smooth(rise - 0.6, rise + 0.5, hour);
  const b = 1 - smooth(set - 0.5, set + 0.6, hour);
  return Math.min(a, b);
}

export function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function moonPhase(now: number): number {
  const knownNew = Date.UTC(2000, 0, 6, 18, 14);
  const synodic = 29.530588853;
  const days = (now - knownNew) / DAY_MS;
  return (((days % synodic) + synodic) % synodic) / synodic;
}

/** The hours the church bell is rung, as clock hours. */
export const BELL_HOURS: readonly { hour: number; name: string; la: string }[] = [
  { hour: 6, name: "Prime", la: "PRIMA" },
  { hour: 9, name: "Terce", la: "TERTIA" },
  { hour: 12, name: "Sext", la: "SEXTA" },
  { hour: 15, name: "None", la: "NONA" },
  { hour: 18, name: "Vespers", la: "VESPERAE" },
  { hour: 20, name: "Compline", la: "COMPLETORIUM" },
];

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------

/** Chance of rain on a day, by farming month (a wet, temperate place). */
const RAIN_CHANCE = [0.52, 0.44, 0.42, 0.4, 0.38, 0.36, 0.36, 0.4, 0.44, 0.54, 0.58, 0.56];

export interface DayWeather {
  showers: { start: number; end: number; intensity: number }[];
  snow: boolean;
  storm: boolean;
}

export type WeatherOverride = "rain" | "dry" | "spate" | "snow" | null;

export function weatherOn(seed: number, dayNumber: number, fm: number, override: WeatherOverride = null): DayWeather {
  if (override === "dry") return { showers: [], snow: false, storm: false };
  if (override === "rain") return { showers: [{ start: 0, end: 24, intensity: 0.6 }], snow: false, storm: false };
  if (override === "spate") return { showers: [{ start: 0, end: 24, intensity: 1 }], snow: false, storm: true };
  if (override === "snow") return { showers: [{ start: 0, end: 24, intensity: 0.35 }], snow: true, storm: false };
  if (hash01(seed, dayNumber, 1) >= RAIN_CHANCE[fm]) return { showers: [], snow: false, storm: false };
  const autumnWinter = fm >= 9 || fm <= 1;
  const storm = hash01(seed, dayNumber, 3) < (autumnWinter ? 0.11 : 0.04);
  const cold = fm === 11 || fm === 0 || fm === 1;
  const snow = cold && hash01(seed, dayNumber, 4) < 0.32;
  if (storm) {
    const start = 2 + hash01(seed, dayNumber, 5) * 10;
    return { showers: [{ start, end: Math.min(24, start + 10 + hash01(seed, dayNumber, 6) * 10), intensity: 1 }], snow, storm };
  }
  const count = hash01(seed, dayNumber, 2) < 0.45 ? 2 : 1;
  const showers = [];
  for (let i = 0; i < count; i++) {
    const start = 1 + hash01(seed, dayNumber, 10 + i) * 20;
    const length = 0.6 + hash01(seed, dayNumber, 20 + i) * 3.2;
    const intensity = 0.3 + hash01(seed, dayNumber, 30 + i) * 0.6;
    showers.push({ start, end: Math.min(24, start + length), intensity });
  }
  return { showers, snow, storm };
}

export function rainAt(w: DayWeather, hour: number): number {
  let r = 0;
  for (const s of w.showers) {
    const v = Math.min(smooth(s.start, s.start + 0.2, hour), 1 - smooth(s.end - 0.2, s.end, hour));
    r = Math.max(r, v * s.intensity);
  }
  return r;
}

/** The river's resting level by farming month: higher in winter. */
export function riverBase(fm: number): number {
  return [0.4, 0.4, 0.37, 0.33, 0.29, 0.26, 0.24, 0.24, 0.27, 0.32, 0.37, 0.4][fm];
}

/** Advance the river level by `hours` of rain at `rain` intensity. */
export function stepRiver(level: number, rain: number, fm: number, hours: number): number {
  const base = riverBase(fm);
  const inflow = rain * rain * 0.16 + rain * 0.02;
  const next = level + (inflow - (level - base) * 0.11) * hours;
  return Math.max(0.12, Math.min(1, next));
}

export const SPATE_LEVEL = 0.7;
export const BRIDGE_LOST_LEVEL = 0.84;

/** How good this crop year's growing weather was, 0.45..1.2. */
export function growingQuality(seed: number, cropYr: number, place: Place, override: WeatherOverride = null): number {
  // Count rain in the growing months (farming April..July) of the crop year.
  let wet = 0;
  let days = 0;
  for (let fm = 3; fm <= 6; fm++) {
    const cal = farmToCalendar(fm, cropYr + 1, place);
    const first = Math.floor(Date.UTC(cal.year, cal.month, 1) / DAY_MS);
    for (let d = 0; d < 30; d += 2) {
      const w = weatherOn(seed, first + d, fm, override);
      wet += w.showers.reduce((s, x) => s + (x.end - x.start) * x.intensity, 0) / 6;
      days++;
    }
  }
  const mean = wet / days; // ~0.1 dry .. ~0.6 wet
  const ideal = 0.26;
  const off = Math.abs(mean - ideal);
  const luck = hash01(seed, cropYr, 911) * 0.25;
  return Math.max(0.45, Math.min(1.2, 1.12 - off * 1.9 + luck - 0.1));
}

// ---------------------------------------------------------------------------
// The sky: falling stars and the hairy star
// ---------------------------------------------------------------------------

export interface MeteorShower {
  name: string;
  month: number;
  date: number;
}

/** Peak nights of the principal annual meteor showers. */
export const SHOWERS: readonly MeteorShower[] = [
  { name: "the Quadrantids", month: 0, date: 3 },
  { name: "the Lyrids", month: 3, date: 22 },
  { name: "the Eta Aquariids", month: 4, date: 6 },
  { name: "the Perseids", month: 7, date: 12 },
  { name: "the Orionids", month: 9, date: 21 },
  { name: "the Leonids", month: 10, date: 17 },
  { name: "the Geminids", month: 11, date: 13 },
];

export type SkyOverride = "comet" | "meteors" | null;

export interface Sky {
  meteors: MeteorShower | null;
  comet: boolean;
  /** 0..1: how far through the comet's stay, for its brightness. */
  cometPhase: number;
}

/**
 * Whether tonight has a shower (peak night and the nights either side) or a
 * comet (rare: a few a year, deterministic per village, staying several nights).
 * "Tonight" is keyed to the evening's date, so the small hours belong to the
 * night before.
 */
export function skyOn(seed: number, now: number, offsetMinutes: number, override: SkyOverride = null): Sky {
  const evening = localTime(now - 8 * HOUR_MS, offsetMinutes);
  let meteors: MeteorShower | null = null;
  for (const s of SHOWERS) {
    for (let d = -1; d <= 1; d++) {
      const lt = localTime(now - 8 * HOUR_MS + d * DAY_MS, offsetMinutes);
      if (lt.month === s.month && lt.date === s.date) meteors = s;
    }
  }
  if (override === "meteors" && !meteors) meteors = SHOWERS[4];
  const week = Math.floor(evening.dayNumber / 7);
  let comet = false;
  let cometPhase = 0;
  for (const w of [week - 1, week]) {
    if (hash01(seed, w, 77) >= 0.045) continue;
    const first = w * 7 + Math.floor(hash01(seed, w, 78) * 5);
    const nights = 4 + Math.floor(hash01(seed, w, 79) * 4);
    if (evening.dayNumber >= first && evening.dayNumber < first + nights) {
      comet = true;
      cometPhase = (evening.dayNumber - first + 0.5) / nights;
    }
  }
  if (override === "comet") {
    comet = true;
    cometPhase = 0.4;
  }
  return { meteors, comet, cometPhase };
}
