import { describe, expect, test } from "vitest";
import { deedMany, deedOne, life, stranger, whileAway, away, type Who } from "@/text/latin";
import { FEMALE_NAMES, MALE_NAMES } from "@/sim/names";
import { makeVillage, run } from "./helpers";
import { catchUp } from "@/sim/catchup";

const agnes: Who = { name: FEMALE_NAMES[0], sex: 1, trade: "baker", withTrade: true };
const walter: Who = { name: MALE_NAMES[2], sex: 0, trade: "miller", withTrade: true };

describe("the inscriptions", () => {
  test("simple sentences agree", () => {
    expect(deedOne(agnes, "bake")).toEqual({ la: "HIC AGNES PISTRIX PANEM COQUIT", en: "Here Agnes the baker bakes bread" });
    expect(deedMany("mow")).toEqual({ la: "HIC FENUM SECANT", en: "Here they mow the hay" });
    expect(life.born({ ...agnes, trade: "none", withTrade: false }).la).toBe("HIC NATA EST AGNES");
    expect(life.born({ ...walter, trade: "none", withTrade: false }).la).toBe("HIC NATUS EST WALTERUS");
    expect(life.buried(agnes).la).toBe("HIC SEPULTA EST AGNES PISTRIX");
    expect(life.visits(walter, agnes).la).toBe("HIC WALTERUS MOLENDINARIUS AGNETEM PISTRICEM VISITAT");
    expect(stranger.distrusts({ ...walter, trade: "reeve" }).la).toBe("HIC WALTERUS PRAEPOSITUS ADVENAE NON CREDIT");
  });

  test("while you were away", () => {
    const l = whileAway([away.born({ ...agnes, withTrade: false }), away.harvest()]);
    expect(l.la).toBe("TE ABSENTE NATA EST AGNES ET MESSIS COLLECTA EST");
    expect(l.en).toBe("While you were away, Agnes was born, and the harvest was gathered in");
  });

  test("every inscription the village stitches has its gloss and no gaps", () => {
    const vil = makeVillage({ at: "2026-08-11T09:00" });
    const seen = new Set<string>();
    for (let h = 0; h < 14; h++) {
      run(vil, 1800);
      for (const i of vil.s.inscriptions) seen.add(`${i.la}|${i.en}`);
    }
    catchUp(vil, 30 * 86_400_000);
    for (const c of vil.s.chronicle) seen.add(`${c.la}|${c.en}`);
    expect(seen.size).toBeGreaterThan(8);
    for (const s of seen) {
      const [la, en] = s.split("|");
      expect(la).toMatch(/^[A-Z ]+$/);
      expect(la).not.toMatch(/UNDEFINED|NULL|NAN/);
      expect(en.length).toBeGreaterThan(5);
      expect(en).not.toMatch(/undefined|null|NaN/);
    }
  });
});
