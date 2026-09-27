import { DAY_MS } from "./calendar";

/** Simulation step, in real seconds. The day keeps the real clock. */
export const DT = 0.25;
export const STEP_MS = DT * 1000;

/**
 * Lives run quicker than days: one year of a villager's life passes in four
 * real days, so a child born this week is walking in a fortnight, and a
 * village visited over a season sees a generation marry, bear and bury.
 */
export const LIFE_YEAR_MS = 4 * DAY_MS;

/** Bump when the saved shape changes; older saves found a new village. */
export const SCHEMA = 5;

export const WALK = { adult: 5.4, child: 7.6, old: 3.6, run: 10 } as const;
/** How far a villager can see the stranger, in cloth units. */
export const SIGHT = 34;
/** Talking distance. */
export const NEAR = 5;

export const POP = { founding: 92, target: 96, max: 150, min: 40 } as const;

/** Bushels a grown person eats in a real day (children less). */
export const RATION = 0.034;
/** Bushels a strip yields in a good year before tithe. */
export const STRIP_YIELD = 62;

export const MARRY_AGE = { min: 17, max: 40 } as const;
export const CHILD_AGE = 12;
export const OLD_AGE = 58;

export const HISTORY_MAX = 28;
export const TIES_MAX = 16;
export const RUMOURS_HELD_MAX = 10;
export const CHRONICLE_MAX = 400;
