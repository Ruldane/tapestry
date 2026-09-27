/**
 * One step of the village: a quarter of a second of real time.
 *
 * Every step: needs, choices when an activity runs out, walking, work done
 * where it is done, the stranger's walk, the beasts. Every second: meetings
 * and who notices the stranger. Every few seconds: lives, the fields, the
 * river, the sky, the stores, the inscriptions.
 */
import { BELL_HOURS } from "./calendar";
import { DT, STEP_MS } from "./constants";
import { Village } from "./core";
import { askAlms, beastsTick, bringSack, doWork, eatTick, fieldsTick, flourHome, hungerTick, needs } from "./economy";
import { riverTick, skyTick } from "./elements";
import { BRIDGE, FORD_Y, PLACES, RIVER_X, roadY } from "./geography";
import { inscriptionsTick, rememberEvent } from "./inscriptions";
import { baptisms, lifeTick, michaelmas } from "./life";
import { decide, speedFor } from "./schedule";
import { courtingWalk, drift, makePeace, meetings } from "./social";
import { sickBeasts, strangerReactions, walkStranger } from "./stranger";
import { Act, Carry, PILGRIM, Work, type Animal, type Villager } from "./types";

export { Village };

/** Advance the village by one step. */
export function step(vil: Village): void {
  const s = vil.s;
  s.now += STEP_MS;
  s.tick++;
  const t = s.tick;
  if (!vil.remember) vil.remember = (e) => rememberEvent(vil, e);

  if (t % 4 === 0) {
    const bellBefore = vil.env.bell;
    const dayBefore = vil.env.dayNumber;
    vil.refreshEnv();
    if (vil.env.bell !== bellBefore && vil.env.bell >= 0 && vil.env.dayNumber === dayBefore) {
      const b = BELL_HOURS[vil.env.bell];
      vil.emit({ kind: "bell", x: 880, actors: [], text: `the bell rings for ${b.name}`, quiet: true, data: { hour: b.name } });
    }
  }

  for (const v of vil.living()) updateVillager(vil, v);
  walkStranger(vil, DT);
  for (const a of s.animals) if (a.alive) updateAnimal(vil, a);

  if (t % 4 === 1) {
    meetings(vil);
    strangerReactions(vil);
  }
  if (t % 8 === 2) inscriptionsTick(vil);
  if (t % 16 === 3) {
    skyTick(vil);
    baptisms(vil);
  }
  if (t % 20 === 5) {
    lifeTick(vil, 5);
    michaelmas(vil);
  }
  if (t % 40 === 7) {
    fieldsTick(vil);
    eatTick(vil, 10);
    riverTick(vil, 10);
  }
  if (t % 240 === 11) {
    hungerTick(vil);
    beastsTick(vil);
    sickBeasts(vil);
    drift(vil, 60);
  }
}

// ---------------------------------------------------------------------------
// Villagers
// ---------------------------------------------------------------------------

function updateVillager(vil: Village, v: Villager): void {
  const s = vil.s;
  needs(vil, v, DT);
  if (s.now >= v.until) decide(vil, v);
  track(vil, v);
  if (v.act === Act.Rest && v.target >= 0 && vil.age(v) < 2.5) return;
  const arrived = move(vil, v, DT);
  if (!arrived) return;
  switch (v.act) {
    case Act.Work:
    case Act.Repair:
      doWork(vil, v, DT);
      break;
    case Act.Carry:
      if (v.carry === Carry.Grain && Math.abs(v.x - PLACES.mill.x) < 8) bringSack(vil, v);
      else if (v.carry === Carry.Flour) flourHome(vil, v);
      break;
    case Act.Fetch:
      if (v.target === -4) {
        // Gathering in the wood: a while bent over, then the bundle home.
        v.progress += DT;
        if (v.progress > 90 + (v.id % 5) * 20) {
          v.target = -3;
          v.carry = Carry.Wood;
          const home = vil.home(v);
          v.tx = home.doorX + (vil.rng.next() - 0.5) * 3;
          v.ty = home.y + 8;
        }
      } else if (v.target === -2) {
        // At the well: now carry it home.
        v.target = -3;
        const home = vil.home(v);
        v.tx = home.doorX + (vil.rng.next() - 0.5) * 3;
        v.ty = home.y + 8;
      } else if (v.target === -3) {
        v.carry = Carry.None;
        v.until = s.now;
      }
      break;
    case Act.Alms:
      askAlms(vil, v);
      break;
    case Act.Visit:
      if (v.mediate) {
        const a = vil.get(v.target);
        if (a && a.act === Act.Argue) makePeace(vil, v);
        else v.mediate = false;
      }
      break;
    case Act.Court:
      courtingWalk(vil, v, DT);
      break;
  }
}

/** Activities whose place moves: following, greeting, courting, processions. */
function track(vil: Village, v: Villager): void {
  const st = vil.s.stranger;
  switch (v.act) {
    case Act.FollowStranger: {
      if (!st.present) {
        v.until = vil.s.now;
        return;
      }
      const behind = 5 + ((v.id * 13) % 7);
      const side = st.facing;
      v.tx = st.x - side * behind;
      v.ty = st.y + ((v.id % 3) - 1) * 1.4;
      break;
    }
    case Act.GreetStranger:
      if (!st.present) return;
      if (Math.abs(v.x - st.x) < 6) {
        v.tx = v.x;
        v.ty = v.y;
        v.facing = st.x >= v.x ? 1 : -1;
      } else {
        v.tx = st.x + (v.x < st.x ? -4 : 4);
        v.ty = st.y;
      }
      break;
    case Act.WatchStranger:
      if (!st.present) return;
      v.facing = st.x >= v.x ? 1 : -1;
      if (Math.abs(v.x - st.x) > 26) v.tx = st.x + (v.x < st.x ? -18 : 18);
      break;
    case Act.Court: {
      const o = vil.get(v.with);
      if (o && o.act === Act.Court && o.with === v.id && v.id > o.id) {
        v.tx = o.x + 2.2 * (v.x >= o.x ? 1 : -1);
        v.ty = o.y + 0.3;
      }
      break;
    }
    case Act.ChaseGoose: {
      const g = vil.s.animals.find((a) => a.id === v.target);
      if (!g || !g.alive || !g.loose) {
        v.until = vil.s.now;
        return;
      }
      v.tx = g.x;
      v.ty = g.y;
      if (Math.abs(v.x - g.x) < 2 && Math.abs(v.y - g.y) < 2) {
        g.loose = false;
        g.until = vil.s.now;
        vil.emit({ kind: "goose", x: g.x, actors: [v.id], text: "the children catch the goose", data: { la: "HIC PUERI ANSEREM CAPIUNT", en: "Here the children catch the goose" } });
        v.until = vil.s.now;
      }
      break;
    }
    case Act.Chat:
    case Act.Argue: {
      const o = vil.get(v.with);
      if (o) v.facing = o.x >= v.x ? 1 : -1;
      break;
    }
    case Act.Rest:
      // Babes in arms stay with their mothers.
      if (v.target >= 0 && vil.age(v) < 2.5) {
        const m = vil.get(v.target);
        if (m) {
          v.x = v.tx = m.x;
          v.y = v.ty = m.y;
          v.inside = m.inside;
        }
      }
      break;
  }
}

/** Walk toward the target. Returns true if there. */
function move(vil: Village, v: Villager, dt: number): boolean {
  if (v.inside) {
    // Coming out: they reappear at the door.
    if (!v.enter && (v.act !== Act.Sleep && v.act !== Act.Sick)) v.inside = false;
    else return true;
  }
  const dx = v.tx - v.x;
  const dy = v.ty - v.y;
  if (Math.abs(dx) < 0.35 && Math.abs(dy) < 0.35) {
    if (v.enter) v.inside = true;
    return true;
  }
  let speed = speedFor(vil, v);
  if (v.act === Act.FollowStranger && Math.abs(dx) > 12) speed *= 1.5;
  const far = Math.abs(dx) > 16;
  const lane = (((v.id * 37) % 5) - 2) * 0.8;
  let wantY = far ? roadY(v.x) + lane : v.ty;

  // Crossing the river: over the bridge if it stands, through the ford if not.
  const crossing = (v.x - RIVER_X) * (v.tx - RIVER_X) < 0 || Math.abs(v.x - RIVER_X) < 14;
  if (crossing && Math.abs(v.x - RIVER_X) < 26 && far) {
    if (vil.s.river.bridge) wantY = BRIDGE.y + lane * 0.3;
    else {
      wantY = FORD_Y + lane * 0.3;
      if (Math.abs(v.x - RIVER_X) < 13) speed *= 0.42;
    }
  }
  const ydiff = wantY - v.y;
  v.y += Math.sign(ydiff) * Math.min(Math.abs(ydiff), speed * 0.7 * dt);
  const xs = Math.abs(ydiff) > 3 && far ? 0.55 : 1;
  const step = Math.min(Math.abs(dx), speed * xs * dt);
  v.x += Math.sign(dx) * step;
  if (step > 0.01) v.facing = dx > 0 ? 1 : -1;
  return false;
}

// ---------------------------------------------------------------------------
// Beasts
// ---------------------------------------------------------------------------

function updateAnimal(vil: Village, a: Animal): void {
  const s = vil.s;
  const e = vil.env;
  if (s.now >= a.until) chooseAnimal(vil, a);
  const dx = a.tx - a.x;
  const dy = a.ty - a.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.3) {
    a.state = a.kind === "sheep" || a.kind === "ox" || a.kind === "goose" ? 0 : e.night ? 2 : 0;
    return;
  }
  const base = a.kind === "dog" ? 9 : a.kind === "goose" ? 3.2 : a.kind === "ox" ? 3 : a.kind === "pig" ? 3.4 : 3.8;
  const hurry = a.alarmUntil > s.now || d > 30 ? 1.8 : 1;
  const sp = base * hurry * DT;
  a.x += (dx / d) * Math.min(d, sp);
  a.y += (dy / d) * Math.min(d, sp);
  if (Math.abs(dx) > 0.05) a.facing = dx > 0 ? 1 : -1;
  a.state = 1;
}

function near(vil: Village, x: number, y: number, rx: number, ry: number) {
  return { x: x + (vil.rng.next() - 0.5) * rx, y: Math.max(64, Math.min(85, y + (vil.rng.next() - 0.5) * ry)) };
}

function chooseAnimal(vil: Village, a: Animal): void {
  const s = vil.s;
  const e = vil.env;
  const secs = (lo: number, hi: number) => (lo + vil.rng.next() * (hi - lo)) * 1000;
  let p: { x: number; y: number };
  switch (a.kind) {
    case "sheep": {
      if (a.until > 0 && a.state === 1 && s.river.level > 0.64 && a.tx > 1300) {
        p = { x: a.tx, y: a.ty };
        break;
      }
      const shepherd = vil.living().find((v) => v.trade === "shepherd" && !v.inside && v.act === Act.Work);
      if (e.night || !shepherd) p = near(vil, PLACES.fold.x, PLACES.fold.y, 36, 6);
      else p = near(vil, shepherd.x + 8 * -shepherd.facing, shepherd.y, 34, 9);
      a.until = s.now + secs(4, 16);
      break;
    }
    case "goose": {
      const girl = vil.living().find((v) => v.trade === "goosegirl" && !v.inside);
      if (!a.loose && vil.rng.chance(0.00009) && !e.night && !s.animals.some((g) => g.loose)) {
        a.loose = true;
        p = near(vil, 950, 80, 80, 6);
        a.until = s.now + secs(90, 200);
        vil.emit({ kind: "goose", x: a.x, actors: [], text: "a goose has got loose", data: { la: "HIC ANSER EFFUGIT", en: "Here a goose escapes" } });
        const kids = vil.living().filter((v) => vil.age(v) >= 5 && vil.age(v) < 12 && !v.inside && Math.abs(v.x - a.x) < 80).slice(0, 3);
        for (const k of kids) {
          k.act = Act.ChaseGoose;
          k.target = a.id;
          k.tx = p.x;
          k.ty = p.y;
          k.until = s.now + 60_000;
          k.enter = false;
        }
        break;
      }
      if (a.loose) {
        a.loose = false;
      }
      p = girl && !e.night ? near(vil, girl.x, girl.y, 14, 5) : near(vil, PLACES.pond.x, PLACES.pond.y, 18, 3);
      a.until = s.now + secs(3, 10);
      break;
    }
    case "ox": {
      const ploughman = vil.living().find((v) => v.act === Act.Work && v.work === Work.Plough && Math.abs(v.tx - v.x) < 2);
      const team = s.animals.filter((o) => o.kind === "ox" && o.alive);
      const idx = team.indexOf(a);
      if (ploughman && !e.night) {
        a.follow = ploughman.id;
        p = { x: ploughman.x + ploughman.facing * (4 + idx * 3.2), y: ploughman.y - 0.5 + (idx % 2) * 1.2 };
        a.until = s.now + 1500;
      } else {
        a.follow = -1;
        p = near(vil, 1150, 74, 26, 4);
        a.until = s.now + secs(10, 30);
      }
      break;
    }
    case "dog": {
      if (a.alarmUntil > s.now) {
        p = { x: a.tx, y: a.ty };
        a.until = a.alarmUntil;
        break;
      }
      const h = vil.household(a.owner);
      const master = h?.members.map((id) => vil.get(id)).find((m) => m && m.alive && !m.inside && vil.age(m) >= 14);
      if (master && !e.night) p = near(vil, master.x - master.facing * 4, master.y + 1, 10, 3);
      else if (h) {
        const b = vil.home(vil.get(h.members[0]) ?? vil.living()[0]);
        p = near(vil, b.doorX + 4, b.y + 8, 6, 2);
      } else p = near(vil, 950, 80, 40, 4);
      a.until = s.now + secs(2, 6);
      break;
    }
    case "pig": {
      const herd = vil.living().find((v) => v.trade === "swineherd" && v.act === Act.Work && v.work === Work.Pannage && !v.inside);
      if (herd && e.labours.includes("pannage") && !e.night) p = near(vil, herd.x, herd.y, 30, 6);
      else {
        const h = vil.household(a.owner);
        const m = h ? vil.get(h.members[0]) : undefined;
        const b = m ? vil.home(m) : null;
        p = b ? near(vil, b.doorX + 8, b.y + 10, 14, 3) : near(vil, 200, 80, 20, 3);
      }
      a.until = s.now + secs(6, 20);
      break;
    }
  }
  a.tx = Math.max(3, Math.min(1500, p.x));
  a.ty = p.y;
}

/** Put everyone straight where their current activity has them (after founding or a long absence). */
export function settle(vil: Village): void {
  vil.refreshEnv();
  for (const v of vil.living()) {
    v.until = 0;
    decide(vil, v);
    v.x = v.tx;
    v.y = v.ty;
    if (v.enter) v.inside = true;
    v.until = vil.s.now + vil.rng.next() * 10 * 60_000;
  }
  for (const v of vil.living()) track(vil, v);
  for (const a of vil.s.animals) {
    if (!a.alive) continue;
    a.until = 0;
    chooseAnimal(vil, a);
    a.x = a.tx;
    a.y = a.ty;
  }
}

export { PILGRIM };
