/**
 * Parameters read from the address, for testing and demonstration. None is
 * needed in ordinary use.
 *
 *   ?fresh                 found a new village (clears the saved one)
 *   ?seed=7                found it from a fixed seed
 *   ?clock=2026-12-21T22:00, ?clock=+19h, ?clock=-3d   move the village clock
 *   ?tz=Australia/Sydney   pretend to be elsewhere (the other hemisphere)
 *   ?weather=rain|dry|spate|snow   ?sky=comet|meteors
 *   ?speed=0|1|6   ?still   ?debug   ?persist=0   ?x=900 (where the stranger starts)
 */
import type { SkyOverride, WeatherOverride } from "../sim/calendar";

export interface Params {
  fresh: boolean;
  seed: number | null;
  clockOffset: number;
  timeZone: string;
  offsetMinutes: number;
  weather: WeatherOverride;
  sky: SkyOverride;
  speed: number;
  still: boolean;
  debug: boolean;
  persist: boolean;
  startX: number | null;
}

function tzOffset(timeZone: string, at: number): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(new Date(at));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
    return Math.round((asUtc - Math.floor(at / 60000) * 60000) / 60000);
  } catch {
    return -new Date(at).getTimezoneOffset();
  }
}

export function readParams(search: string): Params {
  const q = new URLSearchParams(search);
  let clockOffset = 0;
  const clock = q.get("clock");
  if (clock) {
    const rel = /^([+-])(\d+(?:\.\d+)?)([hdm])$/.exec(clock.replace(" ", "+"));
    if (rel) {
      const n = Number(rel[2]) * (rel[3] === "d" ? 86_400_000 : rel[3] === "h" ? 3_600_000 : 60_000);
      clockOffset = rel[1] === "-" ? -n : n;
    } else {
      const t = new Date(clock).getTime();
      if (Number.isFinite(t)) clockOffset = t - Date.now();
    }
  }
  let sysTz = "Europe/London";
  try {
    sysTz = Intl.DateTimeFormat().resolvedOptions().timeZone || sysTz;
  } catch {
    // keep the default
  }
  const timeZone = q.get("tz") || sysTz;
  const at = Date.now() + clockOffset;
  const offsetMinutes = q.get("tz") ? tzOffset(timeZone, at) : -new Date(at).getTimezoneOffset();
  const w = q.get("weather");
  const s = q.get("sky");
  const seed = q.get("seed");
  const speed = q.get("speed");
  const x = q.get("x");
  return {
    fresh: q.has("fresh"),
    seed: seed !== null && seed !== "" && Number.isFinite(Number(seed)) ? Number(seed) >>> 0 : null,
    clockOffset,
    timeZone,
    offsetMinutes,
    weather: w === "rain" || w === "dry" || w === "spate" || w === "snow" ? w : null,
    sky: s === "comet" || s === "meteors" ? s : null,
    speed: speed !== null && Number.isFinite(Number(speed)) ? Math.max(0, Math.min(6, Number(speed))) : 1,
    still: q.has("still"),
    debug: q.has("debug"),
    persist: q.get("persist") !== "0",
    startX: x !== null && Number.isFinite(Number(x)) ? Number(x) : null,
  };
}
