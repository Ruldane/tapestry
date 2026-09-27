/**
 * Lives: children conceived and born, sickness taken and thrown off (or
 * not), deaths and the burying of the dead, weddings and the households they
 * make, trades handed on, the reeve chosen at Michaelmas.
 */
import { datePhrase, HOUR_MS } from "./calendar";
import { addEntry, dig } from "./chronicle";
import { LIFE_YEAR_MS, POP } from "./constants";
import type { Village } from "./core";
import { BUILDING, BUILDINGS, sceneAt } from "./geography";
import { CLOTH, DYE } from "./looks";
import { FEMALE_NAMES, MALE_NAMES, PEREGRINE, nameKey, type GivenName } from "./names";
import { assign, at, door } from "./schedule";
import { startRumour } from "./social";
import { Act, Carry, Kin, PILGRIM, Work, type Household, type Trade, type Villager } from "./types";
import { who } from "./words";
import { life as lifeLines, stranger as strangerLines } from "../text/latin";

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Fewer children when the village is full, more when it is thin. */
function fertility(vil: Village): number {
  const pop = vil.living().length;
  return clamp(1 + (POP.target - pop) / 36, 0.2, 2.2);
}

function frailty(vil: Village, v: Villager): number {
  const age = vil.age(v);
  let f = 0.22;
  if (age < 2) f += 0.2;
  else if (age < 6) f += 0.06;
  if (age > 50) f += (age - 50) * 0.012;
  f += v.hunger > 0.6 ? 0.18 : 0;
  f += (1 - v.health) * 0.2;
  if (vil.env.fm === 11 || vil.env.fm <= 1) f += 0.05;
  return clamp(f, 0.05, 0.95);
}

/** Every few seconds of sim time. */
export function lifeTick(vil: Village, seconds: number): void {
  const s = vil.s;
  const years = (seconds * 1000) / LIFE_YEAR_MS;
  const hours = seconds / 3600;
  const fert = fertility(vil);
  for (const v of vil.living().slice()) {
    if (!v.alive) continue;
    const age = vil.age(v);

    // Conception.
    if (v.sex === 1 && v.pregnantUntil === 0 && v.spouse >= 0 && age >= 17 && age <= 42) {
      const sp = vil.get(v.spouse);
      if (sp && sp.alive) {
        const youngest = v.children.map((c) => vil.get(c)).filter((c) => c && c.alive);
        const recent = youngest.some((c) => vil.age(c!) < 1.3);
        let rate = 0.42 * fert * (age > 36 ? 0.45 : 1) * (recent ? 0.15 : 1) * (v.hunger > 0.6 ? 0.4 : 1) * (v.sick > 0 ? 0.2 : 1);
        rate *= 0.6 + (v.ties[sp.id]?.a ?? 0.4) * 0.6;
        if (vil.rng.chance(rate * years)) v.pregnantUntil = s.now + 0.75 * LIFE_YEAR_MS;
      }
    }
    if (v.pregnantUntil > 0 && s.now >= v.pregnantUntil) {
      v.pregnantUntil = 0;
      birth(vil, v);
    }

    // Falling sick.
    if (v.sick === 0) {
      let rate = 0.1 * (age > 55 ? 1 + (age - 55) / 8 : 1) * (age < 3 ? 1.8 : 1) * (v.hunger > 0.65 ? 2.6 : 1) * (vil.env.fm === 11 || vil.env.fm <= 1 ? 1.5 : 1);
      if (v.fatigue > 0.85) rate *= 1.4;
      if (vil.rng.chance(rate * years)) fallSick(vil, v);
    } else {
      const f = frailty(vil, v);
      v.sick = clamp(v.sick + (0.16 * f - 0.13 * (1 - f) + (vil.rng.next() - 0.5) * 0.06) * hours * 3, 0, 1);
      v.health = clamp(1 - v.sick * 0.85, 0.05, 1);
      if (v.sick >= 1) {
        die(vil, v, vil.rng.pick(["a fever", "a wasting sickness", "a flux", "a cough that went to the chest", "the sweating sickness"]));
        continue;
      }
      if (v.sick < 0.04) {
        v.sick = 0;
        v.health = Math.max(v.health, 0.8);
        vil.hist(v, { k: "recovered" });
        vil.emit({ kind: "recovered", x: v.x, actors: [v.id], text: `${vil.first(v)} is up and about again`, quiet: vil.age(v) < 6 });
      }
    }

    // Old age takes some quietly, in their sleep.
    if (age > 55 && v.act === Act.Sleep) {
      const hz = 0.0003 * Math.exp(0.1 * (age - 20));
      if (vil.rng.chance(hz * years * 2.2)) {
        die(vil, v, "old age, in the night");
        continue;
      }
    }

    // Growing up.
    if (v.trade === "goosegirl" && age >= 16) v.trade = "none";
    if (v.trade === "none" && v.sex === 0 && age >= 14.5 && age < 15) v.trade = vil.rng.chance(0.4) ? "ploughman" : "labourer";

    // Health returns when fed and well.
    if (v.sick === 0 && v.hunger < 0.5) v.health = clamp(v.health + 0.02 * hours, 0, 1);
    if (v.hunger > 0.75) v.health = clamp(v.health - 0.015 * hours, 0.05, 1);
  }

  funerals(vil);
  weddings(vil);
  successions(vil);
  if (vil.s.tick % 2400 < 20 || !vil.live) forgetTheLongDead(vil);
  if (vil.living().length < POP.min) newcomers(vil);
}

/**
 * The dead stay in the village's memory a while: their names in the roll and
 * the churchyard, their ties in the family. After that only the chronicle,
 * the graves and the stitched histories remember them.
 */
function forgetTheLongDead(vil: Village): void {
  const s = vil.s;
  const cutoff = s.now - 20 * 86_400_000;
  const dead = s.villagers.filter((v) => !v.alive).sort((a, b) => (b.died ?? 0) - (a.died ?? 0));
  const keep = new Set<number>(dead.slice(0, 40).map((v) => v.id));
  for (const g of s.graves) keep.add(g.villager);
  for (const f of s.funerals) keep.add(f.villager);
  let removed = false;
  s.villagers = s.villagers.filter((v) => {
    if (v.alive || keep.has(v.id) || (v.died ?? 0) > cutoff) return true;
    removed = true;
    return false;
  });
  for (const v of s.villagers) {
    if (!v.alive) continue;
    for (const k in v.ties) {
      const o = vil.get(Number(k));
      const id = Number(k);
      if (id === 0) continue;
      if (!o || (!o.alive && (o.died ?? 0) < cutoff && v.ties[k].k === 0)) delete v.ties[k];
    }
  }
  if (s.visits.length > 60) s.visits.splice(0, s.visits.length - 60);
  if (removed) vil.reindex();
}

// ---------------------------------------------------------------------------
// Birth
// ---------------------------------------------------------------------------

function birth(vil: Village, mother: Villager): void {
  const s = vil.s;
  const father = vil.get(mother.spouse);
  const sex: 0 | 1 = vil.rng.chance(0.5) ? 0 : 1;
  const h = vil.household(mother.household);
  const avoid = new Set((h?.members ?? []).map((id) => vil.get(id)).filter(Boolean).map((m) => vil.first(m!)));

  // Named for the stranger: only by parents who have come to love the stranger.
  const fond = Math.max(mother.ties[PILGRIM]?.a ?? -1, father?.ties[PILGRIM]?.a ?? -1);
  const peregrineAlive = vil.living().some((v) => vil.given(v).en === "Peregrine");
  let name: GivenName;
  let forStranger = false;
  if (s.visits.length >= 2 && fond > 0.45 && !peregrineAlive && vil.rng.chance(0.45)) {
    name = PEREGRINE[sex];
    forStranger = true;
  } else {
    const kin = [father, mother, vil.get(father?.parents[0] ?? -1), vil.get(mother.parents[1])].filter(Boolean) as Villager[];
    const kinNames = kin.map((k) => vil.given(k)).filter((n) => n.sex === sex && !avoid.has(n.en));
    if (kinNames.length && vil.rng.chance(0.3)) name = vil.rng.pick(kinNames);
    else {
      const list = sex ? FEMALE_NAMES : MALE_NAMES;
      do name = list[Math.min(list.length - 1, Math.floor(Math.pow(vil.rng.next(), 1.4) * list.length))];
      while (avoid.has(name.en) && vil.rng.chance(0.95));
    }
  }

  const baby: Villager = {
    ...mother,
    id: s.nextId++,
    name: nameKey(name),
    byname: father?.byname ?? mother.byname,
    sex,
    born: s.now,
    trade: "none",
    alive: true,
    died: undefined,
    cause: undefined,
    spouse: -1,
    parents: [father?.id ?? -1, mother.id],
    children: [],
    traits: {
      curiosity: vil.rng.next(),
      suspicion: vil.rng.next() * 0.7,
      sociability: 0.2 + vil.rng.next() * 0.8,
      piety: vil.rng.next(),
      temper: vil.rng.next() * 0.9,
      gossip: vil.rng.next(),
    },
    looks: {
      tunic: vil.rng.pick(CLOTH),
      hood: vil.rng.pick(CLOTH),
      hose: DYE.walnut,
      hair: vil.rng.chance(0.5) ? mother.looks.hair : (father?.looks.hair ?? mother.looks.hair),
    },
    health: 0.8,
    hunger: 0,
    fatigue: 0,
    mood: 0.3,
    sick: 0,
    pregnantUntil: 0,
    mourningUntil: 0,
    courting: -1,
    betrothed: -1,
    ties: {},
    rumours: {},
    history: [{ t: s.now, k: "born" }],
    act: Act.Rest,
    work: Work.None,
    carry: Carry.None,
    until: 0,
    target: mother.id,
    with: -1,
    inside: mother.inside,
    enter: false,
    mediate: false,
    progress: 0,
  };
  if (baby.looks.hair === DYE.grey) baby.looks.hair = DYE.walnut;
  vil.addVillager(baby);
  h?.members.push(baby.id);
  mother.children.push(baby.id);
  father?.children.push(baby.id);
  const kinTie = (x: Villager | undefined, k1: Kin, k2: Kin, a: number) => {
    if (!x || !x.alive) return;
    baby.ties[x.id] = { k: k1, a, g: 0, m: 1, t: s.now };
    x.ties[baby.id] = { k: k2, a: a + 0.1, g: 0, m: 1, t: s.now };
  };
  kinTie(mother, Kin.Parent, Kin.Child, 0.8);
  kinTie(father, Kin.Parent, Kin.Child, 0.7);
  for (const sibId of mother.children) if (sibId !== baby.id) kinTie(vil.get(sibId), Kin.Sibling, Kin.Sibling, 0.5);
  for (const gp of [...(father?.parents ?? []), ...mother.parents]) kinTie(vil.get(gp), Kin.Grand, Kin.Grand, 0.6);
  s.counts.births++;
  vil.hist(mother, { k: "childBorn", o: baby.id, on: name.en });
  if (father) vil.hist(father, { k: "childBorn", o: baby.id, on: name.en });
  mother.mood = clamp(mother.mood + 0.3, -1, 1);
  if (father) father.mood = clamp(father.mood + 0.25, -1, 1);
  if (mother.act !== Act.Sleep) assign(vil, mother, Act.Rest, door(vil, vil.home(mother), 2), 180, { inside: true, carry: Carry.Babe });

  const home = vil.home(mother);
  const w = who(vil, baby);
  if (forStranger) {
    vil.hist(baby, { k: "namedForStranger" });
    vil.hist(mother, { k: "namedForStranger", o: baby.id, on: name.en });
    if (father) vil.hist(father, { k: "namedForStranger", o: baby.id, on: name.en });
    const line = strangerLines.named(w);
    vil.emit({ kind: "birth", x: home.x, actors: [baby.id, mother.id], text: line.en, data: { la: line.la, forStranger: 1 } });
    addEntry(vil, "named", line, sceneAt(home.x).id, [baby.id, mother.id]);
  } else {
    const line = lifeLines.born(w);
    vil.emit({ kind: "birth", x: home.x, actors: [baby.id, mother.id], text: line.en, data: { la: line.la, en: line.en } });
    addEntry(vil, "birth", line, sceneAt(home.x).id, [baby.id, mother.id]);
  }
  const gossip = vil.living().find((x) => x.id !== mother.id && x.household !== mother.household && Math.abs(x.x - home.x) < 40 && vil.age(x) > 12);
  if (gossip) startRumour(vil, "birth", [mother.id], gossip);

  // Baptism at the font in the morning.
  const hoursTo = (24 + 9.5 - vil.env.hour) % 24;
  s.baptisms.push({ baby: baby.id, at: s.now + Math.max(2, hoursTo) * HOUR_MS, done: false });

  // Childbed is dangerous.
  if (vil.rng.chance(0.012 + (vil.age(mother) > 38 ? 0.01 : 0))) die(vil, mother, "childbed");
}

// ---------------------------------------------------------------------------
// Sickness and death
// ---------------------------------------------------------------------------

function fallSick(vil: Village, v: Villager): void {
  v.sick = 0.3 + vil.rng.next() * 0.35;
  vil.hist(v, { k: "sick" });
  const home = vil.home(v);
  const sl = lifeLines.sick(who(vil, v));
  vil.emit({ kind: "sick", x: home.x, actors: [v.id], text: `${vil.first(v)} has taken sick`, data: { la: sl.la, en: sl.en } });
  const kin = Object.keys(v.ties)
    .map(Number)
    .map((id) => vil.get(id))
    .find((k) => k && k.alive && k.id !== v.id && vil.age(k) > 10);
  if (kin) startRumour(vil, "sick", [v.id], kin);
}

export function die(vil: Village, v: Villager, cause: string): void {
  const s = vil.s;
  if (!v.alive) return;
  v.alive = false;
  v.died = s.now;
  v.cause = cause;
  v.inside = true;
  v.act = Act.Sleep;
  vil.changed();
  s.counts.burials++;
  vil.hist(v, { k: "buried", d: cause });
  const h = vil.household(v.household);
  if (h) {
    h.members = h.members.filter((id) => id !== v.id);
    if (!h.members.some((id) => vil.get(id)?.alive)) h.ended = s.now;
  }
  const age = vil.age(v);
  // The family mourns.
  for (const k in v.ties) {
    const o = vil.get(Number(k));
    if (!o || !o.alive) continue;
    const t = v.ties[k];
    const close = t.k === Kin.Spouse || t.k === Kin.Child || t.k === Kin.Parent ? 1 : t.k !== Kin.None ? 0.6 : t.a > 0.45 ? 0.4 : 0;
    if (close > 0) {
      o.mood = clamp(o.mood - 0.55 * close, -1, 1);
      o.mourningUntil = s.now + (0.5 + close) * 24 * HOUR_MS;
    }
    const back = o.ties[v.id];
    if (back?.k === Kin.Spouse) {
      o.spouse = -1;
      vil.hist(o, { k: "widowed", o: v.id, on: vil.first(v) });
    }
    if (back?.k === Kin.Child && age < 14) vil.hist(o, { k: "childBuried", o: v.id, on: vil.first(v) });
    if (o.courting === v.id) o.courting = -1;
    if (o.betrothed === v.id) {
      o.betrothed = -1;
      s.weddings = s.weddings.filter((w) => w.a !== v.id && w.b !== v.id);
    }
  }
  for (const o of vil.living()) {
    if (o.betrothed === v.id) {
      o.betrothed = -1;
      s.weddings = s.weddings.filter((w) => w.a !== v.id && w.b !== v.id);
    }
    if (o.courting === v.id) o.courting = -1;
    if (o.spouse === v.id) o.spouse = -1;
  }
  const home = vil.home(v);
  const line = lifeLines.died(who(vil, v));
  vil.emit({ kind: "death", x: home.x, actors: [v.id], text: line.en, data: { la: line.la, en: line.en } });
  vil.emit({ kind: "passingBell", x: 898, actors: [v.id], text: `the passing bell tolls for ${vil.first(v)}`, quiet: true });
  const teller = vil.living().find((x) => Math.abs(x.x - home.x) < 60 && vil.age(x) > 12);
  if (teller) startRumour(vil, "death", [v.id], teller);
  // The funeral: the next morning, or in a few hours if the day is young.
  const e = vil.env;
  const inHours = e.hour < 13 ? 3 : (24 + 10 - e.hour) % 24;
  s.funerals.push({ villager: v.id, at: s.now + inHours * HOUR_MS, started: false, done: false, mourners: [], phase: 0, phaseAt: 0 });
  orphans(vil, v);
  if (v.trade === "reeve") electReeve(vil);
}

function orphans(vil: Village, dead: Villager): void {
  for (const cid of dead.children) {
    const c = vil.get(cid);
    if (!c || !c.alive || vil.age(c) >= 14) continue;
    const h = vil.household(c.household);
    const grown = h?.members.map((id) => vil.get(id)).some((m) => m && m.alive && vil.age(m) >= 16);
    if (grown) continue;
    // To kin: a grandparent, an aunt or uncle.
    const kin = Object.keys(c.ties)
      .map(Number)
      .map((id) => vil.get(id))
      .filter((k): k is Villager => !!k && k.alive && vil.age(k) >= 20 && k.household !== c.household)
      .sort((a, b) => (c.ties[b.id]?.a ?? 0) - (c.ties[a.id]?.a ?? 0))[0];
    const to = kin ? vil.household(kin.household) : vil.s.households.find((x) => x.building === "manor");
    if (!to) continue;
    if (h) {
      h.members = h.members.filter((id) => id !== c.id);
      if (!h.members.some((id) => vil.get(id)?.alive)) h.ended = vil.s.now;
    }
    to.members.push(c.id);
    c.household = to.id;
    vil.hist(c, { k: "moved", d: `went to live in ${to.name}` });
  }
}

// ---------------------------------------------------------------------------
// Funerals
// ---------------------------------------------------------------------------

function funerals(vil: Village): void {
  const s = vil.s;
  for (const f of s.funerals) {
    if (f.done || s.now < f.at) continue;
    const dead = vil.get(f.villager);
    if (!dead) {
      f.done = true;
      continue;
    }
    if (!vil.live) {
      bury(vil, dead);
      f.done = true;
      continue;
    }
    if (!f.started) {
      f.started = true;
      const mourners = vil
        .living()
        .filter((o) => {
          if (o.sick > 0.4 || vil.age(o) < 3) return false;
          const t = dead.ties[o.id];
          return o.trade === "priest" || (t && (t.k !== Kin.None || t.a > 0.35)) || (vil.home(o) === vil.home(dead) ? true : vil.rng.chance(0.18));
        })
        .slice(0, 22);
      const home = vil.home(dead);
      mourners.forEach((o, i) => {
        assign(vil, o, Act.Funeral, { x: home.doorX - 6 - i * 2.6, y: 76 + (i % 2) * 2 }, 30, { carry: i < 2 ? Carry.Bier : Carry.None, target: dead.id });
        o.progress = i;
      });
      f.mourners = mourners.map((m) => m.id);
      f.phase = 0;
      f.phaseAt = s.now;
      vil.emit({ kind: "funeral", x: home.x, actors: [dead.id, ...mourners.map((m) => m.id)], text: lifeLines.carried(who(vil, dead)).en, data: { la: lifeLines.carried(who(vil, dead)).la } });
      continue;
    }
    const ff = f;
    const people = ff.mourners.map((id) => vil.get(id)).filter((m): m is Villager => !!m && m.alive && m.act === Act.Funeral);
    if (ff.phase === 0) {
      // Walk in procession to the churchyard, the bier carried before.
      if (s.now - ff.phaseAt > 6 * 60_000 || people.every((p) => Math.hypot(p.tx - p.x, p.ty - p.y) < 2)) {
        ff.phase = 1;
        ff.phaseAt = s.now;
        people.forEach((p, i) => {
          p.tx = 950 - i * 2.8 * Math.sign(950 - p.x || 1);
          p.ty = 74 + (i % 3) * 1.8;
          p.until = s.now + 30 * 60_000;
        });
      }
    } else if (ff.phase === 1) {
      const arrived = people.filter((p) => Math.abs(p.tx - p.x) < 2).length;
      if (arrived >= Math.max(1, people.length * 0.7) || s.now - ff.phaseAt > 16 * 60_000) {
        ff.phase = 2;
        ff.phaseAt = s.now;
        bury(vil, dead);
        people.forEach((p, i) => {
          p.carry = Carry.None;
          p.tx = 946 + ((i % 8) - 4) * 2.4;
          p.ty = 72 + Math.floor(i / 8) * 2.4;
          p.until = s.now + 6 * 60_000;
        });
      }
    } else if (s.now - ff.phaseAt > 5 * 60_000) {
      f.done = true;
      for (const p of people) {
        p.act = Act.Mourn;
        p.until = s.now + (2 + vil.rng.next() * 6) * 60_000;
      }
    }
  }
  s.funerals = s.funerals.filter((f) => !f.done || s.now - f.at < 6 * HOUR_MS);
}

function bury(vil: Village, dead: Villager): void {
  const name = vil.first(dead);
  dig(vil, dead, name);
  const line = lifeLines.buried(who(vil, dead));
  vil.emit({ kind: "burial", x: 946, actors: [dead.id], text: line.en, data: { la: line.la, en: line.en } });
  addEntry(vil, "burial", { la: line.la, en: `${line.en}, ${datePhrase(vil.s.now, vil.settings.place.offsetMinutes)}` }, "green", [dead.id]);
}

// ---------------------------------------------------------------------------
// Weddings and households
// ---------------------------------------------------------------------------

function weddings(vil: Village): void {
  const s = vil.s;
  for (const w of s.weddings) {
    if (w.done || s.now < w.at) continue;
    const a = vil.get(w.a);
    const b = vil.get(w.b);
    if (!a || !b || !a.alive || !b.alive) {
      w.done = true;
      continue;
    }
    if (!vil.live) {
      marry(vil, a, b);
      w.done = true;
      continue;
    }
    if (!w.started) {
      w.started = true;
      const guests = vil
        .living()
        .filter((o) => {
          if (o.id === a.id || o.id === b.id) return false;
          if (o.sick > 0.4 || vil.age(o) < 3) return false;
          const ta = a.ties[o.id];
          const tb = b.ties[o.id];
          return o.trade === "priest" || (ta && (ta.k !== Kin.None || ta.a > 0.35)) || (tb && (tb.k !== Kin.None || tb.a > 0.35));
        })
        .slice(0, 20);
      const doorSpot = at(vil, "churchDoor");
      assign(vil, a, Act.Wedding, { x: doorSpot.x - 1.5, y: 72 }, 25, { with: b.id });
      assign(vil, b, Act.Wedding, { x: doorSpot.x + 1.5, y: 72 }, 25, { with: a.id });
      guests.forEach((g, i) => assign(vil, g, Act.Wedding, { x: 906 + (i % 2 ? 1 : -1) * (6 + Math.floor(i / 2) * 2.5), y: 74 + (i % 3) * 1.8 }, 25, { target: a.id }));
      w.guests = guests.map((g) => g.id);
      continue;
    }
    const ww = w;
    const here = Math.abs(a.x - 906) < 4 && Math.abs(b.x - 906) < 4;
    if (here || s.now - w.at > 40 * 60_000) {
      marry(vil, a, b);
      w.done = true;
      // To the alehouse for the feast.
      for (const id of [a.id, b.id, ...ww.guests]) {
        const g = vil.get(id);
        if (g && g.alive && g.act === Act.Wedding) assign(vil, g, vil.rng.chance(0.4) ? Act.Dance : Act.Feast, at(vil, "alehouse"), 60);
      }
    }
  }
  s.weddings = s.weddings.filter((w) => !w.done);
}

export function marry(vil: Village, a: Villager, b: Villager): void {
  const s = vil.s;
  const [man, woman] = a.sex === 0 ? [a, b] : [b, a];
  man.spouse = woman.id;
  woman.spouse = man.id;
  man.betrothed = woman.betrothed = -1;
  man.courting = woman.courting = -1;
  const tm = vil.tie(man, woman.id);
  const tw = vil.tie(woman, man.id);
  tm.k = tw.k = Kin.Spouse;
  s.counts.marriages++;
  vil.hist(man, { k: "married", o: woman.id, on: vil.first(woman) });
  vil.hist(woman, { k: "married", o: man.id, on: vil.first(man) });
  man.mood = clamp(man.mood + 0.35, -1, 1);
  woman.mood = clamp(woman.mood + 0.35, -1, 1);
  // In-laws.
  for (const p of [...man.parents, ...woman.parents]) {
    const par = vil.get(p);
    if (!par || !par.alive) continue;
    const child = man.parents.includes(p) ? woman : man;
    child.ties[par.id] ??= { k: Kin.InLaw, a: 0.2, g: 0, m: 1, t: s.now };
    par.ties[child.id] ??= { k: Kin.InLaw, a: 0.2, g: 0, m: 1, t: s.now };
  }
  const w1 = who(vil, man);
  const w2 = who(vil, woman);
  const line = lifeLines.wedding(w1, w2);
  vil.emit({ kind: "marriage", x: 906, actors: [man.id, woman.id], text: line.en, data: { la: line.la, en: line.en } });
  addEntry(vil, "marriage", { la: line.la, en: `${line.en}, ${datePhrase(s.now, vil.settings.place.offsetMinutes)}` }, "green", [man.id, woman.id]);
  settleCouple(vil, man, woman);
}

/** Where the new couple will live. */
function settleCouple(vil: Village, man: Villager, woman: Villager): void {
  const hm = vil.household(man.household);
  const hw = vil.household(woman.household);
  const isHead = (v: Villager, h?: Household) => !!h && h.members[0] === v.id;
  if (isHead(man, hm)) return moveTo(vil, woman, hm!);
  if (isHead(woman, hw) && woman.spouse >= 0 && hw!.members.length <= 3) return moveTo(vil, man, hw!);
  // An empty house?
  const used = new Set(vil.s.households.filter((h) => !h.ended).map((h) => h.building));
  const free = BUILDINGS.find((b) => b.dwelling && !b.expansion && !used.has(b.id) && b.id !== "manor" && b.id !== "priesthouse");
  if (free) {
    newHousehold(vil, man, woman, free.id);
    return;
  }
  // Otherwise a new house is built in the bare linen; they live with his family meanwhile.
  const plot = BUILDINGS.find((b) => b.expansion && !vil.s.built.includes(b.id) && !vil.s.builds.some((x) => x.building === b.id));
  if (plot && man.household !== woman.household) {
    vil.s.builds.push({ building: plot.id, work: 0, need: 2400, for: [man.id, woman.id] });
  }
  if (hm && man.household !== woman.household) moveTo(vil, woman, hm);
}

function moveTo(vil: Village, v: Villager, h: Household): void {
  const old = vil.household(v.household);
  if (old && old.id !== h.id) {
    old.members = old.members.filter((id) => id !== v.id);
    if (!old.members.length) old.ended = vil.s.now;
  }
  if (!h.members.includes(v.id)) h.members.push(v.id);
  v.household = h.id;
  if (h.name && v.sex === 1) {
    const head = vil.get(h.members[0]);
    if (head && head.byname) v.byname = head.byname;
  }
}

export function newHousehold(vil: Village, man: Villager, woman: Villager, building: string): Household {
  const s = vil.s;
  const h: Household = {
    id: s.households.length ? Math.max(...s.households.map((x) => x.id)) + 1 : 1,
    name: `${vil.first(man)} ${man.byname}'s house`,
    building,
    members: [],
    grain: 0,
    flour: 0,
    meat: 0,
    strips: [],
    founded: s.now,
  };
  // A share of the parents' stores goes with them.
  for (const x of [man, woman]) {
    const from = vil.household(x.household);
    if (from && from.grain > 4) {
      const share = from.grain * 0.18;
      from.grain -= share;
      h.grain += share;
    }
  }
  // A strip from the lord if any are unclaimed by the living.
  const orphan = s.strips.find((st) => st.owner > 0 && vil.household(st.owner)?.ended);
  if (orphan) {
    const prev = vil.household(orphan.owner);
    if (prev) prev.strips = prev.strips.filter((id) => id !== orphan.id);
    orphan.owner = h.id;
    h.strips.push(orphan.id);
  }
  vil.addHousehold(h);
  moveTo(vil, man, h);
  moveTo(vil, woman, h);
  woman.byname = man.byname;
  return h;
}

/** A finished cottage in the unfinished linen: the couple moves in. */
export function cottageBuilt(vil: Village, building: string, couple: number[]): void {
  vil.s.built.push(building);
  const [a, b] = couple.map((id) => vil.get(id));
  const b0 = BUILDING[building];
  if (a && b && a.alive && b.alive) {
    const [man, woman] = a.sex === 0 ? [a, b] : [b, a];
    newHousehold(vil, man, woman, building);
    vil.hist(man, { k: "built", d: "moved into a new house at the end of the village" });
    vil.hist(woman, { k: "built", d: "moved into a new house at the end of the village" });
  }
  const line = lifeLines.cottage();
  vil.emit({ kind: "cottage", x: b0.x, actors: couple, text: line.en, data: { la: line.la, building } });
  addEntry(vil, "cottage", line, "common", couple);
}

// ---------------------------------------------------------------------------
// Trades, the reeve, the priest
// ---------------------------------------------------------------------------

const HELD: Trade[] = ["miller", "smith", "baker", "alewife", "shepherd", "carpenter", "thatcher", "weaver", "woodward", "swineherd", "priest", "lord", "steward"];

function successions(vil: Village): void {
  const living = vil.living();
  for (const t of HELD) {
    if (living.some((v) => v.trade === t)) continue;
    if (t === "priest") {
      const s = vil.s;
      if (!s.priestDue) s.priestDue = s.now + 20 * HOUR_MS;
      if (s.now >= s.priestDue) {
        s.priestDue = 0;
        newcomer(vil, "priest");
      }
      continue;
    }
    // Hand the trade to the dead holder's grown child, spouse, or a willing hand.
    const prev = vil.s.villagers.filter((v) => !v.alive && v.trade === t).sort((a, b) => (b.died ?? 0) - (a.died ?? 0))[0];
    const womanTrade = t === "alewife" || t === "baker";
    const candidates = living.filter((v) => {
      const age = vil.age(v);
      if (age < 16 || age > 62) return false;
      if (t === "lord") return prev ? prev.children.includes(v.id) || v.trade === "lady" : v.trade === "lady";
      if (v.trade !== "none" && v.trade !== "labourer" && v.trade !== "ploughman" && v.trade !== "servant") return false;
      if (womanTrade ? v.sex !== 1 : v.sex !== 0) return false;
      return true;
    });
    if (!candidates.length) continue;
    candidates.sort((a, b) => score(b) - score(a));
    function score(v: Villager): number {
      let s = vil.rng.next() * 0.3;
      if (prev && prev.children.includes(v.id)) s += 2;
      if (prev && prev.spouse === v.id) s += 1.5;
      if (prev && v.household === prev.household) s += 1;
      return s;
    }
    const heir = candidates[0];
    if (t === "lord" && heir.trade === "lady") continue;
    heir.trade = t;
    vil.hist(heir, { k: "trade", d: t === "lord" ? "became lord of the manor" : `took up the trade of ${t}` });
  }
}

export function electReeve(vil: Village): void {
  const s = vil.s;
  const adults = vil.living().filter((v) => vil.age(v) >= 16);
  const men = adults.filter((v) => v.sex === 0 && vil.age(v) >= 25 && vil.age(v) <= 62 && ["labourer", "ploughman", "reeve", "weaver", "thatcher"].includes(v.trade));
  if (!men.length) return;
  const standing = (m: Villager) => {
    let sum = 0;
    for (const o of adults) {
      const t = o.ties[m.id];
      if (t) sum += t.a - t.g * 0.8;
    }
    return sum + vil.rng.next() * 0.8;
  };
  men.sort((a, b) => standing(b) - standing(a));
  const chosen = men[0];
  const old = vil.living().find((v) => v.trade === "reeve");
  if (old && old.id !== chosen.id) old.trade = "ploughman";
  chosen.trade = "reeve";
  s.reeveYear = new Date(s.now + vil.settings.place.offsetMinutes * 60_000).getUTCFullYear();
  vil.hist(chosen, { k: "reeve" });
  const line = lifeLines.reeve(who(vil, chosen));
  vil.emit({ kind: "reeve", x: 1196, actors: [chosen.id], text: line.en, data: { la: line.la, en: line.en } });
  addEntry(vil, "reeve", line, "manor", [chosen.id]);
}

/** At Michaelmas the village chooses its reeve for the year. */
export function michaelmas(vil: Village): void {
  const e = vil.env;
  if (e.lt.month === 8 && e.lt.date === 29 && e.hour >= 11 && vil.s.reeveYear < e.lt.year) electReeve(vil);
}

function newcomer(vil: Village, trade: Trade): Villager | null {
  const s = vil.s;
  const priest = trade === "priest";
  const sex: 0 | 1 = priest ? 0 : vil.rng.chance(0.5) ? 0 : 1;
  const list = sex ? FEMALE_NAMES : MALE_NAMES;
  const name = list[vil.rng.int(0, list.length)];
  const building = priest ? "priesthouse" : BUILDINGS.find((b) => b.dwelling && !b.expansion && !s.households.some((h) => !h.ended && h.building === b.id))?.id;
  if (!building) return null;
  let h = s.households.find((x) => !x.ended && x.building === building);
  const age = priest ? 30 + vil.rng.next() * 15 : 22 + vil.rng.next() * 10;
  const template = vil.living()[0] ?? s.villagers[0];
  const v: Villager = {
    ...template,
    id: s.nextId++,
    name: nameKey(name),
    byname: priest ? "the priest" : vil.rng.pick(["Newman", "Strange", "Comelyng", "of Westbury"]),
    sex,
    born: s.now - age * LIFE_YEAR_MS,
    household: 0,
    trade,
    alive: true,
    died: undefined,
    cause: undefined,
    spouse: -1,
    parents: [-1, -1],
    children: [],
    traits: { curiosity: 0.5, suspicion: 0.3, sociability: 0.6, piety: priest ? 0.9 : 0.5, temper: 0.3, gossip: 0.4 },
    looks: { tunic: priest ? DYE.greyDark : vil.rng.pick(CLOTH), hood: priest ? DYE.grey : vil.rng.pick(CLOTH), hose: DYE.walnut, hair: DYE.walnut },
    health: 1,
    hunger: 0.1,
    fatigue: 0.2,
    mood: 0.2,
    sick: 0,
    pregnantUntil: 0,
    mourningUntil: 0,
    courting: -1,
    betrothed: -1,
    ties: {},
    rumours: {},
    history: [{ t: s.now - age * LIFE_YEAR_MS, k: "born" }, { t: s.now, k: "arrived", d: priest ? "came to Ashcombe as priest" : "came to Ashcombe to find work" }],
    x: 4,
    y: 80,
    tx: 4,
    ty: 80,
    act: Act.Idle,
    until: 0,
    target: -1,
    with: -1,
    inside: false,
    enter: false,
    mediate: false,
    progress: 0,
  };
  if (!h) {
    h = { id: Math.max(...s.households.map((x) => x.id)) + 1, name: `${name.en} ${v.byname}'s house`, building, members: [], grain: 12, flour: 2, meat: 0, strips: [], founded: s.now };
    vil.addHousehold(h);
  }
  v.household = h.id;
  h.members.push(v.id);
  vil.addVillager(v);
  if (priest) {
    const line = lifeLines.newPriest(who(vil, v));
    vil.emit({ kind: "chronicle", x: 988, actors: [v.id], text: line.en, data: { la: line.la, en: line.en } });
    addEntry(vil, "priest", line, "green", [v.id]);
  }
  return v;
}

function newcomers(vil: Village): void {
  if (vil.rng.chance(0.02)) newcomer(vil, "labourer");
}

/** Baptisms fall due the morning after a birth. */
export function baptisms(vil: Village): void {
  const s = vil.s;
  if (!s.baptisms.length) return;
  for (const b of s.baptisms) {
    if (b.done || s.now < b.at) continue;
    b.done = true;
    const baby = vil.get(b.baby);
    if (!baby || !baby.alive || !vil.live) continue;
    const mother = vil.get(baby.parents[1]);
    const father = vil.get(baby.parents[0]);
    const party = [mother, father, vil.living().find((p) => p.trade === "priest")].filter((p): p is Villager => !!p && p.alive && p.sick < 0.4);
    party.forEach((p, i) => assign(vil, p, Act.Baptism, { x: 898 + (i - 1) * 3, y: 72 }, 20, { inside: false, carry: p === mother ? Carry.Babe : Carry.None }));
    const line = lifeLines.baptised(who(vil, baby));
    vil.emit({ kind: "birth", x: 898, actors: [baby.id, ...party.map((p) => p.id)], text: line.en, data: { la: line.la, en: line.en, baptism: 1 } });
  }
  s.baptisms = s.baptisms.filter((b) => !b.done);
}

