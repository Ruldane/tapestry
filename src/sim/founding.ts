/**
 * Founding Ashcombe: households in their houses, kin across the village,
 * old friendships and old grudges, lives with a past (marriages, children
 * buried, a trade taken up), strips in the fields, the flock, the geese.
 *
 * Only initial conditions are chosen here. Nothing about what happens next
 * is scripted.
 */
import { DAY_MS, localTime, farmMonth, farmMonthFraction, cropYear, growingQuality, datePhrase } from "./calendar";
import { CHILD_AGE, LIFE_YEAR_MS, RATION, SCHEMA } from "./constants";
import { Village } from "./core";
import { cropTime, expectedState, fieldRole } from "./fields";
import { BUILDING, CHRONICLE_SLOTS, STRIPS, sceneAt, type SceneId } from "./geography";
import { CLOTH, DYE, HAIR } from "./looks";
import { BYNAMES_NICK, BYNAMES_PLACE, FEMALE_NAMES, MALE_NAMES, nameKey, type GivenName } from "./names";
import { Rng } from "./rng";
import {
  Act,
  Carry,
  Kin,
  Work,
  type Animal,
  type AnimalKind,
  type Household,
  type Settings,
  type StripData,
  type Trade,
  type Villager,
  type VillageState,
} from "./types";
import { chronicle as chronicleLines, life as lifeLines, water as waterLines, type Line } from "../text/latin";
import { who } from "./words";

interface Plan {
  building: string;
  trade: Trade;
  byname?: string;
  headAge: [number, number];
  wifeTrade?: Trade;
  single?: boolean;
  elder?: boolean;
  widow?: boolean;
  young?: boolean;
  housekeeper?: boolean;
  staff?: boolean;
  keepAdult?: boolean;
  goosegirl?: boolean;
  /** Household dye: the colour most of them wear. */
  dye: number;
}

const PLANS: Plan[] = [
  { building: "woodward", trade: "woodward", byname: "atte Wood", headAge: [34, 50], dye: DYE.sageDark },
  { building: "swineherd", trade: "swineherd", headAge: [30, 46], dye: DYE.russet },
  { building: "westcroft", trade: "ploughman", headAge: [32, 44], elder: true, dye: DYE.woad },
  { building: "eastcroft", trade: "ploughman", headAge: [40, 52], keepAdult: true, dye: DYE.madder },
  { building: "millhouse", trade: "miller", byname: "Miller", headAge: [38, 54], keepAdult: true, dye: DYE.cream },
  { building: "bakehouse", trade: "labourer", wifeTrade: "baker", byname: "Baker", headAge: [30, 44], dye: DYE.weld },
  { building: "cottage-a", trade: "weaver", byname: "Webbe", headAge: [28, 40], dye: DYE.woadPale },
  { building: "cottage-b", trade: "reeve", headAge: [36, 50], keepAdult: true, dye: DYE.walnutPale },
  { building: "priesthouse", trade: "priest", byname: "the priest", headAge: [38, 56], single: true, housekeeper: true, dye: DYE.greyDark },
  { building: "alehouse", trade: "carpenter", wifeTrade: "alewife", headAge: [32, 46], dye: DYE.madderPale },
  { building: "cottage-c", trade: "thatcher", byname: "Thacker", headAge: [26, 38], dye: DYE.sage },
  { building: "smithy", trade: "smith", byname: "Smith", headAge: [30, 46], keepAdult: true, dye: DYE.walnut },
  { building: "manor", trade: "lord", wifeTrade: "lady", byname: "de Ashcombe", headAge: [36, 50], staff: true, dye: DYE.madder },
  { building: "cottage-d", trade: "labourer", widow: true, headAge: [56, 68], dye: DYE.rose },
  { building: "cottage-e", trade: "labourer", goosegirl: true, headAge: [30, 42], dye: DYE.sage },
  { building: "cottage-f", trade: "labourer", young: true, headAge: [20, 24], dye: DYE.woad },
  { building: "shepherd", trade: "shepherd", byname: "Shepherd", headAge: [36, 54], keepAdult: true, dye: DYE.grey },
];

const GRUDGE_CAUSES = [
  "a boundary stone moved in the West Field",
  "a strayed pig in the barley",
  "an unpaid debt of fourpence",
  "a broken betrothal",
  "words spoken at the alehouse",
  "a borrowed plough returned broken",
  "geese on the green",
  "a fine at the manor court",
  "who should stand nearest the font",
  "a hen that went missing",
  "water taken first at the well",
];

export interface FoundOptions {
  seed: number;
  now: number;
  settings: Settings;
}

export function foundVillage(opts: FoundOptions): Village {
  const rng = new Rng(opts.seed);
  const now = opts.now;
  const place = opts.settings.place;
  const lt = localTime(now, place.offsetMinutes);
  const fm = farmMonth(lt, place);
  const cy = cropYear(lt, place);

  const state: VillageState = {
    schema: SCHEMA,
    seed: opts.seed,
    rng: [0, 0, 0, 0],
    now,
    tick: 0,
    foundedAt: now,
    nextId: 1,
    nextRumour: 1,
    nextEntry: 1,
    villagers: [],
    animals: [],
    households: [],
    built: [],
    strips: [],
    manorGrain: 0,
    churchGrain: 60,
    mill: { queue: [], flow: 0.4, ground: 0 },
    meadow: { year: 0, mown: 0, stacked: 0, carted: 0 },
    builds: [],
    river: { level: 0.3, bridge: true, lostAt: 0, repair: 0 },
    rumours: [],
    chronicle: [],
    graves: [],
    inscriptions: [],
    funerals: [],
    weddings: [],
    baptisms: [],
    priestDue: 0,
    stranger: { present: false, x: 6, y: 80, tx: 6, facing: 1, stillSince: now, stitchedAt: 0, arrivedAt: 0 },
    visits: [],
    absences: [],
    harvest: { year: cy - 1, quality: 1, gathered: 0 },
    omenNight: 0,
    sermonDue: 0,
    reeveYear: lt.year,
    lastLabour: null,
    recent: [],
    nextAbsence: 1,
    counts: { births: 0, marriages: 0, burials: 0, quarrels: 0, reconciliations: 0 },
  };

  const used = new Map<string, number>();
  const pickName = (sex: 0 | 1, avoid: Set<string>, prefer?: GivenName[]): GivenName => {
    if (prefer) {
      for (const p of prefer) if (p.sex === sex && !avoid.has(p.en) && rng.chance(0.28)) return p;
    }
    const list = sex === 1 ? FEMALE_NAMES : MALE_NAMES;
    for (let tries = 0; tries < 40; tries++) {
      // Early names in each list were the common ones.
      const i = Math.min(list.length - 1, Math.floor(Math.pow(rng.next(), 1.5) * list.length));
      const n = list[i];
      if (avoid.has(n.en)) continue;
      if ((used.get(n.en) ?? 0) >= 3 && tries < 30) continue;
      return n;
    }
    return list[rng.int(0, list.length)];
  };

  const person = (sex: 0 | 1, age: number, household: number, trade: Trade, byname: string, name: GivenName, dye: number): Villager => {
    used.set(name.en, (used.get(name.en) ?? 0) + 1);
    const born = now - age * LIFE_YEAR_MS - rng.range(0, 0.9) * LIFE_YEAR_MS;
    const v: Villager = {
      id: state.nextId++,
      name: nameKey(name),
      byname,
      sex,
      born,
      household,
      trade,
      alive: true,
      spouse: -1,
      parents: [-1, -1],
      children: [],
      traits: {
        curiosity: rng.next(),
        suspicion: rng.next() * 0.8,
        sociability: 0.2 + rng.next() * 0.8,
        piety: rng.next(),
        temper: rng.next() * 0.9,
        gossip: rng.next(),
      },
      looks: {
        tunic: rng.chance(0.55) ? dye : rng.pick(CLOTH),
        hood: rng.pick(CLOTH),
        hose: rng.pick([DYE.walnut, DYE.grey, DYE.woad, DYE.walnutDark, DYE.russet, DYE.sageDark]),
        hair: age > 58 ? DYE.grey : rng.pick(HAIR),
      },
      health: 0.85 + rng.next() * 0.15,
      hunger: 0.1,
      fatigue: 0.2,
      mood: rng.range(-0.1, 0.4),
      sick: 0,
      pregnantUntil: 0,
      mourningUntil: 0,
      courting: -1,
      betrothed: -1,
      ties: {},
      rumours: {},
      history: [{ t: born, k: "born" }],
      x: 0,
      y: 78,
      tx: 0,
      ty: 78,
      act: Act.Idle,
      work: Work.None,
      carry: Carry.None,
      until: 0,
      target: -1,
      with: -1,
      facing: rng.chance(0.5) ? 1 : -1,
      inside: false,
      enter: false,
      mediate: false,
      speed: 5,
      progress: 0,
    };
    tradeTraits(v, rng);
    state.villagers.push(v);
    return v;
  };

  const setKin = (a: Villager, b: Villager, ab: Kin, ba: Kin, aff: number) => {
    a.ties[b.id] = { k: ab, a: aff, g: 0, m: 6, t: now };
    b.ties[a.id] = { k: ba, a: aff * rng.range(0.8, 1.1), g: 0, m: 6, t: now };
  };

  const marry = (h: Villager, w: Villager, yearsAgo: number) => {
    h.spouse = w.id;
    w.spouse = h.id;
    const aff = rng.chance(0.15) ? rng.range(0.05, 0.3) : rng.range(0.5, 0.9);
    setKin(h, w, Kin.Spouse, Kin.Spouse, aff);
    const t = now - yearsAgo * LIFE_YEAR_MS;
    h.history.push({ t, k: "married", o: w.id, on: nameOf(w) });
    w.history.push({ t, k: "married", o: h.id, on: nameOf(h) });
  };

  const nameOf = (v: Villager) => `${(v.sex ? FEMALE_NAMES : MALE_NAMES).find((n) => nameKey(n) === v.name)?.en ?? ""}`;

  const deadPeople: Villager[] = [];
  const dieBefore = (v: Villager, at: number, cause: string) => {
    v.alive = false;
    v.died = at;
    v.cause = cause;
    v.history.push({ t: at, k: "buried" });
    deadPeople.push(v);
  };

  // --- Households ---------------------------------------------------------
  const households: Household[] = [];
  const nickPool = shuffle(BYNAMES_NICK.slice(), rng);
  const placePool = shuffle(BYNAMES_PLACE.slice(), rng);

  for (const plan of PLANS) {
    const hid = households.length + 1;
    const byname = plan.byname ?? (rng.chance(0.5) ? nickPool.pop()! : placePool.pop()!) ?? "Townsend";
    const h: Household = { id: hid, name: "", building: plan.building, members: [], grain: 0, flour: 0, meat: 0, strips: [], founded: now - 30 * LIFE_YEAR_MS };
    households.push(h);
    const avoid = new Set<string>();
    const add = (v: Villager) => {
      h.members.push(v.id);
      avoid.add(nameOf(v));
    };

    const headAge = rng.range(plan.headAge[0], plan.headAge[1]);
    if (plan.widow) {
      const w = person(1, headAge, hid, "none", byname, pickName(1, avoid), plan.dye);
      add(w);
      const late = person(0, headAge + rng.range(0, 6), hid, "labourer", byname, pickName(0, avoid), plan.dye);
      late.alive = false;
      marry(late, w, headAge - 19);
      dieBefore(late, now - rng.range(0.5, 4) * LIFE_YEAR_MS, rng.pick(["a fever", "a fall from a cart", "the cold of a hard winter"]));
      w.history.push({ t: late.died!, k: "widowed", o: late.id, on: nameOf(late) });
      const son = person(0, rng.range(19, 26), hid, "labourer", byname, pickName(0, avoid, [nameToGiven(late)]), plan.dye);
      add(son);
      son.parents = [late.id, w.id];
      w.children.push(son.id);
      late.children.push(son.id);
      setKin(son, w, Kin.Parent, Kin.Child, rng.range(0.55, 0.9));
      h.name = `${nameOf(w)} ${byname}'s house`;
      continue;
    }

    const headSex: 0 | 1 = 0;
    const head = person(headSex, headAge, hid, plan.trade, byname, pickName(headSex, avoid), plan.dye);
    add(head);
    h.name = `${nameOf(head)} ${byname}'s house`;

    if (plan.single) {
      if (plan.housekeeper) {
        const sis = person(1, headAge + rng.range(2, 9), hid, "servant", "", pickName(1, avoid), DYE.grey);
        sis.byname = "the priest's sister";
        add(sis);
        setKin(head, sis, Kin.Sibling, Kin.Sibling, rng.range(0.4, 0.8));
        const lateHusband = person(0, headAge + 12, hid, "labourer", "", pickName(0, avoid), DYE.grey);
        lateHusband.alive = false;
        marry(lateHusband, sis, 20);
        dieBefore(lateHusband, now - rng.range(3, 12) * LIFE_YEAR_MS, "a winter fever");
        sis.history.push({ t: lateHusband.died!, k: "widowed", o: lateHusband.id, on: nameOf(lateHusband) });
      }
      head.history.push({ t: now - rng.range(4, 14) * LIFE_YEAR_MS, k: "trade", d: "came to Ashcombe as priest" });
      continue;
    }

    const wifeAge = Math.max(18, headAge - rng.range(-2, 8));
    const wife = person(1, wifeAge, hid, plan.wifeTrade ?? "none", byname, pickName(1, avoid), plan.dye);
    add(wife);
    marry(head, wife, Math.max(0.5, Math.min(headAge, wifeAge) - rng.range(17.5, 22)));

    // Children, born every two or three years; not all of them lived.
    let motherAt = 19 + rng.range(0, 3);
    const kids: Villager[] = [];
    const maxKids = plan.young ? 1 : 7;
    while (motherAt < Math.min(wifeAge - 0.4, 42) && kids.length + 1 <= maxKids) {
      const age = wifeAge - motherAt;
      motherAt += rng.range(1.7, 3.4);
      if (age > (plan.keepAdult ? 22 : 16.5)) continue;
      const sex: 0 | 1 = rng.chance(0.5) ? 0 : 1;
      const name = pickName(sex, avoid, [nameToGiven(head), nameToGiven(wife)]);
      let trade: Trade = "none";
      if (age >= 15) trade = sex === 0 ? (plan.trade === "smith" || plan.trade === "miller" || plan.trade === "shepherd" ? plan.trade : "labourer") : "none";
      const child = person(sex, age, hid, trade, byname, name, plan.dye);
      child.parents = [head.id, wife.id];
      head.children.push(child.id);
      wife.children.push(child.id);
      setKin(child, head, Kin.Parent, Kin.Child, rng.range(0.4, 0.9));
      setKin(child, wife, Kin.Parent, Kin.Child, rng.range(0.55, 0.95));
      child.looks.hair = rng.chance(0.6) ? head.looks.hair : wife.looks.hair;
      if (child.looks.hair === DYE.grey) child.looks.hair = DYE.walnut;
      if (!rng.chance(age < 1 ? 0.95 : 0.83)) {
        // Buried young.
        const diedAge = rng.range(0.1, Math.min(age, 5));
        const at = child.born + diedAge * LIFE_YEAR_MS;
        if (at < now) {
          dieBefore(child, at, rng.pick(["a fever", "the flux", "a cough in winter", "no cause anyone could name"]));
          head.history.push({ t: at, k: "childBuried", o: child.id, on: nameOf(child) });
          wife.history.push({ t: at, k: "childBuried", o: child.id, on: nameOf(child) });
          continue;
        }
      }
      if (plan.goosegirl && sex === 1 && age >= 7 && age <= 15 && !kids.some((k) => k.trade === "goosegirl")) child.trade = "goosegirl";
      add(child);
      for (const sib of kids) setKin(child, sib, Kin.Sibling, Kin.Sibling, rng.range(0.25, 0.85));
      kids.push(child);
    }

    if (plan.elder) {
      const mother = person(1, rng.range(62, 72), hid, "none", byname, pickName(1, avoid), DYE.grey);
      add(mother);
      head.parents = [-1, mother.id];
      mother.children.push(head.id);
      setKin(head, mother, Kin.Parent, Kin.Child, rng.range(0.5, 0.85));
      for (const k of kids) setKin(k, mother, Kin.Grand, Kin.Grand, rng.range(0.5, 0.9));
      setKin(wife, mother, Kin.InLaw, Kin.InLaw, rng.range(-0.2, 0.5));
    }

    if (plan.staff) {
      const steward = person(0, rng.range(40, 55), hid, "steward", "Reve", pickName(0, avoid), DYE.woad);
      add(steward);
      const maid = person(1, rng.range(17, 23), hid, "servant", rng.pick(placePool) ?? "Townsend", pickName(1, avoid), DYE.cream);
      add(maid);
      const lad = person(0, rng.range(17, 24), hid, "servant", rng.pick(nickPool) ?? "Long", pickName(0, avoid), DYE.walnutPale);
      add(lad);
    }

    if (plan.trade === "reeve") head.history.push({ t: now - rng.range(1, 3) * LIFE_YEAR_MS, k: "reeve" });
    else if (plan.trade !== "labourer" && plan.trade !== "lord") head.history.push({ t: now - rng.range(6, 18) * LIFE_YEAR_MS, k: "trade", d: tradeWords(plan.trade) });
    if (plan.wifeTrade && plan.wifeTrade !== "lady") wife.history.push({ t: now - rng.range(3, 12) * LIFE_YEAR_MS, k: "trade", d: tradeWords(plan.wifeTrade) });
  }

  state.households = households;
  const vil = new Village(state, opts.settings);
  const living = () => state.villagers.filter((v) => v.alive);
  const adults = () => living().filter((v) => vil.age(v) >= 16);

  // --- Kin across the village: grown children and siblings who married out.
  const heads = households.map((h) => state.villagers.find((v) => v.id === h.members[0])!).filter((v) => v && v.alive);
  for (let i = 0; i < 6; i++) {
    const a = rng.pick(adults());
    const b = rng.pick(adults());
    if (a.household === b.household || a.ties[b.id]) continue;
    if (Math.abs(vil.age(a) - vil.age(b)) > 14) continue;
    setKin(a, b, Kin.Sibling, Kin.Sibling, rng.range(0.1, 0.8));
    const sa = state.villagers.find((v) => v.id === a.spouse);
    const sb = state.villagers.find((v) => v.id === b.spouse);
    if (sa && sa.alive) setKin(sa, b, Kin.InLaw, Kin.InLaw, rng.range(-0.2, 0.5));
    if (sb && sb.alive) setKin(sb, a, Kin.InLaw, Kin.InLaw, rng.range(-0.2, 0.5));
  }
  void heads;

  // --- Neighbours and friends --------------------------------------------
  for (const a of adults()) {
    const ha = BUILDING[households[a.household - 1].building];
    const others = adults().filter((b) => b.id !== a.id && !a.ties[b.id]);
    const scored = others
      .map((b) => {
        const hb = BUILDING[households[b.household - 1].building];
        const d = Math.abs(ha.x - hb.x);
        const ageGap = Math.abs(vil.age(a) - vil.age(b));
        return { b, s: rng.next() * 0.6 + Math.max(0, 1 - d / 260) * 0.8 + Math.max(0, 1 - ageGap / 25) * 0.4 + (a.sex === b.sex ? 0.2 : 0) };
      })
      .sort((x, y) => y.s - x.s);
    const nFriends = 2 + rng.int(0, 3);
    for (let i = 0; i < nFriends && i < scored.length; i++) {
      const b = scored[i].b;
      if (a.ties[b.id]) continue;
      const aff = rng.range(0.25, 0.7);
      a.ties[b.id] = { k: Kin.None, a: aff, g: 0, m: rng.int(3, 20), t: now };
      b.ties[a.id] = { k: Kin.None, a: aff * rng.range(0.7, 1.1), g: 0, m: a.ties[b.id].m, t: now };
    }
  }

  // --- Old grudges ---------------------------------------------------------
  const causes = shuffle(GRUDGE_CAUSES.slice(), rng);
  const grudge = (a: Villager, b: Villager, g: number, cause: string) => {
    const ab = (a.ties[b.id] ??= { k: Kin.None, a: 0, g: 0, m: 4, t: now });
    const ba = (b.ties[a.id] ??= { k: Kin.None, a: 0, g: 0, m: 4, t: now });
    ab.g = g;
    ab.gc = cause;
    ab.a = Math.min(ab.a, rng.range(-0.5, -0.1));
    ba.g = g * rng.range(0.6, 1.1);
    ba.gc = cause;
    ba.a = Math.min(ba.a, rng.range(-0.4, 0));
    const t = now - rng.range(0.3, 6) * LIFE_YEAR_MS;
    a.history.push({ t, k: "grudge", o: b.id, on: nameOf(b), d: cause });
    b.history.push({ t, k: "grudge", o: a.id, on: nameOf(a), d: cause });
  };
  const miller = living().find((v) => v.trade === "miller");
  const reeve = living().find((v) => v.trade === "reeve");
  if (miller && reeve) grudge(miller, reeve, rng.range(0.35, 0.55), "the mill toll");
  for (let i = 0; i < 9; i++) {
    const a = rng.pick(adults());
    const b = rng.pick(adults());
    if (a.id === b.id || a.household === b.household) continue;
    const t = a.ties[b.id];
    if (t && (t.k === Kin.Spouse || t.a > 0.5)) continue;
    grudge(a, b, rng.range(0.25, 0.7), causes.pop() ?? "an old matter nobody will explain");
  }

  // --- Rumours about the old quarrels --------------------------------------
  for (const a of adults()) {
    for (const k in a.ties) {
      const t = a.ties[k];
      const b = Number(k);
      if (t.g < 0.3 || a.id > b) continue;
      const r = { id: state.nextRumour++, kind: "quarrel" as const, subj: [a.id, b], v: 0, origin: a.id, at: now - LIFE_YEAR_MS, heard: 0 };
      state.rumours.push(r);
      const hearers = shuffle(
        adults().filter((x) => x.id !== a.id && x.id !== b),
        rng,
      ).slice(0, rng.int(2, 6));
      for (const x of [a, ...hearers]) {
        x.rumours[r.id] = { v: rng.chance(0.2) ? 1 : 0, from: a.id, at: r.at };
        r.heard++;
      }
    }
  }

  // --- Strips --------------------------------------------------------------
  const ct = cropTime(fm, farmMonthFraction(lt));
  const holders: Record<string, number> = {
    westcroft: 3,
    eastcroft: 3,
    "cottage-b": 2,
    "cottage-c": 2,
    "cottage-e": 2,
    "cottage-a": 1,
    alehouse: 1,
    smithy: 1,
    woodward: 1,
    swineherd: 1,
    bakehouse: 1,
    millhouse: 1,
    shepherd: 1,
    priesthouse: 1,
  };
  const owners: number[] = [];
  for (const h of households) for (let i = 0; i < (holders[h.building] ?? 0); i++) owners.push(h.id);
  while (owners.length < STRIPS.length) owners.push(-1);
  shuffle(owners, rng);
  state.strips = STRIPS.map((s, i): StripData => {
    const role = fieldRole(s.field, cy);
    const owner = owners[i];
    if (owner > 0) households[owner - 1].strips.push(s.id);
    return { id: s.id, owner, state: expectedState(role, ct), work: 0, year: cy, flood: 0, care: 1 };
  });

  // --- Stores ----------------------------------------------------------------
  const lastQ = growingQuality(opts.seed, cy - 1, place, opts.settings.weather);
  const monthsLeft = Math.max(0.6, (11.3 - ct + 12) % 12);
  for (const h of households) {
    const need = h.members.reduce((s, id) => {
      const v = state.villagers.find((x) => x.id === id)!;
      return s + (vil.age(v) < CHILD_AGE ? 0.6 : 1);
    }, 0);
    const perMonth = need * RATION * 30.4;
    h.grain = perMonth * monthsLeft * rng.range(0.85, 1.2) * Math.min(1.1, 0.6 + lastQ * 0.45) + (h.building === "manor" ? 0 : 1);
    h.flour = perMonth * rng.range(0.2, 0.6);
    h.meat = 0;
  }
  state.manorGrain = 520 * (monthsLeft / 12) + 90;
  state.harvest = { year: ct >= 11 ? cy : cy - 1, quality: lastQ, gathered: 0 };

  // --- Animals ---------------------------------------------------------------
  const animal = (kind: AnimalKind, owner: number, young = false): Animal => {
    const a: Animal = {
      id: state.nextId++,
      kind,
      owner,
      x: 0,
      y: 80,
      tx: 0,
      ty: 80,
      alive: true,
      young,
      born: now - (young ? rng.range(0.05, 0.3) : rng.range(1, 6)) * LIFE_YEAR_MS,
      sick: 0,
      follow: -1,
      alarmUntil: 0,
      loose: false,
      until: 0,
      facing: rng.chance(0.5) ? 1 : -1,
      state: 0,
    };
    state.animals.push(a);
    return a;
  };
  const hhOf = (b: string) => households.find((h) => h.building === b)!.id;
  for (let i = 0; i < 20; i++) animal("sheep", -1);
  if (fm >= 2 && fm <= 4) for (let i = 0; i < 6; i++) animal("sheep", -1, true);
  for (let i = 0; i < 7; i++) animal("goose", hhOf("cottage-e"));
  for (let i = 0; i < 4; i++) animal("ox", -1);
  for (const b of ["millhouse", "shepherd", "manor", "woodward", "alehouse"]) animal("dog", hhOf(b));
  for (const b of ["swineherd", "swineherd", "swineherd", "westcroft", "eastcroft", "cottage-b", "smithy", "bakehouse"]) animal("pig", hhOf(b));

  // --- The churchyard, the chronicle ------------------------------------------
  deadPeople.sort((a, b) => (a.died ?? 0) - (b.died ?? 0));
  const recentDead = deadPeople.slice(-9);
  recentDead.forEach((d, i) => state.graves.push({ slot: i, villager: d.id, name: nameOf(d), t: d.died! }));

  const entry = (kind: VillageState["chronicle"][number]["kind"], line: Line, scene: SceneId, t: number, actors: number[] = []) => {
    const slot = kind === "incipit" ? undefined : CHRONICLE_SLOTS.find((s) => s.scene === scene && !state.chronicle.some((c) => c.slot === s.id));
    state.chronicle.push({ id: state.nextEntry++, t, kind, la: line.la, en: line.en, scene, slot: slot?.id ?? -1, away: null, actors });
  };
  entry("incipit", { la: "HOC OPUS INCEPTUM EST ANNO DOMINI MCCCLXXXII", en: "This work was begun in the year of our Lord 1382" }, "forest", now - 400 * DAY_MS);
  const lastBuried = deadPeople[deadPeople.length - 1];
  if (lastBuried) {
    const n = FEMALE_NAMES.concat(MALE_NAMES).find((g) => nameKey(g) === lastBuried.name)!;
    entry(
      "burial",
      { la: `HIC ${lastBuried.sex ? "SEPULTA" : "SEPULTUS"} EST ${n.nom}`, en: `Here ${n.en} is buried, ${datePhrase(lastBuried.died!, place.offsetMinutes)}` },
      "green",
      lastBuried.died!,
      [lastBuried.id],
    );
  }
  const q = chronicleLines.harvest(lastQ >= 0.85);
  entry("harvest", { la: q.la, en: `${q.en}, the year before the stranger came` }, "fields", now - 60 * DAY_MS);
  const youngCouple = households.find((h) => h.building === "cottage-f");
  if (youngCouple) {
    const [a, b] = youngCouple.members.map((id) => state.villagers.find((v) => v.id === id)!);
    if (a && b) {
      const na = MALE_NAMES.concat(FEMALE_NAMES).find((g) => nameKey(g) === a.name)!;
      const nb = MALE_NAMES.concat(FEMALE_NAMES).find((g) => nameKey(g) === b.name)!;
      const t = a.history.find((h) => h.k === "married")?.t ?? now;
      entry("marriage", { la: `HIC ${na.nom} ET ${nb.nom} MATRIMONIO IUNGUNTUR`, en: `Here ${na.en} and ${nb.en} are joined in marriage, ${datePhrase(t, place.offsetMinutes)}` }, "green", t, [a.id, b.id]);
    }
  }

  for (const v of state.villagers) v.history.sort((a, b) => a.t - b.t);
  state.rng = rng.state();
  vil.rng = new Rng(state.rng);
  vil.reindex();

  // Older work along the lower border, so no stretch of it is bare on the first visit.
  const fl = waterLines.floods();
  entry("spate", { la: fl.la, en: `${fl.en}, the winter before the stranger came` }, "river", now - 240 * DAY_MS);
  const theReeve = living().find((v) => v.trade === "reeve");
  if (theReeve) {
    const line = lifeLines.reeve(who(vil, theReeve));
    entry("reeve", line, "manor", theReeve.history.find((h) => h.k === "reeve")?.t ?? now - 300 * DAY_MS, [theReeve.id]);
  }
  const commonBabe = living()
    .filter((v) => {
      const h = households.find((x) => x.id === v.household);
      return !!h && sceneAt(BUILDING[h.building]?.x ?? 0).id === "common" && now - v.born < 3 * LIFE_YEAR_MS;
    })
    .sort((a, b) => b.born - a.born)[0];
  if (commonBabe) entry("birth", lifeLines.born(who(vil, commonBabe)), "common", commonBabe.born, [commonBabe.id]);
  return vil;
}

export function shuffle<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(0, i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function nameToGiven(v: Villager): GivenName {
  const list = v.sex ? FEMALE_NAMES : MALE_NAMES;
  return list.find((n) => nameKey(n) === v.name) ?? list[0];
}

export function tradeWords(t: Trade): string {
  const words: Partial<Record<Trade, string>> = {
    woodward: "was made woodward",
    swineherd: "took the pigs to keep",
    ploughman: "took up the plough",
    miller: "took the mill at farm from the lord",
    baker: "took the bakehouse",
    weaver: "set up a loom",
    carpenter: "was apprenticed a carpenter",
    alewife: "began to brew for sale",
    thatcher: "learned thatching from a cousin",
    smith: "took the smithy after the old smith",
    shepherd: "was given the lord's flock",
  };
  return words[t] ?? "found work";
}

function tradeTraits(v: Villager, rng: Rng): void {
  const t = v.traits;
  switch (v.trade) {
    case "priest":
      t.piety = 0.75 + rng.next() * 0.25;
      t.sociability = Math.max(t.sociability, 0.6);
      t.temper = Math.min(t.temper, 0.35);
      t.suspicion = Math.min(t.suspicion, 0.3);
      break;
    case "reeve":
      t.suspicion = 0.6 + rng.next() * 0.35;
      t.gossip = Math.max(t.gossip, 0.4);
      break;
    case "alewife":
      t.sociability = 0.8 + rng.next() * 0.2;
      t.gossip = 0.7 + rng.next() * 0.3;
      t.suspicion = Math.min(t.suspicion, 0.3);
      break;
    case "miller":
      t.temper = Math.max(t.temper, 0.5);
      break;
    case "lord":
    case "lady":
      t.sociability *= 0.6;
      break;
  }
}
