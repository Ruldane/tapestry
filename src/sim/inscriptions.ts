/**
 * The upper border: for each scene, a stitched line saying what is
 * happening there, chosen from what has just happened (a death, a stranger,
 * a quarrel) and what people are doing (reaping, drinking, asleep). A line
 * stays long enough to be read and is replaced when something more worth
 * saying happens.
 */
import type { Village } from "./core";
import { INSCRIPTION_SLOTS, type InscriptionSlot } from "./geography";
import { Act, Carry, Work, type Inscription, type SimEvent, type Villager } from "./types";
import { who } from "./words";
import { deedMany, deedOne, deedTwo, GROUPS, life, PLACE, sky, UNFINISHED, type Deed, type Line } from "../text/latin";

const EVENT_WEIGHT: Partial<Record<SimEvent["kind"], number>> = {
  death: 10,
  burial: 10,
  funeral: 9,
  marriage: 9,
  birth: 8,
  comet: 9,
  meteors: 8,
  bridgeLost: 9,
  spate: 8,
  flockSaved: 8,
  sheepLost: 8,
  bridgeMended: 7,
  sermon: 8,
  postponed: 7,
  reeve: 8,
  stranger: 9,
  strangerGreeted: 6,
  strangerFollowed: 6,
  strangerDistrusted: 6,
  bark: 4.5,
  quarrel: 6,
  reconcile: 6,
  betrothal: 6,
  sick: 4.5,
  alms: 5,
  harvestIn: 7,
  cottage: 8,
  restitch: 5,
};

const WORK_DEED: Partial<Record<number, Deed>> = {
  [Work.Plough]: "plough",
  [Work.Sow]: "sow",
  [Work.Harrow]: "harrow",
  [Work.Weed]: "weed",
  [Work.Mow]: "mow",
  [Work.Rake]: "rake",
  [Work.Reap]: "reap",
  [Work.Bind]: "bind",
  [Work.Cart]: "cart",
  [Work.Thresh]: "thresh",
  [Work.Prune]: "prune",
  [Work.Dig]: "dig",
  [Work.Shear]: "shear",
  [Work.Herd]: "herd",
  [Work.Mill]: "mill",
  [Work.Bake]: "bake",
  [Work.Brew]: "brew",
  [Work.Smith]: "smith",
  [Work.Carpenter]: "carpenter",
  [Work.Thatch]: "thatch",
  [Work.Spin]: "spin",
  [Work.Weave]: "weave",
  [Work.Garden]: "garden",
  [Work.Slaughter]: "slaughter",
  [Work.Woodcut]: "woodcut",
  [Work.Oversee]: "oversee",
  [Work.Geese]: "geese",
  [Work.Glean]: "glean",
  [Work.Scare]: "scare",
  [Work.Pannage]: "pannage",
  [Work.Office]: "office",
};

const DEED_INTEREST: Partial<Record<Deed, number>> = {
  reap: 1.4,
  mow: 1.3,
  plough: 1.3,
  sow: 1.2,
  shear: 1.3,
  slaughter: 1.3,
  thresh: 1.1,
  bake: 1.1,
  mill: 1.2,
  smith: 1.1,
  drink: 1.2,
  dance: 1.3,
  feast: 1.3,
  mass: 1.2,
  play: 0.8,
  rest: 0.35,
  sleep: 0.5,
  spin: 0.7,
  carryGrain: 1,
  water: 0.8,
};

function deedOf(v: Villager, hour: number): Deed | null {
  switch (v.act) {
    case Act.Work:
      return WORK_DEED[v.work] ?? null;
    case Act.Drink:
      return "drink";
    case Act.Dance:
      return "dance";
    case Act.Feast:
      return "feast";
    case Act.Play:
      return "play";
    case Act.Service:
      return "mass";
    case Act.Pray:
      return v.work === Work.Office ? "office" : "pray";
    case Act.Carry:
      return v.carry === Carry.Grain ? "carryGrain" : null;
    case Act.Fetch:
      return "water";
    case Act.Rest:
      return v.work === Work.Spin ? "spin" : v.trade === "lord" ? "hall" : "rest";
    case Act.Sleep:
      return "sleep";
    case Act.Eat:
      return hour < 10 ? null : hour < 15 ? "dine" : "sup";
  }
  return null;
}

interface Candidate {
  line: Line;
  weight: number;
  key: string;
}

/** Recent events kept for the border, newest last (only those it could stitch). */
export function rememberEvent(vil: Village, e: SimEvent): void {
  if (typeof e.data?.la !== "string") return;
  const r = vil.s.recent;
  r.push(e);
  const cutoff = vil.s.now - 300_000;
  while (r.length && (r.length > 60 || r[0].t < cutoff)) r.shift();
}

function recent(vil: Village): SimEvent[] {
  return vil.s.recent;
}

function candidates(vil: Village, slot: InscriptionSlot): Candidate[] {
  const now = vil.s.now;
  const out: Candidate[] = [];
  // What has just happened here.
  for (const e of recent(vil)) {
    const age = (now - e.t) / 1000;
    if (age > 240) continue;
    const w = EVENT_WEIGHT[e.kind];
    const la = e.data?.la;
    if (!w || typeof la !== "string") continue;
    if (e.x < slot.x0 - 24 || e.x > slot.x1 + 24) continue;
    const en = typeof e.data?.en === "string" ? e.data.en : e.text.charAt(0).toUpperCase() + e.text.slice(1);
    out.push({ line: { la, en }, weight: w * (1 - age / 420), key: `${e.kind}:${la}` });
  }
  // What people are doing here.
  const here = vil.living().filter((v) => v.x >= slot.x0 - 6 && v.x <= slot.x1 + 6 && vil.age(v) >= 3);
  const outdoors = here.filter((v) => !v.inside || v.act === Act.Service || v.act === Act.Sleep || v.act === Act.Eat);
  const place = PLACE[slot.scene];
  if (place) out.push({ line: place, weight: 0.6, key: `place:${slot.scene}` });
  if (vil.env.night && here.length && here.every((v) => v.act === Act.Sleep || v.act === Act.Sick)) {
    out.push({ line: sky.night(), weight: 3, key: "night" });
  }
  const groups = new Map<string, Villager[]>();
  for (const v of outdoors) {
    if (v.inside && v.act !== Act.Service && v.act !== Act.Eat) continue;
    if (Math.hypot(v.tx - v.x, v.ty - v.y) > 3) continue;
    const d = deedOf(v, vil.env.hour);
    if (!d) continue;
    let g = groups.get(d);
    if (!g) groups.set(d, (g = []));
    g.push(v);
  }
  for (const [d, g] of groups) {
    const deed = d as Deed;
    const interest = DEED_INTEREST[deed] ?? 1;
    const weight = (2 + Math.min(4, g.length) * 0.5) * interest;
    let line: Line;
    if (g.length === 1) line = deedOne(who(vil, g[0]), deed);
    else if (g.length === 2 && deed !== "sleep") line = deedTwo(who(vil, g[0]), who(vil, g[1]), deed);
    else {
      const kids = g.every((v) => vil.age(v) < 12);
      const women = g.every((v) => v.sex === 1 && vil.age(v) >= 12);
      line = deedMany(deed, kids ? GROUPS.children : women ? GROUPS.women : undefined);
    }
    out.push({ line, weight, key: `do:${deed}:${g.length === 1 ? g[0].id : g.length === 2 ? `${g[0].id}-${g[1].id}` : "many"}` });
  }
  // Pairs talking, courting.
  for (const v of outdoors) {
    if (v.act === Act.Chat && v.with > v.id) {
      const o = vil.get(v.with);
      if (o) out.push({ line: life.chat(who(vil, v), who(vil, o)), weight: 2.6, key: `chat:${v.id}` });
    }
    if (v.act === Act.Court && v.with > v.id) {
      const o = vil.get(v.with);
      if (o) out.push({ line: life.courting(who(vil, v), who(vil, o)), weight: 4.5, key: `court:${v.id}` });
    }
    if (v.act === Act.Argue && v.with > v.id) {
      const o = vil.get(v.with);
      if (o) out.push({ line: life.quarrel(who(vil, v), who(vil, o)), weight: 6.5, key: `quarrel:${v.id}:${o.id}` });
    }
    if (v.act === Act.SkyWatch) out.push({ line: sky.watch(), weight: 6.5, key: "skywatch" });
    if (v.act === Act.SaveFlock) out.push({ line: { la: "HIC OVES AB AQUIS SERVANT", en: "Here they save the sheep from the water" }, weight: 8, key: "flock" });
    if (v.act === Act.FollowStranger) out.push({ line: { la: "HIC PUERI ADVENAM SEQUUNTUR", en: "Here the children follow the stranger" }, weight: 6.2, key: "follow" });
  }
  return out;
}

/** Every two seconds. */
export function inscriptionsTick(vil: Village): void {
  const s = vil.s;
  const now = s.now;
  for (const slot of INSCRIPTION_SLOTS) {
    const cur = s.inscriptions.find((i) => i.slot === slot.id);
    if (slot.scene === "end") {
      const building = s.builds.find((b) => b.building.startsWith("plot"));
      const line = building ? life.cottage() : UNFINISHED;
      const key = building ? "cottage" : "unfinished";
      if (!cur || cur.key !== key) set(vil, slot.id, line, 1, key);
      continue;
    }
    // Not the same words as the slot beside it.
    const neighbours = new Set(s.inscriptions.filter((i) => Math.abs(i.slot - slot.id) === 1).map((i) => i.la));
    const cands = candidates(vil, slot).filter((c) => !neighbours.has(c.line.la) || c.weight >= 8);
    if (!cands.length) continue;
    cands.sort((a, b) => b.weight - a.weight);
    const best = cands[0];
    if (!cur) {
      set(vil, slot.id, best.line, best.weight, best.key);
      continue;
    }
    if (best.key === cur.key) {
      cur.weight = best.weight;
      continue;
    }
    const age = (now - cur.t) / 1000;
    const still = cands.find((c) => c.key === cur.key);
    const curScore = (still ? still.weight : cur.weight * 0.6) - Math.max(0, age - 90) * 0.03;
    const minDwell = age < 22;
    if (minDwell) continue;
    if (best.weight > curScore + 0.9 || (age > 110 && best.weight >= curScore - 0.5)) set(vil, slot.id, best.line, best.weight, best.key);
  }
}

function set(vil: Village, slot: number, line: Line, weight: number, key: string): void {
  const s = vil.s;
  const i: Inscription = { slot, la: line.la, en: line.en, t: s.now, weight, key };
  const at = s.inscriptions.findIndex((x) => x.slot === slot);
  if (at >= 0) s.inscriptions[at] = i;
  else s.inscriptions.push(i);
}
