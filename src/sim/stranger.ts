/**
 * The stranger: the visitor, stitched into the hanging as a small pilgrim.
 *
 * The figure is an agent like any other. It walks toward where the visitor
 * is looking; villagers see it and react by their natures and by what they
 * have heard: children follow, the priest greets, the reeve watches, dogs
 * bark. Word of it passes through the gossip. The village remembers it
 * between visits. Nothing about the visitor is used beyond the fact and the
 * timing of their visits.
 */
import { HOUR_MS } from "./calendar";
import { addEntry } from "./chronicle";
import { SIGHT } from "./constants";
import type { Village } from "./core";
import { BUILDING, CLOTH_LENGTH, roadY, sceneAt } from "./geography";
import { assign, interruptible } from "./schedule";
import { hear, startRumour } from "./social";
import { Act, PILGRIM, type Villager } from "./types";
import { who } from "./words";
import { stranger as lines } from "../text/latin";

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** A new visit begins (the page is open and showing). */
export function arrive(vil: Village, at: number | null): void {
  const s = vil.s;
  const st = s.stranger;
  const last = s.visits[s.visits.length - 1];
  const again = s.visits.length > 0;
  st.present = true;
  st.arrivedAt = s.now;
  st.stillSince = s.now;
  if (at !== null) {
    st.x = at;
  } else if (last) {
    st.x = last.x;
  } else {
    st.x = 4;
  }
  st.tx = st.x;
  st.y = roadY(st.x);
  st.stitchedAt = s.now;
  // A visit only counts as new after a real absence (not a reload).
  const newVisit = !last || s.now - (last.at + last.seconds * 1000) > 45 * 60_000;
  if (newVisit) {
    s.visits.push({ at: s.now, seconds: 0, x: st.x });
    const line = lines.comes(again, !again && sceneAt(st.x).id === "forest");
    vil.emit({ kind: "stranger", x: st.x, actors: [PILGRIM], text: line.en, data: { la: line.la, en: line.en, again: again ? 1 : 0 } });
    const justStitched = s.chronicle.some((c) => c.kind === "visit" && c.away !== null && c.t > s.now - 60_000);
    if (!justStitched && (!again || !s.chronicle.some((c) => c.kind === "visit" && c.t > s.now - 20 * HOUR_MS))) {
      addEntry(vil, "visit", line, sceneAt(st.x).id, [PILGRIM]);
    }
  } else if (last) {
    last.seconds = Math.round((s.now - last.at) / 1000);
  }
}

export function depart(vil: Village): void {
  const s = vil.s;
  const st = s.stranger;
  st.present = false;
  const last = s.visits[s.visits.length - 1];
  if (last) {
    last.x = st.x;
    last.seconds = Math.round((s.now - last.at) / 1000);
  }
  // Children following go home.
  for (const v of vil.living()) if (v.act === Act.FollowStranger || v.act === Act.WatchStranger || v.act === Act.GreetStranger) v.until = s.now;
}

/** The visitor looks at a new place on the cloth. */
export function gaze(vil: Village, x: number): void {
  const st = vil.s.stranger;
  st.tx = clamp(x, 4, CLOTH_LENGTH - 30);
}

/** Every step: the stranger walks toward where the visitor stands. */
export function walkStranger(vil: Village, dt: number): void {
  const s = vil.s;
  const st = s.stranger;
  if (!st.present) return;
  const dx = st.tx - st.x;
  const d = Math.abs(dx);
  if (d > 300) {
    // Too far to walk: the needle unpicks the figure and stitches it anew nearby.
    st.x = st.tx - Math.sign(dx) * 26;
    st.y = roadY(st.x);
    st.stitchedAt = s.now;
    st.stillSince = s.now;
    const line = lines.restitched();
    vil.emit({ kind: "restitch", x: st.x, actors: [PILGRIM], text: line.en, quiet: true, data: { la: line.la, en: line.en } });
    return;
  }
  if (d > 0.3) {
    const speed = d > 60 ? 15 : d > 20 ? 9.5 : 6.2;
    st.x += Math.sign(dx) * Math.min(d, speed * dt);
    st.facing = dx > 0 ? 1 : -1;
    st.stillSince = s.now;
  }
  const wantY = roadY(st.x) + 1.2;
  st.y += (wantY - st.y) * Math.min(1, dt * 3);
  const last = s.visits[s.visits.length - 1];
  if (last) last.x = st.x;
}

/** Once a second: who sees the stranger, and what they do about it. */
export function strangerReactions(vil: Village): void {
  const s = vil.s;
  const st = s.stranger;
  if (!st.present) return;
  const e = vil.env;
  let followers = 0;
  for (const v of vil.living()) {
    if (v.act === Act.FollowStranger) followers++;
    if (v.inside || v.act === Act.Sleep || !interruptible(v)) continue;
    const d = Math.abs(v.x - st.x);
    if (d > SIGHT * (e.daylight > 0.3 ? 1 : 0.5)) continue;
    const age = vil.age(v);
    if (age < 3) continue;
    if (v.act === Act.FollowStranger || v.act === Act.WatchStranger || v.act === Act.GreetStranger) continue;
    const t = vil.tie(v, PILGRIM);
    const seenThisVisit = t.t >= st.arrivedAt;
    if (!vil.rng.chance(seenThisVisit ? 0.012 : 0.22 * (0.5 + v.traits.curiosity))) continue;
    notice(vil, v, t, seenThisVisit);
  }
  if (followers >= 2 && !s.inscriptions.some((i) => i.key === "follow")) {
    const line = lines.childrenFollow();
    vil.emit({ kind: "strangerFollowed", x: st.x, actors: [PILGRIM], text: line.en, data: { la: line.la, en: line.en, many: 1 } });
  }
  // Dogs.
  for (const a of s.animals) {
    if (!a.alive || a.kind !== "dog") continue;
    if (Math.abs(a.x - st.x) > 28 || a.alarmUntil > s.now) continue;
    if (!vil.rng.chance(0.12)) continue;
    a.alarmUntil = s.now + 6000 + vil.rng.next() * 7000;
    a.tx = st.x - Math.sign(st.x - a.x || 1) * 6;
    a.ty = st.y + 1;
    const line = lines.dogsBark();
    vil.emit({ kind: "bark", x: a.x, actors: [PILGRIM], text: line.en, data: { la: line.la, en: line.en } });
  }
}

function notice(vil: Village, v: Villager, t: ReturnType<Village["tie"]>, seenThisVisit: boolean): void {
  const s = vil.s;
  const st = s.stranger;
  const age = vil.age(v);
  const firstEver = t.m === 0;
  const metBefore = t.m > 0 && !seenThisVisit;
  t.m++;
  t.t = s.now;
  if (firstEver) vil.hist(v, { k: "metStranger" });
  // First sight warms or cools a little by temperament.
  t.a = clamp(t.a + 0.05 * (1 - v.traits.suspicion) - 0.04 * v.traits.suspicion + (metBefore ? 0.03 : 0), -1, 1);
  v.facing = st.x >= v.x ? 1 : -1;

  // The first to see the stranger starts the talk; others may add to it.
  let r = s.rumours.find((x) => x.kind === "stranger");
  if (!r) r = startRumour(vil, "stranger", [], v, 0);
  else if (!v.rumours[r.id]) hear(vil, v, r, 0, v.id);

  const w = who(vil, v);
  // Children follow.
  if (age < 12 && t.a > -0.25 && vil.rng.chance(0.45 + v.traits.curiosity * 0.4)) {
    assign(vil, v, Act.FollowStranger, { x: st.x, y: st.y }, 1.5 + vil.rng.next() * 2, { target: PILGRIM });
    t.a = clamp(t.a + 0.06, -1, 1);
    const line = lines.childFollows(w);
    vil.emit({ kind: "strangerFollowed", x: v.x, actors: [v.id, PILGRIM], text: line.en, data: { la: line.la, en: line.en } });
    return;
  }
  if (v.trade === "priest") {
    assign(vil, v, Act.GreetStranger, { x: st.x + 3, y: st.y }, 1.2, { target: PILGRIM });
    const line = metBefore ? lines.greetsAgain(w) : lines.greets(w);
    vil.emit({ kind: "strangerGreeted", x: v.x, actors: [v.id, PILGRIM], text: line.en, data: { la: line.la, en: line.en } });
    return;
  }
  if (v.trade === "reeve" && t.a < 0.35) {
    assign(vil, v, Act.WatchStranger, { x: v.x, y: v.y }, 1 + vil.rng.next() * 1.5, { target: PILGRIM });
    t.a = clamp(t.a - 0.03, -1, 1);
    const line = lines.distrusts(w);
    vil.emit({ kind: "strangerDistrusted", x: v.x, actors: [v.id, PILGRIM], text: line.en, data: { la: line.la, en: line.en } });
    return;
  }
  if (v.trade === "alewife" && Math.abs(st.x - BUILDING.alehouse.x) < 45) {
    assign(vil, v, Act.GreetStranger, { x: st.x + 3, y: st.y }, 1, { target: PILGRIM });
    const line = lines.beckons(w);
    vil.emit({ kind: "strangerGreeted", x: v.x, actors: [v.id, PILGRIM], text: line.en, data: { la: line.la, en: line.en } });
    return;
  }
  if (t.a > 0.28 || (metBefore && t.a > 0.1)) {
    if (vil.rng.chance(0.55)) {
      assign(vil, v, Act.GreetStranger, { x: st.x + (v.x < st.x ? -3 : 3), y: st.y }, 0.8, { target: PILGRIM });
      const line = metBefore ? lines.greetsAgain(w) : lines.greets(w);
      vil.emit({ kind: "strangerGreeted", x: v.x, actors: [v.id, PILGRIM], text: line.en, data: { la: line.la, en: line.en } });
    }
    return;
  }
  if (t.a < -0.3) {
    assign(vil, v, Act.Wander, { x: v.x + (v.x < st.x ? -30 : 30), y: v.y }, 3);
    const line = lines.avoids(w);
    vil.emit({ kind: "strangerDistrusted", x: v.x, actors: [v.id, PILGRIM], text: line.en, data: { la: line.la, en: line.en, avoid: 1 } });
    return;
  }
  if (v.traits.suspicion > 0.6 && vil.rng.chance(0.5)) {
    assign(vil, v, Act.WatchStranger, { x: v.x, y: v.y }, 0.6, { target: PILGRIM });
  }
}

/** Once in a while an animal sickens. If the stranger is about, someone may lay it at their door. */
export function sickBeasts(vil: Village): void {
  const s = vil.s;
  const a = s.animals.find((x) => x.alive && (x.kind === "sheep" || x.kind === "ox" || x.kind === "pig") && x.sick === 0 && vil.rng.chance(0.004));
  if (!a) return;
  a.sick = 0.3;
  const lastVisit = s.visits[s.visits.length - 1];
  const strangerAbout = s.stranger.present || (lastVisit && s.now - lastVisit.at < 24 * HOUR_MS);
  if (!strangerAbout) return;
  const owner =
    a.owner === -1
      ? vil.living().find((v) => (a.kind === "sheep" ? v.trade === "shepherd" : v.trade === "steward"))
      : vil.living().find((v) => v.household === a.owner && vil.age(v) >= 18);
  if (!owner) return;
  const t = vil.tie(owner, PILGRIM);
  if (t.a > 0.12 || owner.traits.suspicion < 0.45) return;
  t.a = clamp(t.a - 0.2, -1, 1);
  vil.hist(owner, { k: "blamedStranger", d: a.kind === "sheep" ? "a sick ewe" : a.kind === "ox" ? "a sick ox" : "a sick pig" });
  startRumour(vil, "blame", [owner.id], owner);
  const line = lines.blamed(who(vil, owner));
  vil.emit({ kind: "strangerDistrusted", x: owner.x, actors: [owner.id, PILGRIM], text: line.en, data: { la: line.la, en: line.en, blame: 1 } });
}
