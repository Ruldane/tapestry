import type { Village } from "./core";
import type { Villager } from "./types";
import type { Who } from "../text/latin";

const KNOWN_BY_TRADE = new Set(["miller", "reeve", "priest", "alewife", "baker", "smith", "shepherd", "lord", "lady", "steward", "carpenter", "weaver", "thatcher", "swineherd", "woodward"]);

/** A villager as the inscription grammar needs them. */
export function who(vil: Village, v: Villager): Who {
  const name = vil.given(v);
  let withTrade = KNOWN_BY_TRADE.has(v.trade);
  if (!withTrade && v.trade === "ploughman") {
    withTrade = vil.living().some((o) => o.id !== v.id && o.name === v.name);
  }
  return { name, sex: v.sex, trade: v.trade, withTrade };
}

/** "Agnes", or "Agnes the baker" when she is known by her work. */
export function called(vil: Village, v: Villager): string {
  const w = who(vil, v);
  const t = TRADE_EN[v.trade];
  return w.withTrade && t ? `${w.name.en} the ${t}` : vil.fullName(v);
}

export const TRADE_EN: Record<string, string> = {
  labourer: "labourer",
  ploughman: "ploughman",
  miller: "miller",
  reeve: "reeve",
  priest: "priest",
  alewife: "alewife",
  baker: "baker",
  smith: "smith",
  shepherd: "shepherd",
  swineherd: "swineherd",
  woodward: "woodward",
  carpenter: "carpenter",
  weaver: "weaver",
  thatcher: "thatcher",
  lord: "lord of the manor",
  lady: "lady of the manor",
  steward: "steward",
  servant: "servant",
  goosegirl: "goose-girl",
  none: "",
};
