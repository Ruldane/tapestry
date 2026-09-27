/**
 * What each villager does next. The day is shaped by the real hour (sleep,
 * meals, work, the evening), the week (mass on Sundays and holy days), the
 * month's labour, the weather, and the villager's trade, age, needs and
 * people. Nothing is scripted: this chooses among ordinary things.
 */
import { BELL_HOURS } from "./calendar";
import { CHILD_AGE, DT, MARRY_AGE, RATION, WALK } from "./constants";
import type { Village } from "./core";
import { cropTime, fieldRole, jobFor, JOB_WORK, type FieldJob } from "./fields";
import { BUILDING, MEADOW, PLACES, STRIPS, type Building, type Place, type PlaceId } from "./geography";
import { Act, Carry, PILGRIM, Work, type Villager } from "./types";

/** November to February (in the visitor's hemisphere): nothing is done in a garden. */
function wintry(vil: Village): boolean {
  const fm = vil.env.fm;
  return fm >= 10 || fm <= 1;
}

export interface Spot {
  x: number;
  y: number;
}

export function spot(vil: Village, p: Place): Spot {
  return { x: p.x + (vil.rng.next() - 0.5) * p.w, y: p.y + (vil.rng.next() - 0.5) * p.h };
}

export function at(vil: Village, id: PlaceId): Spot {
  return spot(vil, PLACES[id]);
}

export function door(vil: Village, b: Building, spread = 5): Spot {
  return { x: b.doorX + (vil.rng.next() - 0.5) * spread, y: b.y + 7 + vil.rng.next() * 2.5 };
}

const MIN = 60_000;

/** Set what a villager is doing, where, and for how long. */
export function assign(
  vil: Village,
  v: Villager,
  act: Act,
  where: Spot,
  minutes: number,
  opts: { work?: Work; carry?: Carry; target?: number; with?: number; inside?: boolean } = {},
): void {
  v.act = act;
  v.work = opts.work ?? Work.None;
  v.carry = opts.carry ?? Carry.None;
  v.target = opts.target ?? -1;
  v.with = opts.with ?? -1;
  v.tx = Math.max(2, Math.min(1660, where.x));
  v.ty = where.y;
  v.inside = false;
  v.progress = 0;
  // A little randomness so a crowd does not move as one.
  v.until = vil.s.now + minutes * MIN * (0.75 + vil.rng.next() * 0.5);
  v.enter = opts.inside ?? false;
  v.mediate = false;
}

export function speedFor(vil: Village, v: Villager): number {
  const age = vil.age(v);
  let s = age < 4 ? 3.2 : age < CHILD_AGE ? WALK.child : age >= 62 ? WALK.old : WALK.adult;
  if (v.sick > 0.2) s *= 0.6;
  if (v.fatigue > 0.8) s *= 0.8;
  if (v.carry === Carry.Grain || v.carry === Carry.Bier) s *= 0.75;
  return s * (0.9 + ((v.id * 7919) % 100) / 500);
}

// ---------------------------------------------------------------------------
// The day
// ---------------------------------------------------------------------------

function mealTime(h: number, wake: number): "breakfast" | "dinner" | "supper" | null {
  if (h >= wake && h < wake + 0.45) return "breakfast";
  if (h >= 11.6 && h < 12.4) return "dinner";
  if (h >= 18.4 && h < 19) return "supper";
  return null;
}

/** Choose the next activity. Called when the current one runs out. */
export function decide(vil: Village, v: Villager): void {
  const e = vil.env;
  const age = vil.age(v);
  const home = vil.home(v);
  const h = e.hour;

  // Babes in arms go where their mother goes.
  if (age < 2.5) {
    const mother = vil.get(v.parents[1]);
    if (mother && mother.alive && mother.household === v.household) {
      assign(vil, v, mother.act === Act.Sleep ? Act.Sleep : Act.Rest, { x: mother.x, y: mother.y }, 3, { target: mother.id, inside: mother.inside });
      return;
    }
    assign(vil, v, e.night ? Act.Sleep : Act.Rest, door(vil, home, 2), 20, { inside: true });
    return;
  }

  if (v.sick > 0.45) {
    assign(vil, v, Act.Sick, door(vil, home, 2), 30, { inside: true });
    return;
  }

  // On a night of falling stars or a comet, people stay up to look.
  const lookingUp = e.skyShow && (e.hour >= 17 || e.hour < 1) && e.hour < e.bed + (e.sky.comet ? 1.5 : 1);
  if (lookingUp && age >= 5 && vil.rng.chance(e.sky.comet ? 0.65 : 0.45)) {
    assign(vil, v, Act.SkyWatch, vil.rng.chance(0.7) ? at(vil, "green") : door(vil, home, 10), 25);
    return;
  }
  if (e.night) {
    if (v.trade === "alewife" && h >= e.bed && h < e.bed + 0.6) {
      assign(vil, v, Act.Work, at(vil, "alehouse"), 15, { work: Work.Serve });
      return;
    }
    if (v.trade === "shepherd" && e.fm === 3 && vil.rng.chance(0.5)) {
      // Lambing: the shepherd sits up with the ewes.
      assign(vil, v, Act.Work, at(vil, "fold"), 60, { work: Work.Herd });
      return;
    }
    assign(vil, v, Act.Sleep, door(vil, home, 3), 40, { inside: true });
    return;
  }

  const meal = mealTime(h, e.wake);
  const harvestField = e.labours.includes("harvest") && meal === "dinner" && age >= 12 && v.act === Act.Work && v.work === Work.Reap;
  if (meal && !harvestField && v.trade !== "priest") {
    // In the warm months many eat out of doors, on the bench by the door.
    const outdoors = e.fm >= 4 && e.fm <= 8 && e.rain < 0.15 && meal !== "breakfast" && vil.rng.chance(0.4);
    const minutes = age < CHILD_AGE ? 10 : meal === "dinner" ? 35 : 22;
    assign(vil, v, Act.Eat, door(vil, home, outdoors ? 9 : 3), minutes, { inside: !outdoors });
    return;
  }
  if (harvestField) {
    assign(vil, v, Act.Eat, { x: v.x, y: v.y }, 25);
    return;
  }

  // Mass on Sundays and holy days, in the morning.
  if (e.holy && h >= 8.6 && h < 10.2 && (v.trade !== "shepherd" || vil.rng.chance(0.3))) {
    assign(vil, v, Act.Service, at(vil, "nave"), 60, { inside: true });
    return;
  }

  const workEnd = Math.min(e.set - 0.3, 18.4);
  const working = h >= e.wake + 0.45 && h < workEnd;
  const feastDay = e.feast !== null && (e.feast.holy || e.labours.includes("feasting"));

  if (working && !(feastDay && h > 12)) {
    if (age < CHILD_AGE) {
      child(vil, v, age);
      return;
    }
    if (work(vil, v, age)) return;
  }

  if (feastDay && h > 12 && !e.night) {
    leisure(vil, v, age, true);
    return;
  }
  leisure(vil, v, age, false);
}

// ---------------------------------------------------------------------------
// Children
// ---------------------------------------------------------------------------

function child(vil: Village, v: Villager, age: number): void {
  const e = vil.env;
  const home = vil.home(v);
  if (age < 4.5) {
    // Toddlers stay by the door.
    assign(vil, v, Act.Play, door(vil, home, 8), 12);
    return;
  }
  if (v.trade === "goosegirl") {
    assign(vil, v, Act.Work, at(vil, "pond"), 40, { work: Work.Geese });
    return;
  }
  if (age >= 7 && e.labours.includes("sowing") && vil.rng.chance(0.4)) {
    const s = STRIPS[vil.rng.int(0, STRIPS.length)];
    assign(vil, v, Act.Work, { x: (s.x0 + s.x1) / 2, y: 66 + vil.rng.next() * 12 }, 30, { work: Work.Scare });
    return;
  }
  if (age >= 7 && (e.labours.includes("harvest") || e.labours.includes("threshing")) && vil.rng.chance(0.45)) {
    const s = STRIPS[vil.rng.int(0, STRIPS.length)];
    assign(vil, v, Act.Work, { x: (s.x0 + s.x1) / 2, y: 70 + vil.rng.next() * 12 }, 30, { work: Work.Glean });
    return;
  }
  if (age >= 8 && vil.rng.chance(0.15)) {
    assign(vil, v, Act.Fetch, at(vil, "well"), 10, { carry: Carry.Water, target: -2 });
    return;
  }
  // Play: on the green, by home, at the pond, or at the edge of the wood.
  const r = vil.rng.next();
  const where = r < 0.4 ? at(vil, "green") : r < 0.7 ? door(vil, home, 26) : r < 0.85 ? at(vil, "pond") : { x: 20 + vil.rng.next() * 140, y: 74 + vil.rng.next() * 9 };
  assign(vil, v, Act.Play, where, 14);
}

// ---------------------------------------------------------------------------
// Work
// ---------------------------------------------------------------------------

const INDOOR_RAIN = 0.55;

function work(vil: Village, v: Villager, age: number): boolean {
  const e = vil.env;
  const home = vil.home(v);
  const wet = e.rain > INDOOR_RAIN;
  const old = age >= 62;
  const L = e.labours;

  // Household needs come first: flour for the week.
  if (carryGrainIfNeeded(vil, v, age)) return true;

  switch (v.trade) {
    case "priest":
      return priest(vil, v);
    case "miller":
      assign(vil, v, Act.Work, at(vil, "mill"), 40, { work: Work.Mill });
      return true;
    case "baker":
      if (e.hour < 12) {
        assign(vil, v, Act.Work, at(vil, "bakehouse"), 50, { work: Work.Bake });
        return true;
      }
      break;
    case "alewife":
      assign(vil, v, Act.Work, door(vil, BUILDING.alehouse, 10), 45, { work: e.hour < 15 ? Work.Brew : Work.Serve });
      return true;
    case "smith":
      assign(vil, v, Act.Work, at(vil, "smithy"), 45, { work: Work.Smith });
      return true;
    case "weaver":
      assign(vil, v, Act.Work, door(vil, home, 3), 50, { work: Work.Weave });
      return true;
    case "shepherd":
      return shepherd(vil, v);
    case "swineherd":
      if (L.includes("pannage")) {
        assign(vil, v, Act.Work, at(vil, "pannage"), 50, { work: Work.Pannage });
        return true;
      }
      if (vil.rng.chance(0.5)) {
        assign(vil, v, Act.Work, door(vil, home, 30), 40, { work: Work.Pannage });
        return true;
      }
      break;
    case "woodward":
      assign(vil, v, Act.Work, at(vil, "forest"), 50, { work: vil.rng.chance(0.6) ? Work.Woodcut : Work.Oversee });
      return true;
    case "carpenter": {
      const b = vil.s.builds[0];
      if (b) {
        const target = b.building === "bridge" ? { x: 690 + vil.rng.range(-10, 10), y: 76 } : door(vil, BUILDING[b.building], 12);
        assign(vil, v, Act.Repair, target, 40, { work: Work.Carpenter });
        return true;
      }
      assign(vil, v, Act.Work, door(vil, home, 12), 45, { work: Work.Carpenter });
      return true;
    }
    case "thatcher":
      if (!wet && e.fm >= 3 && e.fm <= 9) {
        const roofs = ["cottage-a", "cottage-b", "cottage-c", "cottage-d", "cottage-e", "westcroft", "eastcroft", "millhouse", "swineherd"];
        const b = BUILDING[roofs[(vil.env.dayNumber + v.id) % roofs.length]];
        assign(vil, v, Act.Work, { x: b.x + vil.rng.range(-4, 4), y: b.y + 6 }, 60, { work: Work.Thatch, target: -3 });
        return true;
      }
      break;
    case "reeve":
      if (vil.rng.chance(0.7)) return reeve(vil, v);
      break;
    case "lord":
      if (vil.rng.chance(0.75)) {
        assign(vil, v, Act.Rest, door(vil, BUILDING.manor, 6), 45, { inside: vil.rng.chance(0.5), work: Work.Office });
        return true;
      }
      assign(vil, v, Act.Wander, vil.rng.chance(0.5) ? at(vil, "garden") : fieldSpot(vil), 30, { work: Work.Oversee });
      return true;
    case "lady":
      if (wintry(vil)) assign(vil, v, Act.Work, door(vil, BUILDING.manor, 6), 45, { work: Work.Spin });
      else assign(vil, v, Act.Work, vil.rng.chance(0.6) ? at(vil, "garden") : door(vil, BUILDING.manor, 6), 45, { work: vil.rng.chance(0.6) ? Work.Garden : Work.Spin });
      return true;
    case "steward":
      assign(vil, v, Act.Work, vil.rng.chance(0.5) ? at(vil, "barn") : fieldSpot(vil), 40, { work: Work.Oversee });
      return true;
    case "servant":
      if (vil.rng.chance(0.3)) {
        assign(vil, v, Act.Fetch, at(vil, "well"), 12, { carry: Carry.Water, target: -2 });
        return true;
      }
      if (v.sex === 0 && fieldWork(vil, v)) return true;
      assign(vil, v, Act.Work, vil.rng.chance(0.5) ? at(vil, "barn") : door(vil, BUILDING.manor, 12), 40, { work: v.sex === 0 ? Work.Thresh : Work.Spin });
      return true;
  }

  if (old) {
    assign(vil, v, Act.Rest, door(vil, home, 4), 40, { work: Work.Spin });
    return true;
  }

  if (wet) {
    if (v.sex === 0 && vil.rng.chance(0.5)) {
      assign(vil, v, Act.Work, at(vil, "barn"), 40, { work: Work.Thresh });
      return true;
    }
    assign(vil, v, Act.Work, door(vil, home, 2), 40, { work: Work.Spin, inside: true });
    return true;
  }

  // The month's labour.
  if (v.sex === 1 && vil.rng.chance(0.2)) {
    assign(vil, v, Act.Fetch, at(vil, "well"), 12, { carry: Carry.Water, target: -2 });
    return true;
  }
  if (L.includes("haymaking") && hayWork(vil, v)) return true;
  if (L.includes("shearing") && vil.rng.chance(0.25)) {
    assign(vil, v, Act.Work, at(vil, "fold"), 40, { work: Work.Shear });
    return true;
  }
  if (fieldWork(vil, v)) return true;
  // Firewood from the wood, most in the cold months.
  const cold = e.fm >= 9 || e.fm <= 2;
  if (vil.rng.chance(cold ? 0.2 : 0.08)) {
    assign(vil, v, Act.Fetch, at(vil, "forest"), 25, { carry: Carry.None, target: -4, work: Work.Woodcut });
    return true;
  }
  if (L.includes("threshing") || L.includes("slaughter") || e.fm === 0) {
    if (L.includes("slaughter") && vil.rng.chance(0.3)) {
      assign(vil, v, Act.Work, door(vil, home, 10), 40, { work: Work.Slaughter });
      return true;
    }
    if (v.sex === 0 && vil.rng.chance(0.55)) {
      assign(vil, v, Act.Work, at(vil, "barn"), 45, { work: Work.Thresh });
      return true;
    }
  }
  if ((L.includes("pruning") || e.fm === 0 || e.fm === 11) && v.sex === 0) {
    assign(vil, v, Act.Work, vil.rng.chance(0.5) ? at(vil, "forest") : at(vil, "cross"), 45, { work: vil.rng.chance(0.5) ? Work.Woodcut : Work.Prune });
    return true;
  }
  if (L.includes("weeding") && vil.rng.chance(0.6)) {
    const s = ownStrip(vil, v) ?? STRIPS[vil.rng.int(0, STRIPS.length)];
    assign(vil, v, Act.Work, { x: vil.rng.range(s.x0 + 1, s.x1 - 1), y: vil.rng.range(66, 81) }, 45, { work: Work.Weed, target: s.id });
    return true;
  }
  // Otherwise the garden and the house; in the dead of winter, the flail and the spindle.
  const winter = wintry(vil);
  assign(vil, v, Act.Work, door(vil, home, 14), 45, { work: v.sex === 1 ? (winter || vil.rng.chance(0.5) ? Work.Spin : Work.Garden) : winter ? Work.Thresh : Work.Dig });
  return true;
}

function fieldSpot(vil: Village): Spot {
  const s = STRIPS[vil.rng.int(0, STRIPS.length)];
  return { x: (s.x0 + s.x1) / 2, y: 82 };
}

function ownStrip(vil: Village, v: Villager) {
  const h = vil.household(v.household);
  if (!h || !h.strips.length) return null;
  return STRIPS[h.strips[vil.rng.int(0, h.strips.length)]];
}

/** Pick a strip that is waiting for work and go and do it. */
function fieldWork(vil: Village, v: Villager): boolean {
  const e = vil.env;
  const ct = cropTime(e.fm, e.frac);
  const hh = vil.household(v.household);
  let best: { id: number; job: FieldJob; score: number } | null = null;
  for (const s of vil.s.strips) {
    const role = fieldRole(STRIPS[s.id].field, e.cropYear);
    const job = jobFor(s, role, ct);
    if (!job) continue;
    if (job === "plough" && v.sex === 1) continue;
    if (job === "sow" && vil.age(v) < 15) continue;
    let score = vil.rng.next() * 0.5;
    if (hh && s.owner === hh.id) score += 2;
    else if (s.owner === -1) score += v.trade === "servant" || v.trade === "labourer" ? 1.2 : 0.7;
    else {
      const owner = vil.household(s.owner);
      const kin = owner?.members.some((m) => {
        const t = v.ties[m];
        return t && (t.k !== 0 || t.a > 0.4);
      });
      score += kin ? 1 : 0.15;
    }
    score += Math.min(1, s.work / JOB_WORK[job]) * 0.6;
    if (!best || score > best.score) best = { id: s.id, job, score };
  }
  if (!best) return false;
  const st = STRIPS[best.id];
  const w =
    best.job === "plough" ? Work.Plough : best.job === "sow" ? Work.Sow : best.job === "reap" ? (v.sex === 1 && vil.rng.chance(0.5) ? Work.Bind : Work.Reap) : Work.Cart;
  assign(vil, v, Act.Work, { x: vil.rng.range(st.x0 + 1.5, st.x1 - 1.5), y: vil.rng.range(64, 81) }, 40, {
    work: w,
    target: best.id,
    carry: best.job === "sow" ? Carry.Grain : best.job === "cart" ? Carry.Sheaf : Carry.None,
  });
  return true;
}

function hayWork(vil: Village, v: Villager): boolean {
  const m = vil.s.meadow;
  if (m.carted >= 1) return false;
  const job = m.mown < 1 ? (v.sex === 0 ? Work.Mow : Work.Rake) : m.stacked < 1 ? Work.Rake : Work.Cart;
  if (m.mown < 0.05 && v.sex === 1) return false;
  assign(vil, v, Act.Work, { x: vil.rng.range(MEADOW.x0 + 3, MEADOW.x1 - 3), y: vil.rng.range(68, 83) }, 45, {
    work: job,
    carry: job === Work.Cart ? Carry.Hay : Carry.None,
  });
  return true;
}

function priest(vil: Village, v: Villager): boolean {
  const e = vil.env;
  const bell = BELL_HOURS[Math.max(0, e.bell)];
  if (bell && e.hour - bell.hour < 0.4) {
    assign(vil, v, Act.Pray, at(vil, "nave"), 20, { work: Work.Office, inside: true });
    return true;
  }
  const sick = vil.living().filter((o) => o.sick > 0.3 && o.id !== v.id);
  if (sick.length && vil.rng.chance(0.6)) {
    const o = vil.rng.pick(sick);
    assign(vil, v, Act.Visit, door(vil, vil.home(o), 4), 20, { target: o.id });
    return true;
  }
  if (vil.rng.chance(0.45)) {
    assign(vil, v, Act.Wander, at(vil, "green"), 20);
    return true;
  }
  if (vil.rng.chance(0.4)) {
    assign(vil, v, Act.Pray, at(vil, "churchyard"), 20);
    return true;
  }
  assign(vil, v, Act.Work, door(vil, BUILDING.priesthouse, 10), 30, { work: wintry(vil) ? Work.Office : Work.Garden });
  return true;
}

function reeve(vil: Village, v: Villager): boolean {
  // Go where the most people are working, and watch.
  const workers = vil.living().filter((o) => o.act === Act.Work && o.id !== v.id && vil.age(o) >= 14);
  if (!workers.length) return false;
  const o = vil.rng.pick(workers);
  assign(vil, v, Act.Work, { x: o.tx + vil.rng.range(-8, 8), y: Math.min(84, o.ty + vil.rng.range(-2, 3)) }, 25, { work: Work.Oversee });
  return true;
}

function shepherd(vil: Village, v: Villager): boolean {
  const e = vil.env;
  const flood = vil.s.river.level > 0.66;
  let where: Spot;
  if (flood) where = at(vil, "highGround");
  else if (e.labours.includes("shearing") || e.labours.includes("lambing")) where = at(vil, "fold");
  else if (vil.s.meadow.carted >= 1 && e.fm >= 6 && e.fm <= 9 && (e.dayNumber + v.id) % 3 === 0) where = at(vil, "meadow");
  else where = at(vil, "common");
  assign(vil, v, Act.Work, where, 50, { work: e.labours.includes("shearing") ? Work.Shear : Work.Herd });
  return true;
}

// ---------------------------------------------------------------------------
// The mill run
// ---------------------------------------------------------------------------

/** Days of flour a household wants in hand before someone goes to the mill. */
const FLOUR_DAYS = 3;

export function householdRation(vil: Village, hid: number): number {
  const h = vil.household(hid);
  if (!h) return 0;
  let r = 0;
  for (const id of h.members) {
    const m = vil.get(id);
    if (m && m.alive) r += vil.age(m) < CHILD_AGE ? 0.6 : 1;
  }
  return r * RATION;
}

function carryGrainIfNeeded(vil: Village, v: Villager, age: number): boolean {
  if (age < 14 || age > 66) return false;
  const h = vil.household(v.household);
  if (!h || h.building === "manor" || h.building === "millhouse") return false;
  const daily = householdRation(vil, h.id);
  if (h.flour > daily * FLOUR_DAYS || h.grain < 0.5) return false;
  // Someone else of the house already on the way?
  if (h.members.some((id) => id !== v.id && vil.get(id)?.carry === Carry.Grain)) return false;
  if (vil.s.mill.queue.some((q) => q.household === h.id)) return false;
  if (!vil.rng.chance(v.sex === 1 ? 0.7 : 0.4)) return false;
  assign(vil, v, Act.Carry, at(vil, "mill"), 30, { carry: Carry.Grain, target: h.id });
  return true;
}

// ---------------------------------------------------------------------------
// The evening, and feast days
// ---------------------------------------------------------------------------

function leisure(vil: Village, v: Villager, age: number, feast: boolean): void {
  const e = vil.env;
  const home = vil.home(v);
  const t = v.traits;

  if (age < CHILD_AGE) {
    if (e.daylight < 0.35) {
      assign(vil, v, Act.Rest, door(vil, home, 3), 15, { inside: true });
      return;
    }
    assign(vil, v, feast && vil.rng.chance(0.4) ? Act.Dance : Act.Play, vil.rng.chance(0.6) ? at(vil, "green") : door(vil, home, 20), 12);
    return;
  }

  if (v.trade === "priest") {
    const vespers = e.hour >= 18 && e.hour < 18.5;
    if (vespers) {
      assign(vil, v, Act.Pray, at(vil, "nave"), 25, { work: Work.Office, inside: true });
      return;
    }
    assign(vil, v, vil.rng.chance(0.5) ? Act.Wander : Act.Rest, vil.rng.chance(0.5) ? at(vil, "green") : door(vil, home, 4), 20);
    return;
  }

  if (v.trade === "alewife") {
    assign(vil, v, Act.Work, door(vil, BUILDING.alehouse, 12), 30, { work: Work.Serve });
    return;
  }

  // Mourners visit the grave.
  if (v.mourningUntil > vil.s.now && vil.rng.chance(0.35)) {
    assign(vil, v, Act.Mourn, at(vil, "churchyard"), 12);
    return;
  }

  // Courting couples find each other on the green or by the brook.
  const c = vil.get(v.courting);
  if (c && c.alive && vil.rng.chance(0.55)) {
    const where = vil.rng.chance(0.5) ? at(vil, "green") : at(vil, "meadow");
    assign(vil, v, Act.Court, where, 25, { with: c.id });
    if (c.act !== Act.Court && c.act !== Act.Sleep && c.act !== Act.Sick && !c.inside) assign(vil, c, Act.Court, { x: where.x + 1.5, y: where.y }, 25, { with: v.id });
    return;
  }

  // Visit the sick among kin and friends.
  for (const k in v.ties) {
    const o = vil.get(Number(k));
    if (o && o.alive && o.sick > 0.3 && (v.ties[k].k !== 0 || v.ties[k].a > 0.45) && vil.rng.chance(0.35)) {
      assign(vil, v, Act.Visit, door(vil, vil.home(o), 4), 20, { target: o.id });
      return;
    }
  }

  const drinkChance = (0.18 + t.sociability * 0.4) * (feast || e.sunday ? 1.6 : 1) * (v.sex === 0 ? 1 : 0.55) * (age >= MARRY_AGE.min ? 1 : 0.4);
  if (e.hour > 16 && vil.rng.chance(Math.min(0.85, drinkChance))) {
    assign(vil, v, Act.Drink, at(vil, "alehouse"), 40);
    return;
  }
  if (feast && age < 35 && vil.rng.chance(0.5)) {
    assign(vil, v, Act.Dance, at(vil, "green"), 25);
    return;
  }
  // Visit a friend or kin.
  if (vil.rng.chance(0.35 * (0.5 + t.sociability))) {
    const friends = Object.entries(v.ties).filter(([, tt]) => tt.a > 0.35);
    if (friends.length) {
      const o = vil.get(Number(vil.rng.pick(friends)[0]));
      if (o && o.alive && o.household !== v.household) {
        assign(vil, v, Act.Visit, door(vil, vil.home(o), 6), 20, { target: o.id });
        return;
      }
    }
  }
  if (vil.rng.chance(0.25) && e.daylight > 0.3) {
    assign(vil, v, Act.Wander, at(vil, "green"), 15);
    return;
  }
  // Sit by the door and spin, or rest.
  assign(vil, v, Act.Rest, door(vil, home, 5), 20, { work: v.sex === 1 && vil.rng.chance(0.6) ? Work.Spin : Work.None, inside: e.rain > 0.4 });
}

export function isBusyTogether(v: Villager): boolean {
  return v.act === Act.Chat || v.act === Act.Argue || v.act === Act.Funeral || v.act === Act.Wedding || v.act === Act.Baptism || v.act === Act.Sermon;
}

/** Things a villager will drop for a chat or to look at the stranger. */
export function interruptible(v: Villager): boolean {
  switch (v.act) {
    case Act.Sleep:
    case Act.Sick:
    case Act.Service:
    case Act.Funeral:
    case Act.Wedding:
    case Act.Baptism:
    case Act.Sermon:
    case Act.Chat:
    case Act.Argue:
    case Act.SaveFlock:
    case Act.Mourn:
      return false;
  }
  return !v.inside;
}

export const PILGRIM_ID = PILGRIM;
export const STEP_SECONDS = DT;
