/**
 * The dyes, as wool. Each has three shades (light, mid, dark) that a strand
 * is shaded from, and every skein is a little uneven, as hand-dyed yarn is.
 * Indices match sim/looks DYE.
 */
export interface Wool {
  name: string;
  light: string;
  mid: string;
  dark: string;
}

export const WOOLS: readonly Wool[] = [
  { name: "madder", light: "#c7694b", mid: "#a4442d", dark: "#6e2a1d" },
  { name: "madderPale", light: "#dca08a", mid: "#c47f6b", dark: "#94594a" },
  { name: "woad", light: "#6385a3", mid: "#3d5a78", dark: "#253a51" },
  { name: "woadPale", light: "#a9bfcc", mid: "#85a0b3", dark: "#5d7a8f" },
  { name: "weld", light: "#e6c56a", mid: "#cfa23a", dark: "#98721f" },
  { name: "sage", light: "#a3b07c", mid: "#7e8d58", dark: "#56633a" },
  { name: "sageDark", light: "#7d8a5a", mid: "#56633b", dark: "#394326" },
  { name: "walnut", light: "#906f50", mid: "#6a4d34", dark: "#433021" },
  { name: "walnutPale", light: "#bca07c", mid: "#9e8160", dark: "#735b42" },
  { name: "cream", light: "#efe6d0", mid: "#dfd2b4", dark: "#b8aa8a" },
  { name: "grey", light: "#b4aea2", mid: "#948e82", dark: "#6c675e" },
  { name: "russet", light: "#ad7a50", mid: "#8b5a34", dark: "#5e3c22" },
  { name: "walnutDark", light: "#5d4633", mid: "#3e2d20", dark: "#261b13" },
  { name: "rose", light: "#cf928c", mid: "#b46c66", dark: "#844b47" },
  { name: "greyDark", light: "#807b73", mid: "#5f5a53", dark: "#403c37" },
];

export const D = {
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

/** The undyed linen ground and its weave. */
export const LINEN = {
  base: "#c8c0aa",
  warp: "#d6cfbb",
  weft: "#bdb49d",
  slub: "#ddd6c3",
  shadow: "#a39a83",
  back: "#bfb7a2",
} as const;

/** Parse "#rrggbb" to [r,g,b]. */
export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bl = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${bl})`;
}

/** A shade of a wool nudged lighter or darker (-1..1), for unevenness. */
export function shade(w: Wool, t: number): string {
  return t >= 0 ? mix(w.mid, w.light, Math.min(1, t)) : mix(w.mid, w.dark, Math.min(1, -t));
}
