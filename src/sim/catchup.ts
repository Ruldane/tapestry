/**
 * The absence model: what happened while the page was closed.
 *
 * A coarse, bounded version of the live rules advances the village by the
 * real time since the last visit: the river and the weather hour by hour,
 * labour in the fields in bulk, stores eaten, lives lived (the same rules for
 * birth, sickness, death, marriage), talk and quarrels as chance meetings
 * along real ties, the sky on its nights. What it stitches is marked as
 * stitched while the visitor was away.
 */
import { BRIDGE_LOST_LEVEL, HOUR_MS, rainAt, SPATE_LEVEL, stepRiver } from "./calendar";
import { addEntry, awayMark } from "./chronicle";
import { CHILD_AGE } from "./constants";
import type { Village } from "./core";
import { beastsTick, buildTick, eatTick, fieldsTick, gather, householdShort } from "./economy";
import { skyTick } from "./elements";
import { cropTime, fieldRole, finishJob, jobFor, JOB_WORK } from "./fields";
import { MEADOW_FLOOD_LEVEL, sceneAt, STRIPS } from "./geography";
import { lifeTick, michaelmas } from "./life";
import { householdRation } from "./schedule";
import { settle } from "./sim";
import { chat, courtingWalk, drift, quarrel } from "./social";
import { Act, Kin, PILGRIM, type Villager } from "./types";
import { absenceNote, type AbsenceFacts } from "../text/keeper";
import { away, whileAway, water as waterLines, type Line } from "../text/latin";
import { who } from "./words";

/** At most this much time is modelled; beyond it the village is simply carried forward. */
export const CATCHUP_CAP_MS = 120 * 24 * HOUR_MS;

export interface AbsenceReport extends AbsenceFacts {
  id: number;
  la: string;
  en: string;
  note: string;
}

export function catchUp(vil: Village, elapsedMs: number): AbsenceReport {
  const s = vil.s;
  const start = s.now;
  const target = start + elapsedMs;
  const capped = elapsedMs > CATCHUP_CAP_MS;
  const until = start + Math.min(elapsedMs, CATCHUP_CAP_MS);
  const id = s.nextAbsence++;
  const counts0 = { ...s.counts };
  const wasLive = vil.live;
  vil.live = false;
  awayMark.id = id;
  let spates = 0;
  let bridgeLost = false;
  let bridgeMended = false;
  let hungry = false;
  let reeve: string | null = null;
  const reeveBefore = vil.living().find((v) => v.trade === "reeve")?.id;

  try {
    while (s.now < until) {
      const stepH = s.now - start < 14 * 24 * HOUR_MS ? 1 : 3;
      const dtMs = Math.min(stepH * HOUR_MS, until - s.now);
      const hours = dtMs / HOUR_MS;
      s.now += dtMs;
      vil.refreshEnv();
      const e = vil.env;

      // The river, hour by hour.
      const before = s.river.level;
      for (let h = 0; h < hours; h++) {
        const hr = (e.hour - hours + h + 1 + 24) % 24;
        s.river.level = stepRiver(s.river.level, rainAt(e.weather, hr), e.fm, 1);
        if (s.river.bridge && s.river.level > BRIDGE_LOST_LEVEL && vil.rng.chance(0.25)) {
          s.river.bridge = false;
          s.river.lostAt = s.now;
          bridgeLost = true;
          addEntry(vil, "bridge", waterLines.bridgeLost(), "river");
          if (!s.builds.some((b) => b.building === "bridge")) s.builds.unshift({ building: "bridge", work: 0, need: 2600, for: [] });
        }
      }
      if (before < SPATE_LEVEL && s.river.level >= SPATE_LEVEL) {
        spates++;
        if (!s.chronicle.some((c) => c.kind === "spate" && c.t > s.now - 36 * HOUR_MS)) addEntry(vil, "spate", waterLines.floods(), "river");
      }
      if (s.river.level > MEADOW_FLOOD_LEVEL) {
        for (const st of s.strips) if (st.id >= 23 && (st.state === "green" || st.state === "ripe")) st.flood = Math.min(0.8, st.flood + 0.02 * hours);
        // Without the village to drive them, a sheep may be lost.
        if (s.river.level > 0.8 && vil.rng.chance(0.08 * hours)) {
          const sh = s.animals.find((a) => a.alive && a.kind === "sheep");
          if (sh) {
            sh.alive = false;
            addEntry(vil, "lostSheep", waterLines.sheepLost(), "river");
          }
        }
      }

      // Everyone asleep at night, about their work by day (for the rules that ask).
      for (const v of vil.living()) v.act = e.night ? Act.Sleep : Act.Work;

      // Fields: the calendar and the labour available.
      fieldsTick(vil);
      labour(vil, hours);
      const hadBridge = s.river.bridge;
      buildTick(vil, hours * 3600 * (e.night ? 0 : 1));
      if (!hadBridge && s.river.bridge) bridgeMended = true;

      // Bread: grind what is needed, eat, go hungry, beg.
      mill(vil);
      eatTick(vil, hours * 3600);
      for (const h of s.households) {
        if (h.ended) continue;
        const short = householdShort(vil, h.id);
        if (short && s.manorGrain > 80) {
          const give = Math.min(householdRation(vil, h.id) * 4, s.manorGrain - 80);
          s.manorGrain -= give;
          h.grain += give;
        }
        for (const id of h.members) {
          const m = vil.get(id);
          if (!m) continue;
          if (short) {
            hungry = true;
            m.hunger = Math.min(1, m.hunger + hours / 10);
          } else m.hunger = Math.max(0.1, m.hunger - hours / 4);
        }
      }

      // Lives, and the talk between them.
      lifeTick(vil, hours * 3600);
      michaelmas(vil);
      talk(vil, hours, e.night);
      drift(vil, hours * 3600);
      if (e.night && e.hour >= 20) skyTick(vil);
      beastsTick(vil);
    }
  } finally {
    awayMark.id = null;
    vil.live = wasLive;
  }

  if (capped) shiftTime(vil, target - s.now);
  s.now = target;
  vil.refreshEnv();
  settle(vil);

  const newReeve = vil.living().find((v) => v.trade === "reeve");
  if (newReeve && newReeve.id !== reeveBefore) reeve = vil.fullName(newReeve);

  const born = s.villagers.filter((v) => v.born > start && v.born <= target);
  const died = s.villagers.filter((v) => !v.alive && (v.died ?? 0) > start);
  const marriages: [Villager, Villager][] = [];
  for (const v of s.villagers) {
    if (v.sex !== 0) continue;
    for (const h of v.history) {
      if (h.k === "married" && h.t > start) {
        const w = vil.get(h.o ?? -1);
        if (w) marriages.push([v, w]);
      }
    }
  }
  const entries = s.chronicle.filter((c) => c.away === id);
  const harvestEntry = entries.find((c) => c.kind === "harvest");
  const named = born.find((b) => vil.given(b).en === "Peregrine");
  const heard = vil.living().filter((v) => Object.keys(v.rumours).some((k) => s.rumours.find((r) => r.id === Number(k))?.kind === "stranger")).length;

  const facts: AbsenceFacts = {
    elapsedMs,
    capped,
    births: born.filter((b) => b.alive || (b.died ?? 0) - b.born > HOUR_MS).map((b) => vil.fullName(b)),
    deaths: died.map((d) => vil.fullName(d)),
    marriages: marriages.map(([a, b]) => [vil.first(a), vil.first(b)]),
    harvest: harvestEntry ? { good: harvestEntry.la.includes("BONA") } : null,
    spates,
    bridgeLost,
    bridgeMended,
    comet: entries.some((c) => c.kind === "comet"),
    meteors: entries.some((c) => c.kind === "meteors"),
    cottages: entries.filter((c) => c.kind === "cottage").length,
    quarrels: s.counts.quarrels - counts0.quarrels,
    reconciliations: s.counts.reconciliations - counts0.reconciliations,
    hungry,
    namedForStranger: named ? vil.first(named) : null,
    heardOfStranger: heard,
    population: vil.living().length,
    reeve,
  };

  // The stitched line over the stranger's head when they return.
  const parts: Line[] = [];
  for (const b of born.slice(-2)) parts.push(away.born(who(vil, b)));
  for (const d of died.slice(-2)) parts.push(away.buried(who(vil, d)));
  if (marriages.length) {
    const [a, b] = marriages[marriages.length - 1];
    parts.push(away.married(who(vil, a), who(vil, b)));
  }
  if (harvestEntry) parts.push(away.harvest());
  if (spates) parts.push(away.spate());
  if (facts.comet) parts.push(away.comet());
  if (facts.cottages) parts.push(away.cottage());
  const line = whileAway(parts.slice(0, 3));
  const note = absenceNote(facts);
  // The absence itself is stitched into the lower border, where the stranger stands.
  awayMark.id = id;
  addEntry(vil, "visit", line, sceneAt(Math.max(4, s.stranger.x)).id, [PILGRIM]);
  awayMark.id = null;
  s.absences.push({ id, at: target, elapsedMs, en: note, la: line.la });
  if (s.absences.length > 40) s.absences.shift();
  return { ...facts, id, la: line.la, en: line.en, note };
}

/**
 * Time beyond the cap is not modelled; so that nobody ages through it, every
 * clock in the village moves forward with it.
 */
function shiftTime(vil: Village, d: number): void {
  const s = vil.s;
  const fwd = (t: number) => (t > 0 ? t + d : t);
  for (const v of s.villagers) {
    v.born += d;
    if (v.died) v.died += d;
    v.pregnantUntil = fwd(v.pregnantUntil);
    v.mourningUntil = fwd(v.mourningUntil);
    v.until = fwd(v.until);
    for (const h of v.history) h.t += d;
    for (const k in v.ties) v.ties[k].t = fwd(v.ties[k].t);
    for (const k in v.rumours) v.rumours[k].at += d;
  }
  for (const a of s.animals) {
    a.born += d;
    a.until = fwd(a.until);
    a.alarmUntil = fwd(a.alarmUntil);
  }
  for (const h of s.households) {
    h.founded += d;
    if (h.ended) h.ended += d;
  }
  for (const f of s.funerals) f.at += d;
  for (const w of s.weddings) w.at += d;
  for (const b of s.baptisms) b.at += d;
  for (const g of s.graves) g.t += d;
  for (const c of s.chronicle) c.t += d;
  for (const r of s.rumours) r.at += d;
  for (const e of s.recent) e.t += d;
  s.priestDue = fwd(s.priestDue);
  s.sermonDue = fwd(s.sermonDue);
  s.river.lostAt = fwd(s.river.lostAt);
  s.stranger.stillSince += d;
  s.foundedAt += d;
}

/** Bulk labour: the able-bodied put in their hours where the fields need them. */
function labour(vil: Village, hours: number): void {
  const s = vil.s;
  const e = vil.env;
  if (e.night || e.holy) return;
  const dayHours = Math.max(0, Math.min(hours, e.set - 1 - Math.max(e.wake + 1, e.hour - hours)));
  if (dayHours <= 0) return;
  const hands = vil.living().filter((v) => vil.age(v) >= 14 && vil.age(v) < 62 && v.sick < 0.3).length;
  let budget = hands * dayHours * 3600 * 0.3;
  const ct = cropTime(e.fm, e.frac);
  const order = { cart: 0, reap: 1, sow: 2, plough: 3 } as const;
  const jobs = s.strips
    .map((st) => ({ st, job: jobFor(st, fieldRole(STRIPS[st.id].field, e.cropYear), ct) }))
    .filter((x) => x.job)
    .sort((a, b) => order[a.job!] - order[b.job!]);
  for (const { st, job } of jobs) {
    if (budget <= 0) break;
    const need = JOB_WORK[job!] - st.work;
    const give = Math.min(need, budget, JOB_WORK[job!] * 0.8 * dayHours);
    st.work += give;
    budget -= give;
    if (st.work >= JOB_WORK[job!]) {
      finishJob(st, job!);
      if (job === "cart") gather(vil, st.id);
    }
  }
  // Hay in its months.
  if (e.labours.includes("haymaking") && budget > 0) {
    const m = s.meadow;
    const k = Math.min(1, budget / 60000);
    m.mown = Math.min(1, m.mown + 0.3 * k);
    m.stacked = Math.min(m.mown, m.stacked + 0.25 * k);
    m.carted = Math.min(m.stacked, m.carted + 0.2 * k);
  }
}

/** Flour runs low: grain goes to the mill, less the toll. */
function mill(vil: Village): void {
  const s = vil.s;
  const miller = vil.living().find((v) => v.trade === "miller");
  const mh = miller ? vil.household(miller.household) : undefined;
  for (const h of s.households) {
    if (h.ended || h.building === "manor") continue;
    const daily = householdRation(vil, h.id);
    if (h.flour > daily * 3 || h.grain <= 0.05) continue;
    const bushels = Math.min(h.grain, daily * 7 + 0.5);
    h.grain -= bushels;
    const toll = bushels / 16;
    h.flour += bushels - toll;
    if (mh) mh.flour += toll;
    s.mill.ground += bushels;
  }
}

/** Chance meetings along ties and between neighbours. */
function talk(vil: Village, hours: number, night: boolean): void {
  if (night) return;
  const people = vil.living().filter((v) => vil.age(v) >= 5);
  for (const v of people) {
    if (v.courting >= 0 && v.id < v.courting) courtingWalk(vil, v, hours * 3600 * 0.05);
    const n = hours * 0.35 * (0.4 + v.traits.sociability);
    const meets = Math.floor(n) + (vil.rng.chance(n % 1) ? 1 : 0);
    for (let i = 0; i < meets; i++) {
      const ties = Object.keys(v.ties)
        .map(Number)
        .filter((id) => id !== PILGRIM);
      let o: Villager | undefined;
      const roll = vil.rng.next();
      if (ties.length && roll < 0.5) o = vil.get(vil.rng.pick(ties));
      else if (roll < 0.75) {
        // The young find each other at the alehouse, on the green, at the harvest.
        const age = vil.age(v);
        const peers = people.filter((p) => p.id !== v.id && Math.abs(vil.age(p) - age) < 7);
        if (peers.length) o = vil.rng.pick(peers);
      } else {
        const home = vil.home(v);
        const nearby = people.filter((p) => p.id !== v.id && Math.abs(vil.home(p).x - home.x) < 160);
        if (nearby.length) o = vil.rng.pick(nearby);
      }
      if (!o || !o.alive || o.id === v.id) continue;
      if (vil.age(o) < CHILD_AGE && vil.age(v) >= 16 && v.ties[o.id]?.k === Kin.None) continue;
      const g = Math.max(v.ties[o.id]?.g ?? 0, o.ties[v.id]?.g ?? 0);
      if (g > 0.3 && vil.rng.chance(g * (0.4 + (v.traits.temper + o.traits.temper) / 2) * 0.6)) quarrel(vil, v, o);
      else chat(vil, v, o);
    }
  }
}
