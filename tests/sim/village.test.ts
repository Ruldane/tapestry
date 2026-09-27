import { describe, expect, test } from "vitest";
import { makeVillage, run } from "./helpers";
import { catchUp, CATCHUP_CAP_MS } from "@/sim/catchup";
import { deserialize, serialize } from "@/sim/persist";
import { step } from "@/sim/sim";
import { die, marry } from "@/sim/life";
import { eligible, startRumour } from "@/sim/social";
import { arrive, gaze } from "@/sim/stranger";
import { Act, Kin, PILGRIM, Work, type Villager } from "@/sim/types";
import { placeFromTimeZone } from "@/sim/calendar";
import { SCHEMA } from "@/sim/constants";

const share = (vs: Villager[], f: (v: Villager) => boolean) => vs.filter(f).length / Math.max(1, vs.length);

describe("the day and the year", () => {
  test("in the small hours almost everyone is asleep indoors", () => {
    const vil = makeVillage({ at: "2026-06-16T02:00" });
    run(vil, 120);
    const people = vil.living();
    expect(share(people, (v) => v.act === Act.Sleep && v.inside)).toBeGreaterThan(0.95);
  });

  test("on a June weekday morning the village is making hay", () => {
    const vil = makeVillage({ at: "2026-06-16T10:15" });
    run(vil, 600);
    const hay = vil.living().filter((v) => v.act === Act.Work && (v.work === Work.Mow || v.work === Work.Rake));
    expect(hay.length).toBeGreaterThanOrEqual(4);
    expect(vil.env.labours).toContain("haymaking");
  });

  test("in August they reap; in December nobody does", () => {
    const aug = makeVillage({ at: "2026-08-11T10:30" });
    run(aug, 600);
    const reaping = aug.living().filter((v) => v.act === Act.Work && (v.work === Work.Reap || v.work === Work.Bind));
    expect(reaping.length).toBeGreaterThanOrEqual(4);
    const dec = makeVillage({ at: "2026-12-08T10:30" });
    run(dec, 600);
    expect(dec.living().filter((v) => v.work === Work.Reap).length).toBe(0);
    expect(dec.env.labours).toContain("slaughter");
  });

  test("on Sunday morning most of the village is at mass", () => {
    const vil = makeVillage({ at: "2026-06-14T09:10" });
    run(vil, 900);
    const grown = vil.living().filter((v) => vil.age(v) >= 3);
    expect(share(grown, (v) => v.act === Act.Service)).toBeGreaterThan(0.6);
  });

  test("the year turns the right way in the south", () => {
    // December in Sydney is the farming June: haymaking.
    const vil = makeVillage({ at: "2026-12-16T10:15", timeZone: "Australia/Sydney", offsetMinutes: 660 });
    expect(placeFromTimeZone("Australia/Sydney", 660).hemisphere).toBe(-1);
    expect(vil.env.fm).toBe(5);
    expect(vil.env.labours).toContain("haymaking");
  });

  test("the bell is rung at the hours", () => {
    const vil = makeVillage({ at: "2026-06-16T11:58" });
    const kinds: string[] = [];
    for (let i = 0; i < 4 * 240; i++) {
      step(vil);
      for (const e of vil.events) kinds.push(e.kind);
      vil.events = [];
    }
    expect(kinds).toContain("bell");
  });
});

describe("talk", () => {
  test("gossip spreads along real meetings, from those who knew it to those who did not", () => {
    const vil = makeVillage({ at: "2026-06-16T17:00" });
    const origin = vil.living().find((v) => v.trade === "alewife")!;
    const r = startRumour(vil, "stranger", [], origin, 0);
    // Every telling, as it happens: who told whom, and whether the teller knew it then.
    const knew = new Set([origin.id]);
    const tellings: { from: number; to: number; ok: boolean; met: boolean }[] = [];
    for (let i = 0; i < 4 * 3 * 3600; i++) {
      step(vil);
      for (const e of vil.events) {
        if (e.kind !== "rumour" || e.data?.rumour !== r.id) continue;
        const [from, to] = e.actors;
        tellings.push({ from, to, ok: knew.has(from), met: (vil.get(to)!.ties[from]?.m ?? 0) > 0 });
        knew.add(to);
      }
      vil.events = [];
    }
    const knowers = vil.living().filter((v) => v.rumours[r.id]);
    expect(knowers.length).toBeGreaterThan(5);
    expect(tellings.length).toBeGreaterThanOrEqual(knowers.length - 1);
    for (const t of tellings) {
      expect(t.ok).toBe(true);
      expect(t.met).toBe(true);
    }
    // And everyone who knows it was told by someone (nobody knows it out of thin air).
    for (const v of knowers) if (v.id !== origin.id) expect(knew.has(v.id)).toBe(true);
  });

  test("the alewife, the priest and the reeve meet more people than most", () => {
    const vil = makeVillage({ at: "2026-06-16T06:00" });
    const before = new Map(vil.living().map((v) => [v.id, Object.values(v.ties).reduce((s, t) => s + t.m, 0)]));
    run(vil, 16 * 3600);
    const met = vil
      .living()
      .filter((v) => vil.age(v) >= 16)
      .map((v) => ({ v, n: Object.values(v.ties).reduce((s, t) => s + t.m, 0) - (before.get(v.id) ?? 0) }));
    met.sort((a, b) => a.n - b.n);
    const median = met[Math.floor(met.length / 2)].n;
    const hubs = met.filter((m) => m.v.trade === "alewife" || m.v.trade === "priest" || m.v.trade === "reeve");
    const hubMean = hubs.reduce((s, m) => s + m.n, 0) / hubs.length;
    expect(hubMean).toBeGreaterThan(median);
  });
});

describe("households", () => {
  test("a marriage joins two people and moves one of them", () => {
    const vil = makeVillage({ at: "2026-06-16T10:00" });
    const singles = vil.living().filter((v) => eligible(vil, v));
    const man = singles.find((v) => v.sex === 0)!;
    const woman = singles.find((v) => v.sex === 1 && v.household !== man.household)!;
    expect(man && woman).toBeTruthy();
    const before = vil.s.counts.marriages;
    marry(vil, man, woman);
    expect(man.spouse).toBe(woman.id);
    expect(woman.spouse).toBe(man.id);
    expect(man.ties[woman.id].k).toBe(Kin.Spouse);
    expect(vil.s.counts.marriages).toBe(before + 1);
    expect(man.household === woman.household || vil.s.builds.some((b) => b.for.includes(man.id))).toBe(true);
    expect(vil.s.chronicle.some((c) => c.kind === "marriage" && c.actors.includes(man.id))).toBe(true);
  });

  test("a death leaves a widow, a funeral, a grave and an entry in the chronicle", () => {
    const vil = makeVillage({ at: "2026-06-16T08:00" });
    const head = vil.living().find((v) => v.sex === 0 && v.spouse >= 0 && vil.get(v.spouse)?.alive)!;
    const wife = vil.get(head.spouse)!;
    const hh = vil.household(head.household)!;
    die(vil, head, "a fever");
    expect(head.alive).toBe(false);
    expect(hh.members).not.toContain(head.id);
    expect(wife.spouse).toBe(-1);
    expect(wife.history.some((h) => h.k === "widowed" && h.o === head.id)).toBe(true);
    expect(vil.s.funerals.some((f) => f.villager === head.id)).toBe(true);
    run(vil, 4.5 * 3600);
    expect(vil.s.graves.some((g) => g.villager === head.id)).toBe(true);
    expect(vil.s.chronicle.some((c) => c.kind === "burial" && c.actors.includes(head.id))).toBe(true);
  });

  test("a household with nobody left in it comes to an end", () => {
    const vil = makeVillage({ at: "2026-06-16T08:00" });
    const hh = vil.s.households.find((h) => h.members.length <= 3 && h.building !== "manor")!;
    for (const id of hh.members.slice()) die(vil, vil.get(id)!, "a fever");
    expect(hh.ended).toBeDefined();
  });
});

describe("bread", () => {
  test("a poor harvest means a hungry winter", () => {
    // The same village, one year with a wet-enough summer, one with a drought.
    const good = makeVillage({ seed: 11, at: "2026-07-20T08:00" });
    const poor = makeVillage({ seed: 11, at: "2026-07-20T08:00" });
    poor.settings.weather = "dry";
    catchUp(good, 220 * 86_400_000);
    catchUp(poor, 220 * 86_400_000);
    expect(poor.s.harvest.quality).toBeLessThan(good.s.harvest.quality);
    const stores = (v: typeof good) => v.s.households.filter((h) => !h.ended).reduce((s, h) => s + h.grain + h.flour, 0) + v.s.manorGrain;
    expect(stores(poor)).toBeLessThan(stores(good));
    const hardship = (v: typeof good) =>
      v.s.absences.some((a) => /hungry/.test(a.en)) || v.living().some((x) => x.hunger > 0.6 || x.history.some((h) => h.k === "alms"));
    expect(hardship(poor)).toBe(true);
  });
});

describe("the absence", () => {
  test("a week away is modelled quickly and plausibly", () => {
    const vil = makeVillage({ at: "2026-09-27T10:00" });
    const pop = vil.living().length;
    const t0 = performance.now();
    const r = catchUp(vil, 7 * 86_400_000);
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(r.capped).toBe(false);
    expect(vil.living().length).toBeGreaterThan(pop * 0.7);
    expect(vil.living().length).toBeLessThan(pop * 1.3);
    expect(r.births.length + r.deaths.length).toBeGreaterThan(0);
    expect(r.note).toMatch(/^You were away seven days\./);
    expect(vil.s.chronicle.some((c) => c.away === r.id)).toBe(true);
  });

  test("a very long absence is bounded", () => {
    const vil = makeVillage({ at: "2026-09-27T10:00" });
    const t0 = performance.now();
    const target = vil.s.now + 400 * 86_400_000;
    const r = catchUp(vil, 400 * 86_400_000);
    expect(performance.now() - t0).toBeLessThan(15000);
    expect(r.capped).toBe(true);
    expect(CATCHUP_CAP_MS).toBeLessThan(400 * 86_400_000);
    expect(vil.s.now).toBe(target);
    const pop = vil.living().length;
    expect(pop).toBeGreaterThanOrEqual(40);
    expect(pop).toBeLessThanOrEqual(170);
    expect(vil.s.chronicle.length).toBeLessThanOrEqual(400);
  });
});

describe("the stranger", () => {
  test("villagers notice the stranger and react by their natures", () => {
    const vil = makeVillage({ at: "2026-06-16T15:00" });
    arrive(vil, 950);
    let reacted = 0;
    let barked = false;
    for (let i = 0; i < 4 * 900; i++) {
      step(vil);
      for (const e of vil.events) {
        if (e.kind === "strangerGreeted" || e.kind === "strangerFollowed" || e.kind === "strangerDistrusted") reacted++;
        if (e.kind === "bark") barked = true;
      }
      vil.events = [];
      if (i % 40 === 0) gaze(vil, 900 + ((i / 40) % 20) * 8);
    }
    expect(reacted).toBeGreaterThan(0);
    const met = vil.living().filter((v) => (v.ties[PILGRIM]?.m ?? 0) > 0);
    expect(met.length).toBeGreaterThan(3);
    expect(vil.s.rumours.some((r) => r.kind === "stranger")).toBe(true);
    void barked;
  });
});

describe("memory", () => {
  test("a snapshot round-trips and the village carries on exactly as before", () => {
    const vil = makeVillage({ seed: 5, at: "2026-06-16T10:00" });
    run(vil, 300);
    const snap = JSON.parse(JSON.stringify(serialize(vil)));
    const r = deserialize(snap, vil.settings);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const copy = r.vil;
    for (let i = 0; i < 800; i++) {
      step(vil);
      step(copy);
    }
    vil.saveRng();
    copy.saveRng();
    expect(JSON.stringify(copy.s)).toBe(JSON.stringify(vil.s));
  });

  test("an old or broken save is refused", () => {
    const vil = makeVillage({ seed: 5 });
    const snap = serialize(vil);
    expect(deserialize({ ...snap, schema: SCHEMA - 1 }, vil.settings)).toEqual({ ok: false, reason: "schema" });
    expect(deserialize({ schema: SCHEMA, state: { villagers: "no" } }, vil.settings)).toEqual({ ok: false, reason: "corrupt" });
    expect(deserialize(null, vil.settings)).toEqual({ ok: false, reason: "corrupt" });
  });

  test("the same seed founds the same village", () => {
    const a = makeVillage({ seed: 99 });
    const b = makeVillage({ seed: 99 });
    run(a, 120);
    run(b, 120);
    a.saveRng();
    b.saveRng();
    expect(JSON.stringify(a.s)).toBe(JSON.stringify(b.s));
    const c = makeVillage({ seed: 100 });
    expect(c.living().map((v) => v.name).join()).not.toBe(a.living().map((v) => v.name).join());
  });
});
