/**
 * Meeting, talking, quarrelling, courting, and gossip.
 *
 * Villagers who come within talking distance may stop. Who stops depends on
 * where they are (the alehouse, the green, a field), their temperaments and
 * their ties. Talk warms ties and carries rumours, which can change as they
 * pass; a quarrel sours ties and makes a rumour of its own. The priest, the
 * reeve and the alewife become the village's crossroads because their work
 * puts them among people, not because anything says they must.
 */
import { MARRY_AGE, NEAR, RUMOURS_HELD_MAX } from "./constants";
import type { Village } from "./core";
import { interruptible } from "./schedule";
import { Act, Kin, PILGRIM, Work, type Rumour, type RumourKind, type Villager } from "./types";
import { who } from "./words";
import { life as lifeLines } from "../text/latin";

// ---------------------------------------------------------------------------
// Rumours: what is said, and how it changes in the telling
// ---------------------------------------------------------------------------

interface RumourShape {
  /** Words for each version; {a} and {b} are the people it is about. */
  says: string[];
  /** Which versions a telling can turn a version into. */
  turns: number[][];
  /** How juicy: likelier to be passed on. */
  weight: number;
}

export const RUMOURS: Record<RumourKind, RumourShape> = {
  stranger: {
    says: [
      "a stranger is walking about the village",
      "the stranger is a pilgrim on the road to Walsingham",
      "the stranger is a holy pilgrim who has been to Rome",
      "the stranger is a pardoner with pardons to sell",
      "the stranger is a spy for the bishop",
      "the stranger is a runaway from another manor",
      "the stranger is lost and looking for kin",
    ],
    turns: [[1, 3, 6], [2, 5], [2], [4, 5], [4], [4, 3], [1, 5]],
    weight: 1.6,
  },
  quarrel: {
    says: ["{a} and {b} had words", "{a} and {b} came to blows", "{a} swears to have the law on {b}"],
    turns: [[1], [2], [2]],
    weight: 1.2,
  },
  courting: {
    says: ["{a} and {b} have been seen walking out", "{a} and {b} will be married by Martinmas", "{a} is sweet on {b}, but {b} will not have it"],
    turns: [[1, 2], [1], [2]],
    weight: 1.3,
  },
  sick: {
    says: ["{a} is poorly", "{a} is very sick", "{a} is dying, they say"],
    turns: [[1], [2], [2]],
    weight: 1.1,
  },
  blame: {
    says: ["{a} says the stranger looked ill on a ewe", "{a} says the stranger put the evil eye on the flock"],
    turns: [[1], [1]],
    weight: 1.4,
  },
  omen: {
    says: ["there is a hairy star in the sky", "the star means a hard winter", "the star means war with the French", "the star came with the stranger"],
    turns: [[1, 2, 3], [2], [2], [3]],
    weight: 1.7,
  },
  theft: {
    says: ["{a} took barley from {b}'s store", "{a} is a thief, and always was"],
    turns: [[1], [1]],
    weight: 1.4,
  },
  birth: {
    says: ["{a} has a new child"],
    turns: [[0]],
    weight: 0.6,
  },
  death: {
    says: ["{a} is dead, God rest them"],
    turns: [[0]],
    weight: 0.9,
  },
};

/** How a version of a stranger rumour colours a hearer's view of the stranger. */
const STRANGER_VALENCE = [0.02, 0.18, 0.28, -0.1, -0.24, -0.18, 0.12];

export function rumourText(vil: Village, r: Rumour, version: number): string {
  const shape = RUMOURS[r.kind];
  const text = shape.says[Math.min(version, shape.says.length - 1)];
  const nameOf = (id: number | undefined) => {
    if (id === undefined) return "someone";
    const v = vil.get(id);
    return v ? vil.first(v) : "someone";
  };
  return text.replace(/\{a\}/g, nameOf(r.subj[0])).replace(/\{b\}/g, nameOf(r.subj[1]));
}

export function startRumour(vil: Village, kind: RumourKind, subj: number[], origin: Villager, version = 0): Rumour {
  const r: Rumour = { id: vil.s.nextRumour++, kind, subj, v: version, origin: origin.id, at: vil.s.now, heard: 1 };
  vil.s.rumours.push(r);
  hear(vil, origin, r, version, origin.id);
  if (vil.s.rumours.length > 80) {
    // Forget the stalest.
    const old = vil.s.rumours.shift()!;
    for (const v of vil.living()) delete v.rumours[old.id];
  }
  return r;
}

function hear(vil: Village, v: Villager, r: Rumour, version: number, from: number): void {
  const had = v.rumours[r.id];
  v.rumours[r.id] = { v: version, from: had && from !== v.id ? had.from : from, at: vil.s.now };
  if (!had) r.heard++;
  const keys = Object.keys(v.rumours);
  if (keys.length > RUMOURS_HELD_MAX) {
    let oldest = keys[0];
    for (const k of keys) if (v.rumours[Number(k)].at < v.rumours[Number(oldest)].at) oldest = k;
    delete v.rumours[Number(oldest)];
  }
  if (had && had.v === version) return;
  // What hearing it does to them.
  switch (r.kind) {
    case "stranger": {
      const t = vil.tie(v, PILGRIM);
      const val = STRANGER_VALENCE[version] ?? 0;
      t.a = clamp(t.a + val * (val < 0 ? 0.5 + v.traits.suspicion : 1 - v.traits.suspicion * 0.5) * 0.6, -1, 1);
      break;
    }
    case "quarrel":
      for (const id of r.subj) {
        if (id === v.id) continue;
        const t = vil.tie(v, id);
        if (t.k === Kin.None) t.a = clamp(t.a - 0.02 - version * 0.02, -1, 1);
      }
      break;
    case "blame": {
      const t = vil.tie(v, PILGRIM);
      t.a = clamp(t.a - 0.06 * (0.4 + v.traits.suspicion) * (version + 1), -1, 1);
      break;
    }
    case "omen":
      v.mood = clamp(v.mood - 0.05 * v.traits.piety, -1, 1);
      if (version === 3) {
        const t = vil.tie(v, PILGRIM);
        t.a = clamp(t.a - 0.12 * (0.3 + v.traits.suspicion), -1, 1);
      }
      break;
    case "theft": {
      const thief = r.subj[0];
      if (thief !== v.id) {
        const t = vil.tie(v, thief);
        t.a = clamp(t.a - 0.08 * (version + 1), -1, 1);
      }
      break;
    }
  }
}

/** Speaker may pass one rumour to the listener. */
function tell(vil: Village, speaker: Villager, listener: Villager): void {
  const tie = speaker.ties[listener.id];
  const warmth = Math.max(0, tie?.a ?? 0);
  if (!vil.rng.chance(speaker.traits.gossip * (0.35 + warmth))) return;
  let best: Rumour | null = null;
  let bestScore = 0;
  for (const k in speaker.rumours) {
    const r = vil.s.rumours.find((x) => x.id === Number(k));
    if (!r) continue;
    if (r.subj.includes(listener.id)) continue; // not to their face
    const theirs = listener.rumours[r.id];
    const mine = speaker.rumours[r.id];
    if (theirs && theirs.v === mine.v) continue;
    const fresh = Math.max(0.2, 1 - (vil.s.now - mine.at) / (6 * 3_600_000));
    const score = RUMOURS[r.kind].weight * fresh * (0.5 + vil.rng.next());
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  if (!best) return;
  let version = speaker.rumours[best.id].v;
  const shape = RUMOURS[best.kind];
  const turnChance = 0.1 + speaker.traits.gossip * 0.12;
  if (vil.rng.chance(turnChance)) version = vil.rng.pick(shape.turns[Math.min(version, shape.turns.length - 1)]);
  hear(vil, listener, best, version, speaker.id);
  if (best.kind === "stranger" && vil.live) {
    vil.emit({ kind: "rumour", x: listener.x, actors: [speaker.id, listener.id], text: rumourText(vil, best, version), data: { rumour: best.id, version } });
  }
}

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

function available(vil: Village, v: Villager): boolean {
  if (!interruptible(v)) return false;
  if (v.act === Act.FollowStranger || v.act === Act.GreetStranger || v.act === Act.WatchStranger) return false;
  if (vil.age(v) < 4) return false;
  return true;
}

function isHubWork(v: Villager): boolean {
  if (v.trade === "priest") return v.act === Act.Wander || v.act === Act.Visit || v.act === Act.Rest;
  if (v.trade === "alewife") return v.act === Act.Work && v.work === Work.Serve;
  if (v.trade === "reeve") return v.act === Act.Work && v.work === Work.Oversee;
  return false;
}

function contextFactor(v: Villager): number {
  switch (v.act) {
    case Act.Drink:
      return 5;
    case Act.Rest:
    case Act.Wander:
    case Act.Fetch:
      return 2.4;
    case Act.Play:
    case Act.Dance:
    case Act.Feast:
      return 2;
    case Act.Work:
      return v.work === Work.Serve ? 5 : v.work === Work.Oversee ? 2.2 : 0.7;
    case Act.Visit:
      return 3;
    default:
      return 1;
  }
}

/** Once a second: who meets whom. */
export function meetings(vil: Village): void {
  const people = vil.living().filter((v) => !v.inside && vil.age(v) >= 4);
  const buckets = new Map<number, Villager[]>();
  for (const v of people) {
    const b = Math.floor(v.x / NEAR);
    let arr = buckets.get(b);
    if (!arr) buckets.set(b, (arr = []));
    arr.push(v);
  }
  for (const [b, arr] of buckets) {
    const next = buckets.get(b + 1) ?? [];
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      const pool = arr.slice(i + 1).concat(next);
      for (const o of pool) {
        if (Math.abs(a.x - o.x) > NEAR || Math.abs(a.y - o.y) > 6) continue;
        maybeMeet(vil, a, o);
      }
    }
  }
}

function maybeMeet(vil: Village, a: Villager, b: Villager): void {
  if (!available(vil, a) || !available(vil, b)) return;
  const ab = vil.peek(a, b.id);
  const ba = vil.peek(b, a.id);
  const soc = (a.traits.sociability + b.traits.sociability) / 2;
  // Where one of them is at a hub's work (serving ale, overseeing, the priest about the village), their setting decides.
  const fa = contextFactor(a);
  const fb = contextFactor(b);
  const hub = isHubWork(a) || isHubWork(b);
  const ctx = (hub ? Math.max(fa, fb) : Math.min(fa, fb)) * (a.act === b.act ? 1.4 : 1);
  const moving = Math.hypot(a.tx - a.x, a.ty - a.y) > 1 || Math.hypot(b.tx - b.x, b.ty - b.y) > 1;
  const known = (ab?.m ?? 0) > 0 || (ab?.k ?? 0) !== 0;
  const p = 0.016 * (0.4 + soc) * ctx * (moving ? 0.5 : 1) * (known ? 1 : 0.6);
  if (!vil.rng.chance(p)) return;
  const grudge = Math.max(ab?.g ?? 0, ba?.g ?? 0);
  const temper = (a.traits.temper + b.traits.temper) / 2;
  const moodBad = (a.mood + b.mood) / 2 < 0 ? 1.3 : 1;
  if (grudge > 0.3 && vil.rng.chance(Math.min(0.8, grudge * (0.4 + temper) * moodBad))) quarrel(vil, a, b);
  else chat(vil, a, b);
}

function faceEachOther(a: Villager, b: Villager): void {
  a.facing = b.x >= a.x ? 1 : -1;
  b.facing = a.x > b.x ? 1 : -1;
}

function pause(vil: Village, v: Villager, act: Act, other: Villager, seconds: number): void {
  v.act = act;
  v.with = other.id;
  v.tx = v.x;
  v.ty = v.y;
  v.until = vil.s.now + seconds * 1000;
  v.enter = false;
}

export function chat(vil: Village, a: Villager, b: Villager): void {
  const secs = 7 + vil.rng.next() * 14;
  pause(vil, a, Act.Chat, b, secs);
  pause(vil, b, Act.Chat, a, secs);
  faceEachOther(a, b);
  const ab = vil.tie(a, b.id);
  const ba = vil.tie(b, a.id);
  ab.m++;
  ba.m++;
  ab.t = ba.t = vil.s.now;
  const compat = 1 - Math.abs(a.traits.sociability - b.traits.sociability) * 0.6 - Math.abs(vil.age(a) - vil.age(b)) / 80;
  const warm = 0.012 + 0.03 * Math.max(0, compat) + (ab.k !== Kin.None ? 0.01 : 0);
  ab.a = clamp(ab.a + warm * (0.7 + vil.rng.next() * 0.6), -1, 1);
  ba.a = clamp(ba.a + warm * (0.7 + vil.rng.next() * 0.6), -1, 1);
  // Talk takes the edge off an old grudge, a little.
  for (const [x, y, t] of [[a, b, ab], [b, a, ba]] as const) {
    if (t.g > 0) {
      const before = t.g;
      t.g = Math.max(0, t.g - 0.03 - 0.02 * (1 - x.traits.temper));
      if (before >= 0.18 && t.g < 0.18 && vil.rng.chance(0.6)) {
        vil.hist(x, { k: "reconciled", o: y.id, on: vil.first(y), d: t.gc });
        vil.s.counts.reconciliations++;
        const pl = lifeLines.peace(who(vil, x), who(vil, y));
        vil.emit({ kind: "reconcile", x: (a.x + b.x) / 2, actors: [x.id, y.id], text: `${vil.first(x)} and ${vil.first(y)} have made their peace`, data: { la: pl.la, en: pl.en } });
      }
    }
  }
  tell(vil, a, b);
  tell(vil, b, a);
  maybeCourt(vil, a, b);
  if (vil.live && vil.rng.chance(0.25)) vil.emit({ kind: "rumour", x: a.x, actors: [a.id, b.id], text: `${vil.first(a)} and ${vil.first(b)} stop to talk`, quiet: true, data: { chat: 1 } });
}

export function quarrel(vil: Village, a: Villager, b: Villager): void {
  const secs = 10 + vil.rng.next() * 10;
  pause(vil, a, Act.Argue, b, secs);
  pause(vil, b, Act.Argue, a, secs);
  faceEachOther(a, b);
  const ab = vil.tie(a, b.id);
  const ba = vil.tie(b, a.id);
  const cause = ab.gc ?? ba.gc ?? "an old matter";
  ab.g = clamp(ab.g + 0.07 + a.traits.temper * 0.05, 0, 1);
  ba.g = clamp(ba.g + 0.07 + b.traits.temper * 0.05, 0, 1);
  ab.gc = ba.gc = cause;
  ab.a = clamp(ab.a - 0.05, -1, 1);
  ba.a = clamp(ba.a - 0.05, -1, 1);
  a.mood = clamp(a.mood - 0.15, -1, 1);
  b.mood = clamp(b.mood - 0.15, -1, 1);
  ab.m++;
  ba.m++;
  vil.s.counts.quarrels++;
  vil.hist(a, { k: "quarrel", o: b.id, on: vil.first(b), d: cause });
  vil.hist(b, { k: "quarrel", o: a.id, on: vil.first(a), d: cause });
  const ql = lifeLines.quarrel(who(vil, a), who(vil, b));
  vil.emit({ kind: "quarrel", x: (a.x + b.x) / 2, actors: [a.id, b.id], text: `${vil.first(a)} and ${vil.first(b)} quarrel over ${cause}`, data: { la: ql.la, en: ql.en } });

  // Those who see it start a rumour, or add to it.
  const witnesses = vil.living().filter((w) => w.id !== a.id && w.id !== b.id && !w.inside && w.act !== Act.Sleep && Math.abs(w.x - a.x) < 18 && vil.age(w) >= 8);
  const heavy = ab.g > 0.75 || ba.g > 0.75;
  if (witnesses.length) {
    const existing = vil.s.rumours.find((r) => r.kind === "quarrel" && r.subj.includes(a.id) && r.subj.includes(b.id));
    const w0 = witnesses[0];
    const r = existing ?? startRumour(vil, "quarrel", [a.id, b.id], w0, heavy ? 1 : 0);
    for (const w of witnesses) if (!w.rumours[r.id]) hear(vil, w, r, heavy ? 1 : 0, w.id);
  }

  // The priest comes to make peace, if he is near and free.
  const priest = vil.living().find((p) => p.trade === "priest" && interruptible(p) && Math.abs(p.x - a.x) < 30);
  if (priest) {
    priest.act = Act.Visit;
    priest.target = a.id;
    priest.with = b.id;
    priest.tx = (a.x + b.x) / 2 + 2;
    priest.ty = Math.min(84, a.y + 1.5);
    priest.until = vil.s.now + 60_000;
    priest.mediate = true;
    priest.enter = false;
  } else if (heavy) {
    // Came to blows: the reeve fines them both, if he saw.
    const reeve = vil.living().find((r) => r.trade === "reeve" && !r.inside && Math.abs(r.x - a.x) < 40);
    if (reeve && reeve.id !== a.id && reeve.id !== b.id) {
      for (const x of [a, b]) {
        vil.hist(x, { k: "fined", o: reeve.id, on: vil.first(reeve), d: "for a brawl" });
        const t = vil.tie(x, reeve.id);
        t.g = clamp(t.g + 0.2, 0, 1);
        t.gc = t.gc ?? "a fine for brawling";
        t.a = clamp(t.a - 0.1, -1, 1);
      }
    }
  }
}

/** The priest, arriving at a quarrel, reconciles them. */
export function makePeace(vil: Village, priest: Villager): void {
  const a = vil.get(priest.target);
  const b = vil.get(priest.with);
  priest.mediate = false;
  if (!a || !b) return;
  for (const [x, y] of [[a, b], [b, a]] as const) {
    const t = vil.tie(x, y.id);
    t.g = Math.max(0, t.g - 0.22 * (0.5 + x.traits.piety));
    t.a = clamp(t.a + 0.05, -1, 1);
    const tp = vil.tie(x, priest.id);
    tp.a = clamp(tp.a + 0.04, -1, 1);
  }
  vil.s.counts.reconciliations++;
  const pl = lifeLines.priestMakesPeace(who(vil, a), who(vil, b));
  vil.emit({ kind: "reconcile", x: priest.x, actors: [priest.id, a.id, b.id], text: `the priest makes peace between ${vil.first(a)} and ${vil.first(b)}`, data: { priest: 1, la: pl.la, en: pl.en } });
  priest.until = vil.s.now + 8000;
}

// ---------------------------------------------------------------------------
// Courtship
// ---------------------------------------------------------------------------

export function eligible(vil: Village, v: Villager): boolean {
  const age = vil.age(v);
  return v.alive && v.spouse < 0 && v.betrothed < 0 && age >= MARRY_AGE.min && age <= MARRY_AGE.max && v.trade !== "priest" && v.sick < 0.3;
}

function closeKin(vil: Village, a: Villager, b: Villager): boolean {
  const k = a.ties[b.id]?.k ?? Kin.None;
  if (k !== Kin.None && k !== Kin.InLaw) return true;
  return a.parents.some((p) => p >= 0 && b.parents.includes(p));
}

function maybeCourt(vil: Village, a: Villager, b: Villager): void {
  if (a.sex === b.sex) return;
  if (!eligible(vil, a) || !eligible(vil, b)) return;
  if (closeKin(vil, a, b)) return;
  const ab = vil.tie(a, b.id);
  const ba = vil.tie(b, a.id);
  if (a.courting === b.id) {
    ab.a = clamp(ab.a + 0.02, -1, 1);
    ba.a = clamp(ba.a + 0.02, -1, 1);
    courtingWalk(vil, a, 60);
    return;
  }
  if (a.courting >= 0 || b.courting >= 0) return;
  if (ab.a < 0.32 || ba.a < 0.32) return;
  const ageGap = Math.abs(vil.age(a) - vil.age(b));
  if (ageGap > 14) return;
  if (!vil.rng.chance(0.18 * (1 - ageGap / 20))) return;
  a.courting = b.id;
  b.courting = a.id;
  vil.hist(a, { k: "courting", o: b.id, on: vil.first(b) });
  vil.hist(b, { k: "courting", o: a.id, on: vil.first(a) });
  const cl = lifeLines.courting(who(vil, a), who(vil, b));
  vil.emit({ kind: "betrothal", x: a.x, actors: [a.id, b.id], text: `${vil.first(a)} and ${vil.first(b)} are walking out`, data: { courting: 1, la: cl.la, en: cl.en } });
  const w = vil.living().find((x) => x.id !== a.id && x.id !== b.id && !x.inside && Math.abs(x.x - a.x) < 20 && vil.age(x) >= 10);
  if (w) startRumour(vil, "courting", [a.id, b.id], w);
}

/** Courting couples grow fonder on their walks, and in time are betrothed. */
export function courtingWalk(vil: Village, v: Villager, seconds: number): void {
  const o = vil.get(v.courting);
  if (!o || !o.alive) {
    v.courting = -1;
    return;
  }
  const t = vil.tie(v, o.id);
  t.a = clamp(t.a + 0.0003 * seconds * (0.6 + vil.rng.next()), -1, 1);
  const o2 = vil.tie(o, v.id);
  o2.a = clamp(o2.a + 0.00025 * seconds * (0.6 + vil.rng.next()), -1, 1);
  const back = vil.tie(o, v.id);
  if (t.a > 0.78 && back.a > 0.74 && v.betrothed < 0 && o.betrothed < 0 && eligible(vil, v) && eligible(vil, o)) {
    betroth(vil, v, o);
  }
  // Sometimes it comes to nothing.
  if (t.a < 0.15) {
    v.courting = -1;
    o.courting = -1;
  }
}

function betroth(vil: Village, a: Villager, b: Villager): void {
  a.betrothed = b.id;
  b.betrothed = a.id;
  vil.hist(a, { k: "betrothed", o: b.id, on: vil.first(b) });
  vil.hist(b, { k: "betrothed", o: a.id, on: vil.first(a) });
  // The wedding at the church door, the next morning (or the one after).
  const e = vil.env;
  const hoursToTen = ((24 + 10 - e.hour) % 24) + (e.hour > 6 ? 24 : 0);
  vil.s.weddings.push({ a: a.id, b: b.id, at: vil.s.now + hoursToTen * 3_600_000, started: false, done: false, guests: [] });
  const bl = lifeLines.betrothed(who(vil, a), who(vil, b));
  vil.emit({ kind: "betrothal", x: a.x, actors: [a.id, b.id], text: `${vil.first(a)} and ${vil.first(b)} are betrothed`, data: { la: bl.la, en: bl.en } });
}

// ---------------------------------------------------------------------------
// Slow drift of feeling
// ---------------------------------------------------------------------------

/** Every life tick: grudges fade unless fed, feelings settle. */
export function drift(vil: Village, seconds: number): void {
  const hours = seconds / 3600;
  for (const v of vil.living()) {
    for (const k in v.ties) {
      const t = v.ties[k];
      if (t.g > 0) t.g = Math.max(0, t.g - 0.006 * hours * (1.2 - v.traits.temper));
      // Strong feeling fades a touch toward mild liking over weeks.
      if (t.k === Kin.None && Number(k) !== PILGRIM) t.a += (0.08 - t.a) * 0.002 * hours;
    }
  }
}

export { hear };
