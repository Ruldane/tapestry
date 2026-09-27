/**
 * Water and sky.
 *
 * The river: rain (from the real date and chance) raises it; in spate it
 * floods the meadow, races the mill wheel, may carry off the footbridge, and
 * the village turns out to drive the flock to high ground. The carpenter
 * mends the bridge when the water falls.
 *
 * The sky: on the nights of the annual meteor showers, and rarely when a
 * comet comes, the village comes out to look. Some are afraid; the priest
 * preaches on it in the morning; a wedding may be put off.
 */
import { BRIDGE_LOST_LEVEL, HOUR_MS, SPATE_LEVEL, stepRiver } from "./calendar";
import { addEntry } from "./chronicle";
import type { Village } from "./core";
import { MEADOW, MEADOW_FLOOD_LEVEL, PLACES } from "./geography";
import { assign, at, interruptible } from "./schedule";
import { startRumour } from "./social";
import { Act, PILGRIM, type Villager } from "./types";
import { sky as skyLines, water as waterLines } from "../text/latin";

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Every ten seconds. */
export function riverTick(vil: Village, seconds: number): void {
  const s = vil.s;
  const r = s.river;
  const before = r.level;
  r.level = stepRiver(r.level, vil.env.rain, vil.env.fm, seconds / 3600);
  s.mill.flow = r.level;

  if (before < SPATE_LEVEL && r.level >= SPATE_LEVEL) {
    const line = waterLines.rises();
    vil.emit({ kind: "spate", x: 690, actors: [], text: "the river is rising fast", data: { la: line.la, en: line.en } });
    if (!s.chronicle.some((c) => c.kind === "spate" && c.t > s.now - 36 * HOUR_MS)) addEntry(vil, "spate", waterLines.floods(), "river");
  }

  if (r.bridge && r.level > BRIDGE_LOST_LEVEL && vil.rng.chance(0.03 * (seconds / 10))) {
    r.bridge = false;
    r.lostAt = s.now;
    const line = waterLines.bridgeLost();
    vil.emit({ kind: "bridgeLost", x: 690, actors: [], text: line.en, data: { la: line.la, en: line.en } });
    addEntry(vil, "bridge", line, "river");
    if (!s.builds.some((b) => b.building === "bridge")) s.builds.unshift({ building: "bridge", work: 0, need: 2600, for: [] });
  }

  // Flood damage to the corn standing nearest the water.
  if (r.level > MEADOW_FLOOD_LEVEL) {
    for (const st of s.strips) {
      if (st.id < 23) continue;
      if (st.state === "green" || st.state === "ripe" || st.state === "shoots") st.flood = clamp(st.flood + 0.02 * (seconds / 10) * (r.level - MEADOW_FLOOD_LEVEL) * 4, 0, 0.8);
    }
  }

  if (r.level > MEADOW_FLOOD_LEVEL) saveTheFlock(vil);
  else rescueOver(vil);
}

function sheepAtRisk(vil: Village) {
  return vil.s.animals.filter((a) => a.alive && a.kind === "sheep" && a.x > MEADOW.x0 - 10 && a.x < MEADOW.x1 + 8);
}

function saveTheFlock(vil: Village): void {
  const s = vil.s;
  const risk = sheepAtRisk(vil);
  if (!risk.length) return;
  // The shepherd and the able-bodied nearby turn out.
  const helpers = vil
    .living()
    .filter((v) => v.act !== Act.SaveFlock && interruptible(v) && vil.age(v) >= 14 && vil.age(v) < 60 && v.sick < 0.2 && !vil.env.night && Math.abs(v.x - 640) < 320)
    .sort((a, b) => (a.trade === "shepherd" ? -1 : 0) - (b.trade === "shepherd" ? -1 : 0) || Math.abs(a.x - 640) - Math.abs(b.x - 640))
    .slice(0, Math.max(0, 6 - vil.living().filter((v) => v.act === Act.SaveFlock).length));
  for (const h of helpers) {
    assign(vil, h, Act.SaveFlock, { x: MEADOW.x0 + 10 + vil.rng.next() * 60, y: 78 + vil.rng.next() * 6 }, 30);
  }
  const rescuers = vil.living().filter((v) => v.act === Act.SaveFlock);
  if (helpers.length && !s.inscriptions.some((i) => i.key === "flock")) {
    const line = waterLines.saveFlock();
    vil.emit({ kind: "flockSaved", x: 620, actors: rescuers.map((v) => v.id), text: "the village turns out to save the flock", data: { la: line.la, en: line.en } });
  }
  // Sheep near a rescuer are driven to the high ground by the fold.
  for (const sh of risk) {
    const near = rescuers.some((v) => Math.abs(v.x - sh.x) < 12);
    if (near) {
      sh.follow = -1;
      sh.tx = PLACES.highGround.x + vil.rng.range(-30, 30);
      sh.ty = PLACES.highGround.y + vil.rng.range(-3, 3);
      sh.until = s.now + 20 * 60_000;
      sh.state = 1;
    } else if (s.river.level > 0.8 && vil.rng.chance(0.004)) {
      sh.alive = false;
      const shepherd = vil.living().find((v) => v.trade === "shepherd");
      if (shepherd) vil.hist(shepherd, { k: "lostSheep", d: "a ewe lost in the flood" });
      const line = waterLines.sheepLost();
      vil.emit({ kind: "sheepLost", x: sh.x, actors: [], text: line.en, data: { la: line.la, en: line.en } });
      if (!s.chronicle.some((c) => c.kind === "lostSheep" && c.t > s.now - 12 * HOUR_MS)) addEntry(vil, "lostSheep", line, "river");
    }
  }
}

function rescueOver(vil: Village): void {
  const rescuers = vil.living().filter((v) => v.act === Act.SaveFlock);
  if (!rescuers.length) return;
  // Shared work in the flood mends old quarrels.
  for (const a of rescuers) {
    vil.hist(a, { k: "savedFlock" });
    a.mood = clamp(a.mood + 0.15, -1, 1);
    for (const b of rescuers) {
      if (a.id === b.id) continue;
      const t = vil.tie(a, b.id);
      t.a = clamp(t.a + 0.06, -1, 1);
      t.g = Math.max(0, t.g - 0.12);
    }
    a.until = vil.s.now;
  }
}

// ---------------------------------------------------------------------------
// The sky
// ---------------------------------------------------------------------------

/** Called every few seconds. */
export function skyTick(vil: Village): void {
  const s = vil.s;
  const e = vil.env;
  const night = e.dayNumber - (e.hour < 12 ? 1 : 0);
  if (e.skyShow && s.omenNight !== night) {
    s.omenNight = night;
    const comet = e.sky.comet;
    const line = comet ? skyLines.comet() : skyLines.meteors();
    vil.emit({ kind: comet ? "comet" : "meteors", x: 950, actors: [], text: line.en, data: { la: line.la, en: line.en } });
    const recent = s.chronicle.some((c) => (c.kind === "comet" || c.kind === "meteors") && c.t > s.now - 5 * 24 * HOUR_MS);
    if (!recent) addEntry(vil, comet ? "comet" : "meteors", line, "green");
    // The priest will preach on it in the morning.
    s.sermonDue = s.now + ((24 + 9.25 - e.hour) % 24) * HOUR_MS;
    // A wedding in the next days is put off.
    for (const w of s.weddings) {
      if (!w.started && w.at < s.now + 48 * HOUR_MS && (comet || vil.rng.chance(0.4))) {
        w.at += 72 * HOUR_MS;
        const a = vil.get(w.a);
        const b = vil.get(w.b);
        if (a) vil.hist(a, { k: "postponed", d: "the wedding was put off for the star" });
        if (b) vil.hist(b, { k: "postponed", d: "the wedding was put off for the star" });
        const pl = { la: "HIC NUPTIAE DIFFERUNTUR", en: "Here a wedding is put off" };
        vil.emit({ kind: "postponed", x: 906, actors: [w.a, w.b], text: pl.en, data: { la: pl.la } });
      }
    }
  }
  if (e.skyShow && vil.live) {
    // Those still up come out to look; some go to pray.
    for (const v of vil.living()) {
      if (v.act === Act.SkyWatch || v.act === Act.Sleep || v.inside || !interruptible(v) || vil.age(v) < 5) continue;
      if (!vil.rng.chance(0.05)) continue;
      const afraid = v.traits.piety * 0.6 + v.traits.suspicion * 0.4 > (e.sky.comet ? 0.45 : 0.65);
      if (afraid && vil.rng.chance(0.5)) {
        assign(vil, v, Act.Pray, at(vil, "churchyard"), 20);
        v.mood = clamp(v.mood - 0.2, -1, 1);
      } else {
        assign(vil, v, Act.SkyWatch, vil.rng.chance(0.6) ? at(vil, "green") : { x: v.x, y: v.y }, 18);
        vil.hist(v, { k: "sawStar", d: e.sky.comet ? "saw the hairy star" : "watched the stars fall" });
      }
      if (!Object.values(v.rumours).length || vil.rng.chance(0.1)) {
        const r = s.rumours.find((x) => x.kind === "omen" && x.at > s.now - 3 * 24 * HOUR_MS) ?? startRumour(vil, "omen", [], v);
        if (!v.rumours[r.id]) v.rumours[r.id] = { v: 0, from: v.id, at: s.now };
      }
    }
  }
  // The sermon.
  if (s.sermonDue && s.now >= s.sermonDue) {
    s.sermonDue = 0;
    if (!vil.live) return;
    const priest = vil.living().find((v) => v.trade === "priest" && v.sick < 0.5);
    if (!priest) return;
    const hearers = vil.living().filter((v) => v.id !== priest.id && vil.age(v) >= 6 && v.sick < 0.4 && (v.traits.piety > 0.35 || vil.rng.chance(0.5)));
    assign(vil, priest, Act.Sermon, { x: 900, y: 71 }, 25, { inside: false });
    hearers.slice(0, 40).forEach((h, i) => assign(vil, h, Act.Sermon, { x: 912 + (i % 10) * 2.6, y: 73 + Math.floor(i / 10) * 2.2 }, 25));
    const line = skyLines.sermon();
    vil.emit({ kind: "sermon", x: 906, actors: [priest.id], text: line.en, data: { la: line.la, en: line.en } });
    // What the priest thinks of the stranger colours what he says.
    const pt = priest.ties[PILGRIM]?.a ?? 0;
    for (const h of hearers) {
      h.mood = clamp(h.mood + 0.1 * h.traits.piety, -1, 1);
      if (s.visits.length) {
        const t = vil.tie(h, PILGRIM);
        t.a = clamp(t.a + (pt > 0.25 ? 0.08 : pt < -0.2 ? -0.06 : 0), -1, 1);
      }
    }
  }
}

export function isFlood(vil: Village): boolean {
  return vil.s.river.level > MEADOW_FLOOD_LEVEL;
}

export type { Villager };
