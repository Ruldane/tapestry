/**
 * The open fields: three fields in rotation (winter corn, spring corn,
 * fallow), each in strips held by households or the lord. A strip's state
 * follows the real calendar, but only where the work has been done: an
 * unploughed strip is not sown, an unreaped one spoils.
 */
import type { StripData, StripState } from "./types";

/** 0 winter corn, 1 spring corn, 2 fallow. */
export type Role = 0 | 1 | 2;

export function fieldRole(field: number, cropYr: number): Role {
  return ((((field + cropYr) % 3) + 3) % 3) as Role;
}

/** Months into the crop year (farming October = 0), with fraction. */
export function cropTime(fm: number, frac: number): number {
  return ((fm - 9 + 12) % 12) + frac;
}

const ORDER: Record<StripState, number> = {
  fallow: 0,
  stubble: 0,
  ploughed: 1,
  sown: 2,
  shoots: 3,
  green: 4,
  ripe: 5,
  reaped: 6,
};

/** Where a strip of this role should be by now, if its work was done in time. */
export function expectedState(role: Role, ct: number): StripState {
  if (role === 0) {
    if (ct < 0.6) return "ploughed";
    if (ct < 1.3) return "sown";
    if (ct < 5) return "shoots";
    if (ct < 9.7) return "green";
    if (ct < 10.65) return "ripe";
    if (ct < 11.05) return "reaped";
    return "stubble";
  }
  if (role === 1) {
    if (ct < 4.4) return "stubble";
    if (ct < 5.3) return "ploughed";
    if (ct < 6.4) return "sown";
    if (ct < 7.3) return "shoots";
    if (ct < 10.8) return "green";
    if (ct < 11.35) return "ripe";
    if (ct < 11.7) return "reaped";
    return "stubble";
  }
  if (ct < 0.5) return "stubble";
  if (ct < 8.2) return "fallow";
  return "ploughed";
}

export type FieldJob = "plough" | "sow" | "reap" | "cart";

/** Worker-seconds each job takes on one strip. */
export const JOB_WORK: Record<FieldJob, number> = { plough: 20000, sow: 9000, reap: 30000, cart: 12000 };

/**
 * The job a strip is waiting for, if any: the expected state is ahead of it
 * and the next step is work, not growth. Late work is still allowed within
 * a grace period (at a cost in yield).
 */
export function jobFor(strip: StripData, role: Role, ct: number): FieldJob | null {
  if (strip.state === "reaped") return "cart";
  if (strip.state === "ripe") return "reap";
  const want = ORDER[expectedState(role, ct)];
  if (role === 2) return strip.state === "fallow" && want === 1 ? "plough" : null;
  // Too late to plough or sow for this year's crop once it should be well grown.
  const late = role === 0 ? ct > 3 : ct > 7.6;
  if (late) return null;
  if ((strip.state === "stubble" || strip.state === "fallow") && want >= 1) return "plough";
  if (strip.state === "ploughed" && want >= 2) return "sow";
  return null;
}

/** Growth happens by itself, one step at a time, when the calendar says so. */
export function grow(strip: StripData, role: Role, ct: number): boolean {
  const want = expectedState(role, ct);
  if (role === 2 && strip.state === "stubble" && want === "fallow") {
    strip.state = "fallow";
    return true;
  }
  const next: Partial<Record<StripState, StripState>> = { sown: "shoots", shoots: "green", green: "ripe" };
  const n = next[strip.state];
  if (!n) return false;
  // After the harvest window the calendar says "stubble"; growth has run its course.
  const w = want === "stubble" && ct > 5 ? 7 : ORDER[want];
  if (w >= ORDER[n]) {
    strip.state = n;
    return true;
  }
  return false;
}

/** Apply a finished job. */
export function finishJob(strip: StripData, job: FieldJob): void {
  strip.work = 0;
  if (job === "plough") strip.state = "ploughed";
  else if (job === "sow") strip.state = "sown";
  else if (job === "reap") strip.state = "reaped";
  else if (job === "cart") strip.state = "stubble";
}

/**
 * At the turn of the crop year the fields change roles. Whatever was left
 * standing is lost; the new fallow is stubble; the new winter field is
 * whatever the June ploughing left it.
 */
export function rollOver(strip: StripData, newRole: Role, cropYr: number): { lost: boolean } {
  let lost = false;
  if (strip.state === "ripe" || strip.state === "green" || strip.state === "reaped") lost = true;
  if (newRole === 0) {
    strip.state = strip.state === "ploughed" ? "ploughed" : "fallow";
  } else {
    strip.state = "stubble";
  }
  strip.year = cropYr;
  strip.work = 0;
  strip.care = 1;
  strip.flood = 0;
  return { lost };
}

export function stateIndex(s: StripState): number {
  return ORDER[s];
}
