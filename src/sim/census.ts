/**
 * Reading the village: the parish roll, a villager's stitched biography
 * (built only from what is recorded of them), and a plain account of what
 * is happening now, for anyone who would rather read than watch.
 */
import { datePhrase, LABOUR_WORDS, MONTH_NAMES } from "./calendar";
import { CHILD_AGE } from "./constants";
import type { Village } from "./core";
import { FIELD_NAMES, SCENES, sceneAt, STRIPS } from "./geography";
import { rumourText } from "./social";
import { Act, Carry, Kin, PILGRIM, Work, type Villager } from "./types";
import { called, TRADE_EN } from "./words";
import { numberWord } from "../text/keeper";

// ---------------------------------------------------------------------------
// What someone is doing
// ---------------------------------------------------------------------------

const WORK_WORDS: Partial<Record<number, string>> = {
  [Work.Plough]: "ploughing",
  [Work.Sow]: "sowing",
  [Work.Harrow]: "harrowing",
  [Work.Weed]: "weeding",
  [Work.Mow]: "mowing hay",
  [Work.Rake]: "raking hay",
  [Work.Reap]: "reaping",
  [Work.Bind]: "binding sheaves",
  [Work.Cart]: "carting",
  [Work.Thresh]: "threshing in the barn",
  [Work.Prune]: "pruning and hedging",
  [Work.Dig]: "digging the garden",
  [Work.Shear]: "shearing",
  [Work.Herd]: "with the flock",
  [Work.Mill]: "at the mill",
  [Work.Bake]: "baking",
  [Work.Brew]: "brewing",
  [Work.Smith]: "at the forge",
  [Work.Carpenter]: "at carpentry",
  [Work.Thatch]: "thatching a roof",
  [Work.Spin]: "spinning",
  [Work.Weave]: "at the loom",
  [Work.Garden]: "in the garden",
  [Work.Slaughter]: "killing the pig",
  [Work.Woodcut]: "cutting wood",
  [Work.Oversee]: "watching the work",
  [Work.Serve]: "serving ale",
  [Work.Geese]: "minding the geese",
  [Work.Glean]: "gleaning",
  [Work.Scare]: "scaring birds off the seed",
  [Work.Pannage]: "with the pigs",
  [Work.Office]: "saying the office",
};

export function doing(vil: Village, v: Villager): string {
  const other = (id: number) => {
    if (id === PILGRIM) return "the stranger";
    const o = vil.get(id);
    return o ? called(vil, o) : "someone";
  };
  const walking = !v.inside && Math.hypot(v.tx - v.x, v.ty - v.y) > 4;
  const where = sceneAt(v.tx).name.replace(/^The /, "the ");
  let what: string;
  switch (v.act) {
    case Act.Sleep:
      return "asleep";
    case Act.Sick:
      return "sick in bed";
    case Act.Rest:
      if (vil.age(v) < 2.5) return "in arms";
      what = v.work === Work.Spin ? "spinning by the door" : v.carry === Carry.Babe ? "resting with the new child" : v.inside ? "indoors" : "sitting by the door";
      break;
    case Act.Eat:
      what = "at table";
      break;
    case Act.Work: {
      what = WORK_WORDS[v.work] ?? "at work";
      if (v.target >= 0 && v.target < STRIPS.length && (v.work === Work.Plough || v.work === Work.Sow || v.work === Work.Reap || v.work === Work.Bind || v.work === Work.Cart || v.work === Work.Weed)) {
        what += ` in the ${FIELD_NAMES[STRIPS[v.target].field]}`;
      }
      break;
    }
    case Act.Service:
      what = "at mass";
      break;
    case Act.Pray:
      what = v.work === Work.Office ? "saying the office in the church" : "praying";
      break;
    case Act.Drink:
      what = "drinking at the alehouse";
      break;
    case Act.Chat:
      what = `talking with ${other(v.with)}`;
      break;
    case Act.Argue:
      what = `quarrelling with ${other(v.with)}`;
      break;
    case Act.Court:
      what = `walking out with ${other(v.with)}`;
      break;
    case Act.Play:
      what = "playing";
      break;
    case Act.FollowStranger:
      return "following the stranger";
    case Act.WatchStranger:
      return "keeping an eye on the stranger";
    case Act.GreetStranger:
      return "going to greet the stranger";
    case Act.Mourn:
      what = "at a grave in the churchyard";
      break;
    case Act.Funeral:
      what = "at a funeral";
      break;
    case Act.Wedding:
      what = "at a wedding";
      break;
    case Act.Carry:
      what = v.carry === Carry.Grain ? "carrying grain to the mill" : v.carry === Carry.Flour ? "carrying flour home" : "waiting at the mill";
      return what;
    case Act.Alms:
      return "asking for help with bread";
    case Act.SaveFlock:
      return "driving sheep out of the flood";
    case Act.SkyWatch:
      return "watching the sky";
    case Act.Sermon:
      what = "hearing a sermon";
      break;
    case Act.Feast:
      what = "feasting";
      break;
    case Act.Dance:
      what = "dancing";
      break;
    case Act.Visit:
      what = `visiting ${other(v.target)}`;
      break;
    case Act.Baptism:
      what = "at a christening";
      break;
    case Act.ChaseGoose:
      return "chasing a goose";
    case Act.Repair:
      what = vil.s.builds[0]?.building === "bridge" ? "mending the bridge" : "building a house";
      break;
    case Act.Fetch:
      if (v.target === -4) return "gathering firewood in the wood";
      if (v.target === -3) return v.carry === Carry.Wood ? "carrying firewood home" : "carrying water home from the well";
      what = "going for water at the well";
      break;
    case Act.Wander:
      what = "walking about";
      break;
    default:
      what = "standing about";
  }
  return walking ? `on the way to ${where}, ${what}` : what;
}

// ---------------------------------------------------------------------------
// Biography
// ---------------------------------------------------------------------------

export interface Person {
  id: number;
  name: string;
}

export interface Biography {
  id: number;
  alive: boolean;
  name: string;
  latin: string;
  title: string;
  age: string;
  household: string;
  scene: string;
  doing: string;
  lines: string[];
  kin: (Person & { relation: string })[];
  friends: Person[];
  grudges: (Person & { over: string })[];
  says: string[];
  stranger: string;
  x: number;
  y: number;
  sex: 0 | 1;
}

function ageWords(years: number): string {
  if (years < 1) return "a baby";
  if (years < 2) return "a year old";
  if (years < 13) return `${numberWord(Math.floor(years))} years old`;
  if (years < 20) return "not yet twenty";
  if (years < 30) return "in their twenties";
  if (years < 40) return "in their thirties";
  if (years < 50) return "in their forties";
  if (years < 60) return "in their fifties";
  if (years < 70) return "past sixty";
  return "very old";
}

function relationWord(k: number, sex: 0 | 1, older = false): string {
  switch (k) {
    case Kin.Parent:
      return sex ? "mother" : "father";
    case Kin.Child:
      return sex ? "daughter" : "son";
    case Kin.Sibling:
      return sex ? "sister" : "brother";
    case Kin.Spouse:
      return sex ? "wife" : "husband";
    case Kin.Grand:
      return older ? (sex ? "grandmother" : "grandfather") : sex ? "granddaughter" : "grandson";
    case Kin.InLaw:
      return "in-law";
    case Kin.Cousin:
      return "cousin";
  }
  return "";
}

export function biography(vil: Village, id: number): Biography | null {
  const v = vil.get(id);
  if (!v) return null;
  const off = vil.settings.place.offsetMinutes;
  const age = vil.age(v, v.alive ? vil.s.now : (v.died ?? vil.s.now));
  const h = vil.household(v.household);
  const lines: string[] = [];

  // Who they are.
  const trade = TRADE_EN[v.trade];
  const father = vil.get(v.parents[0]);
  const mother = vil.get(v.parents[1]);
  if (age < CHILD_AGE) {
    const parent = father ?? mother;
    const other = parent === father ? mother : undefined;
    lines.push(`${v.sex ? "Daughter" : "Son"} of ${parent ? vil.fullName(parent) : "a family now gone"}${other ? ` and ${vil.first(other)}` : ""}.`);
  } else if (v.trade === "goosegirl") lines.push("Minds the geese.");
  else if (v.history.some((x) => x.k === "widowed") && v.spouse < 0) lines.push(v.sex ? "A widow." : "A widower.");
  // (Otherwise the name and trade are already in the heading.)

  // The recorded life, most telling first.
  const hist = v.history;
  const married = hist.filter((x) => x.k === "married");
  for (const m of married.slice(-2)) lines.push(`Married ${m.on ?? "someone"} ${datePhrase(m.t, off)}.`);
  const widowed = hist.filter((x) => x.k === "widowed").slice(-1)[0];
  if (widowed) lines.push(`Buried ${v.sex ? "her husband" : "his wife"} ${widowed.on ?? ""} ${datePhrase(widowed.t, off)}.`.replace("  ", " "));
  const buriedKids = hist.filter((x) => x.k === "childBuried").length;
  if (buriedKids) lines.push(`Buried ${buriedKids === 1 ? "a child" : `${numberWord(buriedKids)} children`}.`);
  const living = v.children.map((c) => vil.get(c)).filter((c) => c && c.alive).length;
  if (living && age >= 18) lines.push(`${living === 1 ? "One child" : `${cap(numberWord(living))} children`} living.`);
  const reeve = hist.filter((x) => x.k === "reeve").slice(-1)[0];
  if (reeve) lines.push(`Chosen reeve ${datePhrase(reeve.t, off)}.`);
  const tradeH = hist.filter((x) => x.k === "trade" || x.k === "arrived").slice(-1)[0];
  if (tradeH?.d && !reeve) lines.push(`${cap(tradeH.d)} ${datePhrase(tradeH.t, off)}.`);
  if (hist.some((x) => x.k === "namedForStranger" && x.o === undefined)) lines.push("Named after the stranger.");
  const namedChild = hist.find((x) => x.k === "namedForStranger" && x.o !== undefined);
  if (namedChild) lines.push(`Named a child for the stranger.`);
  if (hist.some((x) => x.k === "savedFlock")) lines.push("Helped drive the flock out of the flood.");
  const star = hist.filter((x) => x.k === "sawStar").slice(-1)[0];
  if (star?.d) lines.push(`${cap(star.d)}.`);
  const postponed = hist.find((x) => x.k === "postponed");
  if (postponed) lines.push("Had a wedding put off for the star.");
  const fined = hist.filter((x) => x.k === "fined").slice(-1)[0];
  if (fined) lines.push(`Fined by the reeve ${fined.d ?? ""}.`.replace(" .", "."));
  const alms = hist.some((x) => x.k === "alms");
  if (alms) lines.push("Has had to ask the manor for bread.");

  // Feelings, from the ties.
  let worst: { id: number; g: number; gc?: string } | null = null;
  let best: { id: number; a: number } | null = null;
  const kin: Biography["kin"] = [];
  const friends: Person[] = [];
  const grudges: Biography["grudges"] = [];
  for (const k in v.ties) {
    const oid = Number(k);
    if (oid === PILGRIM) continue;
    const t = v.ties[k];
    const o = vil.get(oid);
    if (!o) continue;
    if (t.k !== Kin.None && o.alive) kin.push({ id: oid, name: vil.fullName(o), relation: relationWord(t.k, o.sex, o.born < v.born) });
    if (t.g > 0.3 && o.alive) {
      grudges.push({ id: oid, name: vil.fullName(o), over: t.gc ?? "an old matter" });
      if (!worst || t.g > worst.g) worst = { id: oid, g: t.g, gc: t.gc };
    }
    if (t.k === Kin.None && t.a > 0.45 && o.alive) {
      friends.push({ id: oid, name: vil.fullName(o) });
      if (!best || t.a > best.a) best = { id: oid, a: t.a };
    }
  }
  if (v.alive) {
    if (worst) {
      const o = vil.get(worst.id)!;
      lines.push(worst.g > 0.6 ? `Does not speak to ${called(vil, o)}.` : `Has words with ${called(vil, o)} over ${worst.gc ?? "an old matter"}.`);
    }
    if (best) lines.push(`Thick with ${called(vil, vil.get(best.id)!)}.`);
    const c = vil.get(v.courting);
    if (c && c.alive) lines.push(`Walking out with ${vil.first(c)}.`);
    const b = vil.get(v.betrothed);
    if (b && b.alive) lines.push(`Betrothed to ${vil.first(b)}.`);
    if (v.sick > 0.3) lines.push("Lies sick.");
    if (v.hunger > 0.7) lines.push("Hungry.");
  } else {
    lines.push(`Buried ${datePhrase(v.died ?? vil.s.now, off)}${v.cause ? `, of ${v.cause}` : ""}.`);
  }

  // The stranger.
  const ts = v.ties[PILGRIM];
  let stranger = "Has not seen the stranger.";
  const blamed = hist.find((x) => x.k === "blamedStranger");
  if (blamed) stranger = `Blames the stranger for ${blamed.d ?? "a sick beast"}.`;
  else if (ts && ts.m > 0) {
    const times = ts.m === 1 ? "once" : ts.m === 2 ? "twice" : `${numberWord(Math.min(ts.m, 12))} times`;
    const feel = ts.a > 0.45 ? "and is fond of them" : ts.a > 0.15 ? "and thinks well of them" : ts.a < -0.3 ? "and does not trust them" : ts.a < -0.05 ? "and is wary" : "";
    stranger = `Has seen the stranger ${times}${feel ? `, ${feel}` : ""}.`;
  } else if (ts && ts.a !== 0) stranger = ts.a < -0.1 ? "Has only heard of the stranger, and not to their credit." : "Has only heard of the stranger.";
  const says: string[] = [];
  for (const k in v.rumours) {
    const r = vil.s.rumours.find((x) => x.id === Number(k));
    if (r) says.push(rumourText(vil, r, v.rumours[k].v));
  }

  return {
    id: v.id,
    alive: v.alive,
    name: vil.fullName(v),
    latin: vil.given(v).nom,
    title: trade && v.trade !== "none" ? trade : age < CHILD_AGE ? (v.sex ? "girl" : "boy") : "",
    age: ageWords(age),
    household: h?.name ?? "",
    scene: sceneAt(v.x).name,
    doing: v.alive ? doing(vil, v) : "buried in the churchyard",
    lines: lines.slice(0, 8),
    kin: kin.slice(0, 8),
    friends: friends.slice(0, 5),
    grudges: grudges.slice(0, 4),
    says: says.slice(0, 4),
    stranger,
    x: v.x,
    y: v.y,
    sex: v.sex,
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------
// The parish roll
// ---------------------------------------------------------------------------

export interface RollHousehold {
  id: number;
  name: string;
  scene: string;
  members: { id: number; name: string; age: number; trade: string; note: string }[];
  grain: number;
  flour: number;
  strips: number;
  short: boolean;
}

export interface Roll {
  when: string;
  population: number;
  households: RollHousehold[];
  births: { id: number; name: string; t: string; parents: string }[];
  marriages: { a: string; b: string; t: string }[];
  burials: { id: number; name: string; t: string; age: number; cause: string }[];
  harvest: { year: number; quality: string; gathered: number } | null;
  stores: { households: number; manor: number; church: number; weeks: number };
  beasts: { sheep: number; lambs: number; geese: number; pigs: number; oxen: number; dogs: number };
  fields: { name: string; state: string }[];
  stranger: { visits: number; heard: number; met: number; fond: number; wary: number; followers: number };
  river: string;
  labour: string;
  counts: { births: number; marriages: number; burials: number; quarrels: number; reconciliations: number };
}

const STATE_WORDS: Record<string, string> = {
  fallow: "lying fallow",
  stubble: "in stubble",
  ploughed: "ploughed",
  sown: "sown",
  shoots: "green with shoots",
  green: "growing",
  ripe: "ripe",
  reaped: "reaped, in stooks",
};

export function parishRoll(vil: Village): Roll {
  const s = vil.s;
  const off = vil.settings.place.offsetMinutes;
  const living = vil.living();
  const households: RollHousehold[] = s.households
    .filter((h) => !h.ended)
    .map((h) => ({
      id: h.id,
      name: h.name,
      scene: sceneAt(vil.home(vil.get(h.members[0]) ?? living[0]).x).name,
      members: h.members
        .map((id) => vil.get(id))
        .filter((m): m is Villager => !!m && m.alive)
        .map((m) => ({
          id: m.id,
          name: vil.fullName(m),
          age: Math.floor(vil.age(m)),
          trade: TRADE_EN[m.trade] || (vil.age(m) < CHILD_AGE ? "child" : ""),
          note: m.sick > 0.3 ? "sick" : m.pregnantUntil > 0 ? "with child" : m.mourningUntil > s.now ? "in mourning" : "",
        })),
      grain: Math.round(h.grain),
      flour: Math.round(h.flour * 10) / 10,
      strips: h.strips.length,
      short: h.flour + h.grain + h.meat < 0.05 && h.building !== "manor",
    }));
  const born = s.villagers.filter((v) => v.history[0]?.k === "born" && v.born >= s.foundedAt).sort((a, b) => b.born - a.born).slice(0, 30);
  const births = born.map((b) => {
    const par = [vil.get(b.parents[0]), vil.get(b.parents[1])].filter((p): p is Villager => !!p).map((p) => vil.first(p));
    return { id: b.id, name: vil.fullName(b), t: datePhrase(b.born, off), parents: par.join(" and ") };
  });
  const marriages: Roll["marriages"] = [];
  for (const v of s.villagers) {
    if (v.sex !== 0) continue;
    for (const h of v.history) if (h.k === "married" && h.t >= s.foundedAt) marriages.push({ a: vil.fullName(v), b: h.on ?? "", t: datePhrase(h.t, off) });
  }
  marriages.reverse();
  const dead = s.villagers.filter((v) => !v.alive && v.died).sort((a, b) => (b.died ?? 0) - (a.died ?? 0)).slice(0, 30);
  const burials = dead.map((d) => ({
    id: d.id,
    name: vil.fullName(d),
    t: (d.died ?? 0) < s.foundedAt ? "before the hanging was begun" : datePhrase(d.died ?? 0, off),
    age: Math.floor(vil.age(d, d.died)),
    cause: d.cause ?? "",
  }));
  const hhGrain = s.households.filter((h) => !h.ended).reduce((a, h) => a + h.grain + h.flour, 0);
  let ration = 0;
  for (const v of living) ration += vil.age(v) < CHILD_AGE ? 0.6 : 1;
  const weeks = ration > 0 ? (hhGrain + s.manorGrain) / (ration * 0.034 * 7) : 0;
  const count = (k: string, young?: boolean) => s.animals.filter((a) => a.alive && a.kind === k && (young === undefined || a.young === young)).length;
  const stranger = s.rumours.find((r) => r.kind === "stranger");
  let met = 0;
  let fond = 0;
  let wary = 0;
  for (const v of living) {
    const t = v.ties[PILGRIM];
    if (!t) continue;
    if (t.m > 0) met++;
    if (t.a > 0.25) fond++;
    if (t.a < -0.15) wary++;
  }
  const fields = [0, 1, 2].map((f) => {
    const strips = s.strips.filter((st) => STRIPS[st.id].field === f);
    const tally = new Map<string, number>();
    for (const st of strips) tally.set(st.state, (tally.get(st.state) ?? 0) + 1);
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    const words = top.map(([st, n]) => (n === strips.length ? STATE_WORDS[st] : `${numberWord(n)} strips ${STATE_WORDS[st]}`)).join(", ");
    return { name: FIELD_NAMES[f], state: words };
  });
  const lvl = s.river.level;
  const river = `${lvl > 0.84 ? "in full spate" : lvl > 0.7 ? "in spate, over the meadow" : lvl > 0.5 ? "high" : lvl > 0.3 ? "running at its usual height" : "low"}${s.river.bridge ? "" : "; the footbridge is gone"}`;
  const e = vil.env;
  return {
    when: `${datePhrase(s.now, off)}, ${hourWords(e.hour)}`,
    population: living.length,
    households,
    births,
    marriages: marriages.slice(0, 30),
    burials,
    harvest: s.harvest.gathered > 0 || s.harvest.year > 0 ? { year: s.harvest.year + 1, quality: s.harvest.quality >= 1 ? "good" : s.harvest.quality >= 0.8 ? "fair" : "thin", gathered: Math.round(s.harvest.gathered) } : null,
    stores: { households: Math.round(hhGrain), manor: Math.round(s.manorGrain), church: Math.round(s.churchGrain), weeks: Math.round(weeks) },
    beasts: { sheep: count("sheep", false), lambs: count("sheep", true), geese: count("goose"), pigs: count("pig"), oxen: count("ox"), dogs: count("dog") },
    fields,
    stranger: { visits: s.visits.length, heard: stranger?.heard ?? 0, met, fond, wary, followers: living.filter((v) => v.act === Act.FollowStranger).length },
    river,
    labour: e.labours.map((l) => LABOUR_WORDS[l]).join(" and "),
    counts: { ...s.counts },
  };
}

export function hourWords(h: number): string {
  if (h < 4.5) return "deep in the night";
  if (h < 6.5) return "at first light";
  if (h < 9) return "in the early morning";
  if (h < 11.5) return "in the morning";
  if (h < 13) return "about noon";
  if (h < 16) return "in the afternoon";
  if (h < 18.5) return "toward evening";
  if (h < 21) return "in the evening";
  return "at night";
}

// ---------------------------------------------------------------------------
// What is happening now
// ---------------------------------------------------------------------------

export function nowSummary(vil: Village): string[] {
  const s = vil.s;
  const e = vil.env;
  const off = vil.settings.place.offsetMinutes;
  const living = vil.living();
  const out: string[] = [];
  const weather = e.snowCover ? "snow lies on the roofs" : e.rain > 0.6 ? "it is raining hard" : e.rain > 0.15 ? "it is raining" : e.daylight > 0.5 ? "the day is dry" : "the night is dry";
  out.push(`It is ${hourWords(e.hour)}, ${datePhrase(s.now, off)} (${MONTH_NAMES[e.lt.month]}, the month of ${e.labours.map((l) => LABOUR_WORDS[l]).join(" and ")}), and ${weather}.`);

  const asleep = living.filter((v) => v.act === Act.Sleep).length;
  if (asleep > living.length * 0.7) out.push(`Almost everyone in Ashcombe is asleep: ${asleep} of ${living.length}.`);
  // By scene: the most common doings.
  const byScene = new Map<string, Map<string, string[]>>();
  for (const v of living) {
    if (v.act === Act.Sleep || vil.age(v) < 2.5) continue;
    const scene = sceneAt(v.x).name;
    const d = doing(vil, v).replace(/^on the way to [^,]+, /, "");
    let m = byScene.get(scene);
    if (!m) byScene.set(scene, (m = new Map()));
    const arr = m.get(d) ?? [];
    arr.push(vil.first(v));
    m.set(d, arr);
  }
  // In walking order, from the forest to the unfinished end.
  const order = (name: string) => SCENES.findIndex((sc) => sc.name === name);
  for (const [scene, m] of [...byScene].sort((a, b) => order(a[0]) - order(b[0]))) {
    const parts = [...m.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 3)
      .map(([d, names]) => (names.length === 1 ? `${names[0]} is ${d}` : names.length === 2 ? `${names[0]} and ${names[1]} are ${d}` : `${numberWord(names.length)} are ${d}`));
    out.push(`${scene}: ${parts.join("; ")}.`);
  }
  const sick = living.filter((v) => v.sick > 0.3);
  if (sick.length) out.push(`${sick.length === 1 ? `${called(vil, sick[0])} lies sick` : `${cap(numberWord(sick.length))} lie sick`}.`);
  const lvl = s.river.level;
  if (lvl > 0.64) out.push(`The river is in spate${s.river.bridge ? "" : " and the footbridge is gone"}.`);
  if (e.skyShow) out.push(e.sky.comet ? "A hairy star is in the sky." : "Stars are falling tonight.");
  const funeral = s.funerals.find((f) => f.started && !f.done);
  if (funeral) out.push(`There is a funeral: ${vil.first(vil.get(funeral.villager)!)} is being carried to the churchyard.`);
  const st = s.stranger;
  if (st.present) {
    const followers = living.filter((v) => v.act === Act.FollowStranger).map((v) => vil.first(v));
    const watchers = living.filter((v) => v.act === Act.WatchStranger).map((v) => called(vil, v));
    let line = `The stranger (you) is at ${sceneAt(st.x).name.replace(/^The /, "the ")}`;
    if (followers.length) line += `, followed by ${followers.length === 1 ? followers[0] : `${numberWord(followers.length)} children`}`;
    if (watchers.length) line += `, watched by ${watchers.join(" and ")}`;
    out.push(`${line}.`);
  }
  return out;
}

export { Carry };
