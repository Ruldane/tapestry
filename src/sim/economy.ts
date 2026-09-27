/**
 * Bread and work: the strips through the year, the harvest and the tithe,
 * the mill and the miller's toll, stores that run down through the winter,
 * hunger when they run out, and alms from the manor.
 */
import { growingQuality, HOUR_MS } from "./calendar";
import { addEntry } from "./chronicle";
import { LIFE_YEAR_MS, STRIP_YIELD } from "./constants";
import { cottageBuilt } from "./life";
import type { Village } from "./core";
import { cropTime, fieldRole, finishJob, grow, jobFor, JOB_WORK, rollOver, type FieldJob } from "./fields";
import { STRIPS } from "./geography";
import { assign, at, door, householdRation } from "./schedule";
import { startRumour } from "./social";
import { Act, Carry, Work, type Animal, type Villager } from "./types";
import { chronicle as chronicleLines, life as lifeLines } from "../text/latin";

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

// ---------------------------------------------------------------------------
// Work done where it is done
// ---------------------------------------------------------------------------

const WORK_JOB: Partial<Record<number, FieldJob>> = {
  [Work.Plough]: "plough",
  [Work.Sow]: "sow",
  [Work.Reap]: "reap",
  [Work.Bind]: "reap",
  [Work.Cart]: "cart",
};

/** A villager who has arrived at their work puts in `dt` seconds of it. */
export function doWork(vil: Village, v: Villager, dt: number): void {
  const s = vil.s;
  if (v.act === Act.Work) {
    const job = WORK_JOB[v.work];
    if (job && v.target >= 0 && v.target < s.strips.length) {
      const strip = s.strips[v.target];
      const role = fieldRole(STRIPS[strip.id].field, vil.env.cropYear);
      const ct = cropTime(vil.env.fm, vil.env.frac);
      if (jobFor(strip, role, ct) !== job) {
        v.until = s.now; // the job is done or gone; find another
        return;
      }
      const oxen = job === "plough" && s.animals.some((a) => a.kind === "ox" && a.follow === v.id);
      const rate = job === "plough" ? (oxen ? 1.6 : 0.45) : vil.age(v) < 15 ? 0.5 : 1;
      strip.work += rate * dt;
      v.progress += dt;
      if (strip.work >= JOB_WORK[job]) {
        finishJob(strip, job);
        if (job === "sow") strip.care = ct > (role === 0 ? 1.6 : 6.6) ? 0.78 : 1;
        if (job === "cart") gather(vil, strip.id);
        vil.emit({ kind: "strip", x: (STRIPS[strip.id].x0 + STRIPS[strip.id].x1) / 2, actors: [v.id], text: `a strip is ${job === "plough" ? "ploughed" : job === "sow" ? "sown" : job === "reap" ? "reaped" : "carted"}`, quiet: true, data: { strip: strip.id, job } });
        v.until = s.now;
      }
      return;
    }
    if (v.work === Work.Mow || v.work === Work.Rake || (v.work === Work.Cart && v.carry === Carry.Hay)) {
      const m = s.meadow;
      const before = [Math.floor(m.mown * 6), Math.floor(m.stacked * 6), Math.floor(m.carted * 6)];
      if (v.work === Work.Mow) m.mown = Math.min(1, m.mown + dt / 150_000);
      else if (v.work === Work.Rake && m.stacked < m.mown) m.stacked = Math.min(m.mown, m.stacked + dt / 120_000);
      else if (v.work === Work.Cart && m.carted < m.stacked) m.carted = Math.min(m.stacked, m.carted + dt / 90_000);
      const after = [Math.floor(m.mown * 6), Math.floor(m.stacked * 6), Math.floor(m.carted * 6)];
      if (after.some((x, i) => x !== before[i])) vil.emit({ kind: "strip", x: 620, actors: [v.id], text: "the hay meadow changes", quiet: true, data: { meadow: 1 } });
      return;
    }
    if (v.work === Work.Mill) {
      grind(vil, v, dt);
      return;
    }
    if (v.work === Work.Slaughter) {
      v.progress += dt;
      if (v.progress > 600) slaughter(vil, v);
      return;
    }
  }
  if ((v.act === Act.Repair || (v.act === Act.Work && v.work === Work.Carpenter)) && s.builds.length) {
    const b = s.builds[0];
    if (b.building === "bridge" && s.river.level > 0.55) return; // too high to work
    b.work += dt * (v.trade === "carpenter" ? 1 : 0.5);
    if (b.work >= b.need) finishBuild(vil);
  }
}

/** Coarse carpentry for the absence model: the carpenter's hours, in bulk. */
export function buildTick(vil: Village, seconds: number): void {
  const b = vil.s.builds[0];
  if (!b) return;
  if (b.building === "bridge" && vil.s.river.level > 0.55) return;
  if (!vil.living().some((v) => v.trade === "carpenter")) return;
  b.work += seconds * 0.3;
  if (b.work >= b.need) finishBuild(vil);
}

function finishBuild(vil: Village): void {
  const s = vil.s;
  const b = s.builds.shift();
  if (!b) return;
  if (b.building === "bridge") {
    s.river.bridge = true;
    s.river.repair = s.now;
    vil.emit({ kind: "bridgeMended", x: 690, actors: [], text: "the bridge is mended", data: { la: "HIC PONS REFICITUR", en: "Here the bridge is mended" } });
    addEntry(vil, "bridgeMended", { la: "HIC PONS REFICITUR", en: "Here the bridge is mended" }, "river");
    return;
  }
  cottageBuilt(vil, b.building, b.for);
}

// ---------------------------------------------------------------------------
// The harvest
// ---------------------------------------------------------------------------

export function gather(vil: Village, stripId: number): void {
  const s = vil.s;
  const strip = s.strips[stripId];
  const q = growingQuality(s.seed, strip.year, vil.settings.place, vil.settings.weather);
  const yieldB = STRIP_YIELD * q * strip.care * (1 - strip.flood * 0.8);
  const tithe = yieldB * 0.1;
  s.churchGrain += tithe;
  if (strip.owner === -1) s.manorGrain += yieldB - tithe;
  else {
    const h = vil.household(strip.owner);
    if (h && !h.ended) h.grain += yieldB - tithe;
    else s.manorGrain += yieldB - tithe;
  }
  if (s.harvest.year !== strip.year) s.harvest = { year: strip.year, quality: q, gathered: 0 };
  s.harvest.gathered += yieldB;
  // When the last cropped strip of the year is in, the harvest goes in the chronicle.
  const cropped = s.strips.filter((st) => fieldRole(STRIPS[st.id].field, strip.year) !== 2);
  const waiting = cropped.some((st) => st.year === strip.year && (st.state === "ripe" || st.state === "reaped" || st.state === "green"));
  if (!waiting && !s.chronicle.some((c) => c.kind === "harvest" && c.t > s.now - 60 * 24 * HOUR_MS)) {
    const line = chronicleLines.harvest(q >= 0.85);
    addEntry(vil, "harvest", line, "fields");
    vil.emit({ kind: "harvestIn", x: 400, actors: [], text: line.en, data: { la: line.la, en: line.en, quality: Math.round(q * 100) } });
  }
}

/** Every ten seconds: the fields follow the calendar. */
export function fieldsTick(vil: Village): void {
  const s = vil.s;
  const e = vil.env;
  const ct = cropTime(e.fm, e.frac);
  for (const strip of s.strips) {
    const field = STRIPS[strip.id].field;
    if (strip.year < e.cropYear) {
      const r = rollOver(strip, fieldRole(field, e.cropYear), e.cropYear);
      if (r.lost) vil.emit({ kind: "strip", x: STRIPS[strip.id].x0, actors: [], text: "a strip's crop was left standing and lost", quiet: true, data: { strip: strip.id } });
      vil.emit({ kind: "strip", x: STRIPS[strip.id].x0, actors: [], text: "the fields turn to the new year", quiet: true, data: { strip: strip.id } });
      continue;
    }
    const role = fieldRole(field, e.cropYear);
    if (grow(strip, role, ct)) vil.emit({ kind: "strip", x: STRIPS[strip.id].x0, actors: [], text: "the corn grows", quiet: true, data: { strip: strip.id } });
    // Standing too long past ripe, the corn spoils.
    if (strip.state === "ripe" && ((role === 0 && ct > 11.05) || (role === 1 && ct > 11.7))) strip.care = Math.max(0.3, strip.care - 0.002);
  }
  // The meadow's year starts in the new farming year.
  const fy = e.lt.year;
  if (s.meadow.year !== fy) {
    const done = e.fm >= 7 ? 1 : e.fm === 6 ? 0.5 : 0;
    s.meadow = { year: fy, mown: done, stacked: done, carted: e.fm >= 7 ? 1 : 0 };
  }
}

// ---------------------------------------------------------------------------
// Eating, and going without
// ---------------------------------------------------------------------------

/** Every ten seconds: households eat from their stores. */
export function eatTick(vil: Village, seconds: number): void {
  const s = vil.s;
  const days = seconds / 86_400;
  for (const h of s.households) {
    if (h.ended) continue;
    let need = householdRation(vil, h.id) * days;
    if (h.meat > 0) {
      const m = Math.min(h.meat, need * 0.4);
      h.meat -= m;
      need -= m;
    }
    const fromFlour = Math.min(h.flour, need);
    h.flour -= fromFlour;
    need -= fromFlour;
    if (need > 0) {
      // Pottage from unground grain goes less far.
      const fromGrain = Math.min(h.grain, need * 1.2);
      h.grain -= fromGrain;
      need -= fromGrain / 1.2;
    }
    if (h.building === "manor" && need > 0) {
      const m = Math.min(s.manorGrain, need);
      s.manorGrain -= m;
      need -= m;
    }
  }
}

export function householdShort(vil: Village, hid: number): boolean {
  const h = vil.household(hid);
  if (!h) return true;
  return h.flour + h.grain + h.meat < 0.02 && h.building !== "manor";
}

/** Personal needs, every step. */
export function needs(vil: Village, v: Villager, dt: number): void {
  const asleep = v.act === Act.Sleep;
  v.hunger = clamp(v.hunger + dt / (asleep ? 14 * 3600 : 7 * 3600), 0, 1);
  const arrived = Math.abs(v.tx - v.x) < 0.8;
  if (v.act === Act.Eat && arrived && !householdShort(vil, v.household)) v.hunger = Math.max(0.03, v.hunger - dt / 500);
  if (v.act === Act.Feast && arrived) v.hunger = Math.max(0.03, v.hunger - dt / 700);
  if (asleep) v.fatigue = clamp(v.fatigue - dt / (5 * 3600), 0, 1);
  else v.fatigue = clamp(v.fatigue + dt / (v.act === Act.Work ? 9 * 3600 : 18 * 3600), 0, 1);
  // Mood settles toward how life is.
  let target = 0.18;
  if (v.hunger > 0.6) target -= 0.45;
  if (v.sick > 0) target -= 0.35;
  if (v.mourningUntil > vil.s.now) target -= 0.35;
  if (v.courting >= 0 || v.betrothed >= 0) target += 0.2;
  if (vil.env.rain > 0.5) target -= 0.05;
  if (vil.env.feast) target += 0.12;
  v.mood += (target - v.mood) * (dt / 2400);
}

/** Hungry households ask the manor for alms, or kin, and a few take what is not theirs. */
export function hungerTick(vil: Village): void {
  const s = vil.s;
  for (const h of s.households) {
    if (h.ended || !householdShort(vil, h.id)) continue;
    const members = h.members.map((id) => vil.get(id)).filter((m): m is Villager => !!m && m.alive);
    const asker = members.find((m) => vil.age(m) >= 14 && m.sick < 0.3 && m.act !== Act.Sleep && m.act !== Act.Alms);
    if (!asker) continue;
    if (!vil.rng.chance(0.25)) continue;
    // Kin with food to spare first.
    const kinHouse = s.households.find((o) => {
      if (o.ended || o.id === h.id || o.grain < 20) return false;
      return o.members.some((id) => {
        const t = asker.ties[id];
        return t && (t.k !== 0 || t.a > 0.5);
      });
    });
    if (kinHouse) {
      const b = vil.home(vil.get(kinHouse.members[0])!);
      assign(vil, asker, Act.Alms, door(vil, b, 3), 20, { target: kinHouse.id });
    } else {
      assign(vil, asker, Act.Alms, at(vil, "manor"), 20, { target: -1 });
    }
  }
}

/** An asker arrives at a door. */
export function askAlms(vil: Village, v: Villager): void {
  const s = vil.s;
  const h = vil.household(v.household);
  if (!h) return;
  const want = householdRation(vil, h.id) * 4;
  if (v.target === -1) {
    if (s.manorGrain > 80) {
      const give = Math.min(want, s.manorGrain - 80);
      s.manorGrain -= give;
      h.grain += give;
      const lady = vil.living().find((x) => x.trade === "lady" || x.trade === "lord");
      if (lady) {
        const t = vil.tie(v, lady.id);
        t.a = clamp(t.a + 0.12, -1, 1);
      }
      vil.hist(v, { k: "alms", d: "was given grain at the manor" });
      const line = lifeLines.alms();
      vil.emit({ kind: "alms", x: v.x, actors: [v.id], text: `${vil.first(v)} is given grain at the manor`, data: { la: line.la, en: line.en } });
    } else {
      theft(vil, v, h.id);
    }
  } else {
    const kin = vil.household(v.target);
    if (kin && kin.grain > 20) {
      const give = Math.min(want, kin.grain * 0.15);
      kin.grain -= give;
      h.grain += give;
      for (const id of kin.members) {
        const o = vil.get(id);
        if (!o) continue;
        const t = vil.tie(v, o.id);
        t.a = clamp(t.a + 0.1, -1, 1);
      }
    }
  }
  v.until = s.now;
}

function theft(vil: Village, v: Villager, hid: number): void {
  if (v.traits.piety > 0.55 || !vil.rng.chance(0.3)) return;
  const victim = vil.s.households.filter((o) => !o.ended && o.id !== hid && o.grain > 15).sort((a, b) => b.grain - a.grain)[0];
  if (!victim) return;
  const take = Math.min(victim.grain * 0.1, householdRation(vil, hid) * 5);
  victim.grain -= take;
  const h = vil.household(hid)!;
  h.grain += take;
  const owner = vil.get(victim.members[0]);
  if (!owner) return;
  const t = vil.tie(owner, v.id);
  t.g = clamp(t.g + 0.45, 0, 1);
  t.gc = "barley taken from the store";
  t.a = clamp(t.a - 0.3, -1, 1);
  vil.hist(owner, { k: "grudge", o: v.id, on: vil.first(v), d: "barley taken from the store" });
  startRumour(vil, "theft", [v.id, owner.id], owner);
}

// ---------------------------------------------------------------------------
// The mill
// ---------------------------------------------------------------------------

/** A carrier arriving at the mill with a sack. */
export function bringSack(vil: Village, v: Villager): void {
  const s = vil.s;
  const h = vil.household(v.target);
  if (!h) return;
  const bushels = Math.min(h.grain, householdRation(vil, h.id) * 7 + 0.5);
  if (bushels <= 0.05) {
    v.carry = Carry.None;
    v.until = s.now;
    return;
  }
  h.grain -= bushels;
  s.mill.queue.push({ household: h.id, by: v.id, bushels, left: 110 + bushels * 70 });
  // Wait by the mill door.
  v.act = Act.Carry;
  v.carry = Carry.None;
  v.tx = 712 + vil.rng.range(-5, 5);
  v.ty = 75 + vil.rng.next() * 3;
  v.until = s.now + 45 * 60_000;
}

/** How fast the wheel turns the stones: slow in drought, stopped in spate. */
export function millPower(level: number): number {
  if (level > 0.86) return 0;
  return clamp(level * 2.3, 0.25, 1.3);
}

function grind(vil: Village, miller: Villager, dt: number): void {
  const s = vil.s;
  const sack = s.mill.queue[0];
  if (!sack) return;
  sack.left -= dt * millPower(s.river.level);
  if (sack.left > 0) return;
  s.mill.queue.shift();
  const toll = sack.bushels / 16;
  const mh = vil.household(miller.household);
  if (mh) mh.flour += toll;
  s.mill.ground += sack.bushels;
  const h = vil.household(sack.household);
  const carrier = vil.get(sack.by);
  if (carrier && carrier.alive && carrier.act === Act.Carry && Math.abs(carrier.x - 712) < 12 && h) {
    // Carry the flour home.
    carrier.carry = Carry.Flour;
    carrier.target = h.id;
    const home = vil.home(carrier);
    const d = door(vil, home, 3);
    carrier.tx = d.x;
    carrier.ty = d.y;
    carrier.until = s.now + 40 * 60_000;
    carrier.progress = sack.bushels - toll;
  } else if (h) {
    h.flour += sack.bushels - toll;
  }
  // Sometimes the toll seems too much.
  if (carrier && vil.rng.chance(0.08 * (0.5 + carrier.traits.suspicion))) {
    const t = vil.tie(carrier, miller.id);
    t.g = clamp(t.g + 0.12, 0, 1);
    t.gc = t.gc ?? "the mill toll";
  }
}

/** A carrier arriving home with flour. */
export function flourHome(vil: Village, v: Villager): void {
  const h = vil.household(v.household);
  if (h) h.flour += Math.max(0, v.progress);
  v.carry = Carry.None;
  v.progress = 0;
  v.until = vil.s.now;
}

// ---------------------------------------------------------------------------
// Beasts: the pig at Martinmas, lambs at lambing
// ---------------------------------------------------------------------------

function slaughter(vil: Village, v: Villager): void {
  const s = vil.s;
  v.progress = 0;
  v.until = s.now;
  const pig = s.animals.find((a) => a.alive && a.kind === "pig" && a.owner === v.household);
  if (!pig) return;
  pig.alive = false;
  const h = vil.household(v.household);
  if (h) h.meat += 6;
  if (!s.chronicle.some((c) => c.kind === "slaughter" && c.t > s.now - 40 * 24 * HOUR_MS)) {
    addEntry(vil, "slaughter", chronicleLines.slaughter(), "manor");
  }
}

export function beastsTick(vil: Village): void {
  const s = vil.s;
  const e = vil.env;
  // Lambs in the lambing month.
  if (e.fm === 3) {
    const ewes = s.animals.filter((a) => a.alive && a.kind === "sheep" && !a.young).length;
    const lambs = s.animals.filter((a) => a.alive && a.kind === "sheep" && a.young).length;
    if (lambs < ewes * 0.4 && vil.rng.chance(0.02)) addAnimal(vil, "sheep", -1, true);
  }
  // Pigs farrow in spring; a household keeps one or two.
  if ((e.fm === 3 || e.fm === 4) && vil.rng.chance(0.004)) {
    const h = vil.rng.pick(s.households.filter((x) => !x.ended && x.building !== "manor"));
    if (h && s.animals.filter((a) => a.alive && a.kind === "pig" && a.owner === h.id).length < 2) addAnimal(vil, "pig", h.id, true);
  }
  for (const a of s.animals) {
    if (!a.alive) continue;
    if (a.young && s.now - a.born > 0.35 * LIFE_YEAR_MS) a.young = false;
    if (a.sick > 0) {
      a.sick = clamp(a.sick + (vil.rng.next() - 0.55) * 0.05, 0, 1);
      if (a.sick >= 1) a.alive = false;
    }
  }
  // The flock is kept to what the common will bear; the lord sells the rest.
  const flock = s.animals.filter((a) => a.alive && a.kind === "sheep");
  if (flock.length > 30) flock[0].alive = false;
  if (flock.length < 12 && vil.rng.chance(0.01)) addAnimal(vil, "sheep", -1, false);
  s.animals = s.animals.filter((a) => a.alive || s.now - a.born < 0);
}

export function addAnimal(vil: Village, kind: Animal["kind"], owner: number, young: boolean): Animal {
  const s = vil.s;
  const mother = s.animals.find((a) => a.alive && a.kind === kind && (owner === -1 || a.owner === owner));
  const a: Animal = {
    id: s.nextId++,
    kind,
    owner,
    x: mother?.x ?? 1446,
    y: mother?.y ?? 80,
    tx: mother?.x ?? 1446,
    ty: mother?.y ?? 80,
    alive: true,
    young,
    born: s.now,
    sick: 0,
    follow: -1,
    alarmUntil: 0,
    loose: false,
    until: 0,
    facing: 1,
    state: 0,
  };
  s.animals.push(a);
  return a;
}

