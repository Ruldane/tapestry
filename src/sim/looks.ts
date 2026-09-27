/**
 * Dye indices shared by the simulation (which dresses people) and the loom
 * (which knows what colour each dye is). Only natural dyes: madder, woad,
 * weld, overdyed sage, walnut, and the undyed wool.
 */
export const DYE = {
  madder: 0,
  madderPale: 1,
  woad: 2,
  woadPale: 3,
  weld: 4,
  sage: 5,
  sageDark: 6,
  walnut: 7,
  walnutPale: 8,
  cream: 9,
  grey: 10,
  russet: 11,
  walnutDark: 12,
  rose: 13,
  greyDark: 14,
} as const;
export type Dye = (typeof DYE)[keyof typeof DYE];

export const HAIR = [DYE.walnut, DYE.walnutPale, DYE.walnutDark, DYE.russet, DYE.weld] as const;
export const CLOTH = [DYE.madder, DYE.woad, DYE.sage, DYE.russet, DYE.woadPale, DYE.walnutPale, DYE.weld, DYE.greyDark, DYE.rose, DYE.sageDark] as const;
