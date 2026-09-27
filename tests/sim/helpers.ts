import { placeFromTimeZone, type WeatherOverride, type SkyOverride } from "@/sim/calendar";
import { foundVillage } from "@/sim/founding";
import { settle, step, type Village } from "@/sim/sim";

export interface MakeOpts {
  seed?: number;
  /** Local wall-clock time in London (or the given zone). */
  at?: string;
  timeZone?: string;
  offsetMinutes?: number;
  weather?: WeatherOverride;
  sky?: SkyOverride;
}

/** A village founded at a fixed moment, for deterministic tests. */
export function makeVillage(o: MakeOpts = {}): Village {
  const offset = o.offsetMinutes ?? 60;
  const local = Date.parse((o.at ?? "2026-06-15T10:00") + "Z");
  const now = local - offset * 60_000;
  const vil = foundVillage({
    seed: o.seed ?? 7,
    now,
    settings: { place: placeFromTimeZone(o.timeZone ?? "Europe/London", offset), weather: o.weather ?? null, sky: o.sky ?? null },
  });
  settle(vil);
  return vil;
}

/** Run the live simulation for a number of seconds. */
export function run(vil: Village, seconds: number): void {
  const n = Math.round(seconds / 0.25);
  for (let i = 0; i < n; i++) step(vil);
  vil.events = [];
}
