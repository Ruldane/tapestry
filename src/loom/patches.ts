/**
 * The parts of the cloth that change, each drawn on its own small piece
 * ("patch") so it can be restitched without touching the rest: a strip in
 * the fields, the hay meadow, a grave, an inscription, a chronicle vignette,
 * a new house, the footbridge, the river at a given height, a tree's crown
 * for the season, the moon's phase, the comet.
 */
import { Rng, hash01 } from "../sim/rng";
import type { ChronicleKind, StripState } from "../sim/types";
import {
  BRIDGE,
  BUILDING,
  CHRONICLE_SLOTS,
  GRAVE_SLOTS,
  INCIPIT,
  INSCRIPTION_SLOTS,
  LOWER_INCIPIT,
  MEADOW,
  MEADOW_FLOOD_LEVEL,
  STRIPS,
  STRIP_Y,
  riverCentre,
  riverHalfWidth,
} from "../sim/geography";
import { layText, WORD_WOOLS } from "./letters";
import { D } from "./palette";
import { hillY, drawBuilding, TREES, type Tree } from "./scenery";
import { blob, ellipse, type Poly, type Pt, type Stitcher } from "./stitches";

export type PatchSpec =
  | { k: "strip"; id: number; state: StripState; flood: number; fm: number }
  | { k: "meadow"; mown: number; stacked: number; carted: number; fm: number }
  | { k: "grave"; slot: number; old: number }
  | { k: "ins"; slot: number; la: string }
  | { k: "incipit" }
  | { k: "lowIncipit" }
  | { k: "vig"; slot: number; kind: ChronicleKind; la: string }
  | { k: "cottage"; building: string }
  | { k: "bridge" }
  | { k: "river"; level: number }
  | { k: "canopy"; tree: number; season: number }
  | { k: "moon"; phase: number; at: number }
  | { k: "comet" };

export type Bounds = [number, number, number, number];

export const MOONS = [330, 862, 1386];

export function patchKey(p: PatchSpec): string {
  switch (p.k) {
    case "strip":
      return `strip:${p.id}:${p.state}:${Math.round(p.flood * 5)}:${p.state === "fallow" ? seasonOf(p.fm) : 0}`;
    case "meadow":
      return `meadow:${p.mown.toFixed(2)}:${p.stacked.toFixed(2)}:${p.carted.toFixed(2)}:${seasonOf(p.fm)}`;
    case "grave":
      return `grave:${p.slot}:${p.old}`;
    case "ins":
      return `ins:${p.slot}:${p.la}`;
    case "incipit":
      return "incipit";
    case "lowIncipit":
      return "lowIncipit";
    case "vig":
      return `vig:${p.slot}:${p.kind}:${p.la}`;
    case "cottage":
      return `cottage:${p.building}`;
    case "bridge":
      return "bridge";
    case "river":
      return `river:${p.level.toFixed(2)}`;
    case "canopy":
      return `canopy:${p.tree}:${p.season}`;
    case "moon":
      return `moon:${p.phase}:${p.at}`;
    case "comet":
      return "comet";
  }
}

/** Seasons for leaves: 0 bare, 1 spring, 2 blossom, 3 summer, 4 autumn, 5 late autumn. */
export function seasonOf(fm: number): number {
  if (fm === 11 || fm <= 1) return 0;
  if (fm === 2) return 1;
  if (fm === 3) return 2;
  if (fm <= 7) return 3;
  if (fm <= 9) return 4;
  return 5;
}

export function patchBounds(p: PatchSpec): Bounds {
  switch (p.k) {
    case "strip": {
      const s = STRIPS[p.id];
      return [s.x0 - 1, STRIP_Y.far - 1.5, s.x1 + 3.4, STRIP_Y.near + 1.5];
    }
    case "meadow":
      return [MEADOW.x0 - 1, 60, MEADOW.x1 + 1, 86.5];
    case "grave": {
      const g = GRAVE_SLOTS[p.slot];
      return [g.x - 3.2, g.y - 5.2, g.x + 3.2, g.y + 1.6];
    }
    case "ins": {
      const s = INSCRIPTION_SLOTS[p.slot];
      return [s.x0, 1.9, s.x1, 11.3];
    }
    case "incipit":
      return [INCIPIT.x0, 1.9, INCIPIT.x1, 11.3];
    case "lowIncipit":
      return [LOWER_INCIPIT.x0, 88.6, LOWER_INCIPIT.x1, 98.3];
    case "vig": {
      const s = CHRONICLE_SLOTS[p.slot];
      return [s.x0, 88.6, s.x1, 98.3];
    }
    case "cottage": {
      const b = BUILDING[p.building];
      return [b.x - b.w / 2 - 4, b.y - b.h - 3, b.x + b.w / 2 + 4, b.y + 2];
    }
    case "bridge":
      return [BRIDGE.x0 - 3, BRIDGE.y - 7, BRIDGE.x1 + 3, BRIDGE.y + 3];
    case "river": {
      const hw = riverHalfWidth(p.level, 87) + 8;
      const x0 = p.level > MEADOW_FLOOD_LEVEL ? MEADOW.x0 - 2 : 690 - hw;
      return [x0, 40, 690 + hw, 87];
    }
    case "canopy": {
      const t = TREES[p.tree];
      const cy = t.y - t.h * 0.72;
      return [t.x - t.r * 1.5, cy - t.r * 1.2, t.x + t.r * 1.5, t.y - t.h * 0.2 + (t.kind === "willow" ? 6 : 0)];
    }
    case "moon":
      return [p.at - 5, 18, p.at + 5, 28];
    case "comet":
      return [826, 14.5, 978, 42];
  }
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

export function drawPatch(st: Stitcher, p: PatchSpec): void {
  switch (p.k) {
    case "strip":
      return strip(st, p.id, p.state, p.flood, p.fm);
    case "meadow":
      return meadow(st, p.mown, p.stacked, p.carted, p.fm);
    case "grave":
      return grave(st, p.slot, p.old);
    case "ins": {
      const s = INSCRIPTION_SLOTS[p.slot];
      return inscription(st, p.la, s.x0 + 3, s.x1 - 3);
    }
    case "incipit":
      return inscription(st, "HIC INCIPIT PANNUS DE ASHCOMBE", INCIPIT.x0 + 3, INCIPIT.x1 - 2, true);
    case "lowIncipit":
      return lowIncipit(st);
    case "vig":
      return vignette(st, p.slot, p.kind, p.la);
    case "cottage":
      return drawBuilding(st, BUILDING[p.building], { night: false, snow: false });
    case "bridge":
      return bridge(st);
    case "river":
      return river(st, p.level);
    case "canopy":
      return canopy(st, TREES[p.tree], p.season);
    case "moon":
      return moon(st, p.phase, p.at);
    case "comet":
      return comet(st);
  }
}

// --- The fields --------------------------------------------------------------

function stripPoly(id: number): Poly {
  const s = STRIPS[id];
  const lean = 2.2;
  return [
    [s.x0 + lean, STRIP_Y.far],
    [s.x1 + lean, STRIP_Y.far],
    [s.x1, STRIP_Y.near],
    [s.x0, STRIP_Y.near],
  ];
}

/** x at a height across the strip (0..1 across, y down the field). */
function across(id: number, t: number, y: number): number {
  const s = STRIPS[id];
  const f = (y - STRIP_Y.far) / (STRIP_Y.near - STRIP_Y.far);
  return s.x0 + (s.x1 - s.x0) * t + 2.2 * (1 - f);
}

const ANGLE_DOWN = Math.PI / 2 - Math.atan2(2.2, STRIP_Y.near - STRIP_Y.far);

/** Furrows: rows of stem stitch running up the strip, a little uneven. */
function furrows(st: Stitcher, id: number, wools: number[], spacing = 1.25, len = 1.5): void {
  const s = STRIPS[id];
  const n = Math.max(3, Math.floor((s.x1 - s.x0) / spacing));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const pts: [number, number][] = [];
    for (let y = STRIP_Y.far + 0.4; y <= STRIP_Y.near - 0.3; y += 1.3) pts.push([across(id, t, y) + Math.sin(y * 0.55 + i * 1.7) * 0.14, y]);
    st.stem(pts, wools[i % wools.length], len, 0.82);
  }
}

/** A dense laid fill that shows no ladder of couching. */
function laid(st: Stitcher, id: number, wool: number, couch: number): void {
  st.couched(stripPoly(id), wool, -ANGLE_DOWN + Math.PI, couch, 0.42, 2.6);
}

function strip(st: Stitcher, id: number, state: StripState, flood: number, fm: number): void {
  const rng = new Rng(id * 131 + state.length * 7);
  st.rng = rng;
  const poly = stripPoly(id);
  const s = STRIPS[id];
  const rows = (fn: (x: number, y: number) => void, dx = 1.15, dy = 2.1) => {
    for (let y = STRIP_Y.far + 1; y < STRIP_Y.near - 0.4; y += dy) {
      for (let t = 0.08; t < 0.95; t += dx / (s.x1 - s.x0)) fn(across(id, t, y) + (rng.next() - 0.5) * 0.3, y + (rng.next() - 0.5) * 0.4);
    }
  };
  switch (state) {
    case "fallow": {
      st.seed(poly, D.sage, 0.22, 0.6);
      st.seed(poly, D.sageDark, 0.08, 0.5);
      const season = seasonOf(fm);
      if (season === 2 || season === 3) for (let i = 0; i < 6; i++) st.knot(across(id, rng.next(), 52 + rng.next() * 28), 52 + rng.next() * 28, rng.pick([D.weld, D.cream, D.madderPale]), 0.7);
      break;
    }
    case "stubble":
      rows((x, y) => {
        if (rng.next() < 0.3) return;
        const l = 0.5 + rng.next() * 0.6;
        st.stitch(x, y + rng.next() * 0.8, x + 0.12, y - l, rng.next() < 0.6 ? D.walnutPale : D.weld, -1, 0.65);
      }, 1.25, 1.9);
      break;
    case "ploughed":
      st.pucker(poly, 0.08);
      furrows(st, id, [D.walnut, D.walnutDark, D.russet]);
      st.seed(poly, D.walnutPale, 0.12, 0.4);
      break;
    case "sown":
      st.pucker(poly, 0.08);
      furrows(st, id, [D.walnut, D.walnutDark, D.russet]);
      rows((x, y) => rng.next() < 0.7 && st.knot(x, y, D.cream, 0.42), 1.3, 2.3);
      break;
    case "shoots":
      furrows(st, id, [D.walnutPale, D.walnut], 1.6, 1.3);
      rows((x, y) => st.stitch(x, y, x + 0.1, y - 0.8 - rng.next() * 0.5, rng.next() < 0.6 ? D.sage : D.sageDark, -1, 0.7), 1.25, 1.9);
      break;
    case "green":
      st.pucker(poly, 0.12);
      laid(st, id, D.sage, D.sage);
      rows((x, y) => st.stitch(x, y, x + 0.15, y - 1.3 - rng.next() * 0.5, rng.next() < 0.5 ? D.sageDark : D.sage, -1, 0.72), 1.1, 2.2);
      break;
    case "ripe":
      st.pucker(poly, 0.12);
      laid(st, id, D.weld, D.weld);
      rows((x, y) => {
        st.stitch(x, y, x + 0.2, y - 1.6, D.weld, -1, 0.75);
        st.knot(x + 0.2, y - 1.7, rng.next() < 0.7 ? D.weld : D.walnutPale, 0.55);
      }, 1.2, 2.6);
      break;
    case "reaped": {
      rows((x, y) => st.stitch(x, y, x + 0.15, y - 0.8, D.weld, -1, 0.7), 1.3, 2.2);
      // Stooks: sheaves leaned together.
      for (let k = 0; k < 3; k++) {
        const y = 58 + k * 8.5 + rng.next() * 2;
        const x = across(id, 0.5, y) + (rng.next() - 0.5) * 2;
        const stook: Poly = [
          [x - 1.8, y + 1],
          [x - 0.5, y - 3.2],
          [x + 0.5, y - 3.2],
          [x + 1.8, y + 1],
        ];
        st.satin(stook, [D.weld, D.weld, D.walnutPale], Math.PI / 2 - 0.1, 0.3, 2.5);
        st.stitch(x - 1.2, y - 1.2, x + 1.2, y - 1.2, D.madder, -1, 0.8);
        st.stem([...stook, stook[0]], D.walnut, 0.7, 0.7);
      }
      break;
    }
  }
  // The baulk between strips.
  st.split([[s.x0 + 2.2, STRIP_Y.far], [s.x0, STRIP_Y.near]], D.walnutPale, 0.8, 0.6);
  // Flood-flattened corn and standing water.
  if (flood > 0.25) {
    for (let k = 0; k < Math.round(flood * 5); k++) {
      const y = 70 + rng.next() * 10;
      const x = across(id, 0.2 + rng.next() * 0.6, y);
      const pool = ellipse(x, y, 2.4 + rng.next() * 1.5, 0.9, 12);
      st.satin(pool, [D.woadPale, D.woadPale, D.cream], 0.3, 0.28);
    }
  }
}

function meadow(st: Stitcher, mown: number, stacked: number, carted: number, fm: number): void {
  const rng = new Rng(4711);
  st.rng = rng;
  const w = MEADOW.x1 - MEADOW.x0;
  const cut = MEADOW.x0 + w * mown;
  const season = seasonOf(fm);
  // Standing grass, from the cut edge to the river.
  if (season >= 1 && mown < 1) {
    const tall = season === 3 || season === 2;
    for (let x = cut + 0.4; x < MEADOW.x1; x += 0.9) {
      for (let y = 64 + ((x * 7) % 1.6); y < 85.5; y += 2.1) {
        const jx = x + (rng.next() - 0.5) * 0.5;
        st.stitch(jx, y, jx + 0.3, y - (tall ? 1.9 : 1), rng.next() < 0.5 ? D.sage : D.sageDark, -1, 0.7);
        if (tall && rng.next() < 0.08) st.knot(jx + 0.3, y - 2, rng.pick([D.weld, D.cream, D.madderPale, D.woadPale]), 0.6);
      }
    }
  } else if (mown < 1) {
    st.seed([[MEADOW.x0, 64], [MEADOW.x1, 64], [MEADOW.x1, 86], [MEADOW.x0, 86]], D.sage, 0.2, 0.6);
  }
  // Mown: short stubble and the windrows.
  if (mown > 0) {
    for (let x = MEADOW.x0 + 0.4; x < cut; x += 1.7) {
      for (let y = 65 + rng.next() * 2; y < 85.5; y += 2.4 + rng.next() * 1.6) {
        if (rng.next() < 0.35) continue;
        const jx = x + (rng.next() - 0.5) * 1.2;
        st.stitch(jx, y, jx + (rng.next() - 0.3) * 0.5, y - 0.5 - rng.next() * 0.5, rng.next() < 0.7 ? D.sage : D.sageDark, -1, 0.62);
      }
    }
    const left = stacked < mown;
    if (left) for (let y = 68; y < 85; y += 5.5) st.running([[MEADOW.x0 + 1, y], [cut - 1, y + 0.8]], D.weld, 1, 0.5, 0.8);
  }
  // Haycocks, stacked and waiting for the cart.
  const cocks = Math.round((stacked - carted) * 7);
  for (let i = 0; i < cocks; i++) {
    const x = MEADOW.x0 + 8 + ((i * 13.3) % (w - 16));
    const y = 70 + ((i * 5.7) % 13);
    const dome = ellipse(x, y, 2.6, 3.1, 14, Math.PI, Math.PI * 2);
    st.pucker(dome, 0.12);
    st.satin(dome, [D.weld, D.walnutPale, D.weld], Math.PI / 2 - 0.2, 0.3, 2.2);
    st.stem(dome, D.walnut, 0.7, 0.8);
  }
}

// --- The churchyard ------------------------------------------------------------

function grave(st: Stitcher, slot: number, old: number): void {
  const g = GRAVE_SLOTS[slot];
  st.fade = 1 - old * 0.45;
  st.rng = new Rng(slot * 13 + 1);
  const mound = ellipse(g.x, g.y + 0.6, 2.4, 1.3, 12, Math.PI, Math.PI * 2);
  st.couched(mound, D.sage, 0.05, D.sageDark, 0.4, 1.2);
  st.stem(mound, D.sageDark, 0.7, 0.8);
  st.stem([[g.x, g.y + 0.2], [g.x, g.y - 4.6]], D.walnut, 0.7, 0.9);
  st.stem([[g.x - 1.3, g.y - 3.4], [g.x + 1.3, g.y - 3.4]], D.walnut, 0.7, 0.9);
  st.fade = 1;
}

// --- Words -------------------------------------------------------------------------

export function inscription(st: Stitcher, la: string, x0: number, x1: number, big = false): void {
  const laid = layText(la, x0, x1, 2.5, 10.7, big ? 6.4 : 6, big ? 3.6 : 3.1, 2);
  st.rng = new Rng(la.length * 97 + la.charCodeAt(0));
  const len = Math.max(0.55, Math.min(1.05, laid.height * 0.2));
  for (const l of laid.letters) {
    const wool = WORD_WOOLS[l.word % WORD_WOOLS.length];
    for (const s of l.strokes) st.stem(s, wool, len, laid.height < 4 ? 0.85 : 1);
  }
  for (const [x, y] of laid.dots) st.knot(x, y, D.weld, laid.height < 4 ? 0.65 : 0.8);
}

/** The order the needle works an inscription's letters, for the reveal. */
export function letterSpans(la: string, x0: number, x1: number): [number, number][] {
  const laid = layText(la, x0, x1, 2.5, 10.7, 6, 3.1, 2);
  return laid.letters.map((l) => {
    let a = Infinity;
    let b = -Infinity;
    for (const s of l.strokes) for (const [x] of s) {
      a = Math.min(a, x);
      b = Math.max(b, x);
    }
    return [a - 0.4, b + 0.4];
  });
}

function smallText(st: Stitcher, text: string, x0: number, x1: number, y0: number, y1: number, align: "left" | "center" = "left"): void {
  const laid = layText(text, x0, x1, y0, y1, 2.7, 1.55, 3, align);
  const len = Math.max(0.45, laid.height * 0.24);
  for (const l of laid.letters) {
    const wool = WORD_WOOLS[l.word % WORD_WOOLS.length];
    for (const s of l.strokes) st.split(s, wool, len, 0.72);
  }
  for (const [x, y] of laid.dots) st.knot(x, y, D.weld, 0.5);
}

function lowIncipit(st: Stitcher): void {
  st.rng = new Rng(1382);
  // A great initial H in a knotted square.
  const x = LOWER_INCIPIT.x0 + 1;
  const sq: Poly = [
    [x, 89.2],
    [x + 9, 89.2],
    [x + 9, 97.8],
    [x, 97.8],
  ];
  st.couched(sq, D.woad, 0.02, D.woadPale, 0.42, 1.3);
  st.stem([...sq, sq[0]], D.madder, 0.8);
  st.stem([[x + 2.8, 90.6], [x + 2.8, 96.4]], D.weld, 0.8);
  st.stem([[x + 6.2, 90.6], [x + 6.2, 96.4]], D.weld, 0.8);
  st.stem([[x + 2.8, 93.5], [x + 6.2, 93.5]], D.weld, 0.8);
  smallText(st, "OC OPUS INCEPTUM EST ANNO DOMINI MCCCLXXXII", x + 11, LOWER_INCIPIT.x1 - 1, 89.4, 97.6);
}

// --- The chronicle -------------------------------------------------------------------

function vignette(st: Stitcher, slot: number, kind: ChronicleKind, la: string): void {
  const s = CHRONICLE_SLOTS[slot];
  st.rng = new Rng(slot * 71 + la.length);
  const cx = s.x0 + 6;
  const cy = 93.6;
  picture(st, kind, cx, cy);
  const text = la.replace(/^HIC\s+/, "");
  smallText(st, text, s.x0 + 12.5, s.x1 - 1.5, 89.3, 97.9);
  // A dividing sprig after each vignette.
  st.stem([[s.x1 - 0.3, 90.2], [s.x1 - 0.3, 97.2]], D.sage, 0.7, 0.6);
  st.knot(s.x1 - 0.3, 89.8, D.weld, 0.55);
}

function picture(st: Stitcher, kind: ChronicleKind, cx: number, cy: number): void {
  switch (kind) {
    case "birth":
    case "named": {
      // A cradle on rockers with a swaddled child.
      const box: Poly = [
        [cx - 3.6, cy + 1],
        [cx - 3.2, cy - 1.4],
        [cx + 3.2, cy - 1.4],
        [cx + 3.6, cy + 1],
      ];
      st.couched(box, D.walnut, 0, D.walnutDark, 0.4, 1.1);
      st.stem([...box, box[0]], D.walnutDark, 0.6, 0.7);
      st.stem(ellipse(cx, cy + 0.3, 4.4, 2.6, 10, 0.3, Math.PI - 0.3), D.walnutDark, 0.6, 0.7);
      const babe = ellipse(cx - 0.5, cy - 2.2, 2.6, 1.1, 12);
      st.satin(babe, [D.cream], 0.2, 0.26);
      st.running([[cx - 2.4, cy - 2.2], [cx + 1.6, cy - 2.2]], D.madder, 0.4, 0.4, 0.6);
      st.knot(cx + 2.1, cy - 2.5, D.cream, 0.7);
      if (kind === "named") {
        const sh = ellipse(cx + 2.8, cy - 4.2, 1.2, 1, 8);
        st.satin(sh, [D.cream], Math.PI / 2, 0.24);
        st.split([[cx + 2.8, cy - 5.2], [cx + 2.8, cy - 3.2]], D.walnut, 0.4, 0.5);
      }
      return;
    }
    case "marriage": {
      // Two joined rings under an arch.
      st.stem([...ellipse(cx, cy - 1.4, 4.2, 4, 14, Math.PI, Math.PI * 2)], D.woad, 0.7, 0.8);
      st.stem([[cx - 4.2, cy - 1.4], [cx - 4.2, cy + 3.4]], D.woad, 0.7, 0.8);
      st.stem([[cx + 4.2, cy - 1.4], [cx + 4.2, cy + 3.4]], D.woad, 0.7, 0.8);
      st.stem(ellipse(cx - 1.1, cy + 0.6, 1.5, 1.5, 12), D.weld, 0.5, 0.8);
      st.stem(ellipse(cx + 1.1, cy + 0.6, 1.5, 1.5, 12), D.weld, 0.5, 0.8);
      return;
    }
    case "burial":
    case "hunger": {
      const mound = ellipse(cx, cy + 2.6, 4, 2, 12, Math.PI, Math.PI * 2);
      st.couched(mound, D.sage, 0.05, D.sageDark, 0.4, 1.1);
      st.stem([[cx, cy + 2.4], [cx, cy - 3.8]], D.walnut, 0.6, 0.9);
      st.stem([[cx - 1.8, cy - 2], [cx + 1.8, cy - 2]], D.walnut, 0.6, 0.9);
      if (kind === "hunger") st.stem(ellipse(cx, cy - 0.5, 2.6, 1.2, 10, 0, Math.PI), D.walnutDark, 0.6, 0.8);
      return;
    }
    case "harvest": {
      // A sheaf, bound.
      for (let k = -4; k <= 4; k++) {
        st.stitch(cx + k * 0.25, cy + 3.4, cx + k * 0.65, cy - 3.4, D.weld, -1, 0.7);
        st.knot(cx + k * 0.65, cy - 3.6, D.weld, 0.5);
      }
      st.stitch(cx - 1.6, cy + 0.4, cx + 1.6, cy + 0.4, D.madder, -1, 0.9);
      return;
    }
    case "spate":
    case "lostSheep":
    case "bridge":
    case "bridgeMended": {
      for (let k = 0; k < 3; k++) {
        const y = cy + 1 + k * 1.3;
        const pts: Pt[] = [];
        for (let x = cx - 4.5; x <= cx + 4.5; x += 0.8) pts.push([x, y + Math.sin(x * 1.6 + k) * 0.35]);
        st.split(pts, k === 1 ? D.woadPale : D.woad, 0.6, 0.8);
      }
      if (kind === "bridge" || kind === "bridgeMended") {
        const whole = kind === "bridgeMended";
        st.stem(whole ? [[cx - 4.6, cy - 0.4], [cx + 4.6, cy - 0.4]] : [[cx - 4.6, cy - 0.4], [cx - 1, cy - 0.2]], D.walnut, 0.6, 1);
        if (!whole) st.stem([[cx + 1.4, cy + 0.8], [cx + 4.6, cy - 0.4]], D.walnut, 0.6, 1);
        for (const x of whole ? [cx - 3.5, cx, cx + 3.5] : [cx - 3.5]) st.split([[x, cy - 0.4], [x, cy - 2.6]], D.walnut, 0.5, 0.7);
      } else if (kind === "lostSheep") {
        st.satin(ellipse(cx, cy - 1.4, 2.2, 1.3, 12), [D.cream], 0.1, 0.28);
        st.knot(cx + 2.2, cy - 1.6, D.walnutDark, 0.7);
      } else {
        st.split([[cx - 2, cy - 3.6], [cx, cy - 1.2], [cx + 2, cy - 3.6]], D.woadPale, 0.5, 0.7);
      }
      return;
    }
    case "comet": {
      st.knot(cx + 2.6, cy - 2.4, D.weld, 1.3);
      for (let k = -2; k <= 2; k++) st.split([[cx + 2, cy - 2 + k * 0.35], [cx - 3.8, cy + 2.4 + k * 0.9]], k % 2 ? D.weld : D.madderPale, 0.6, 0.7);
      return;
    }
    case "meteors": {
      for (let k = 0; k < 3; k++) {
        const x = cx - 3 + k * 3;
        const y = cy - 3 + (k % 2) * 2.4;
        st.knot(x, y, D.cream, 0.7);
        st.split([[x, y], [x - 2, y + 2.2]], D.woadPale, 0.5, 0.6);
      }
      return;
    }
    case "visit": {
      // The pilgrim's staff, hat and scallop.
      st.stem([[cx - 1.6, cy + 4], [cx + 1, cy - 4]], D.walnut, 0.7, 0.9);
      st.satin(ellipse(cx + 1.3, cy - 2.2, 3, 0.8, 12), [D.walnutPale], 0, 0.26);
      const sh = ellipse(cx + 1.6, cy + 1.4, 1.5, 1.3, 10);
      st.satin(sh, [D.cream], Math.PI / 2, 0.24);
      for (let k = -1; k <= 1; k++) st.split([[cx + 1.6, cy + 2.6], [cx + 1.6 + k * 0.9, cy + 0.4]], D.madder, 0.4, 0.5);
      return;
    }
    case "cottage": {
      const w: Poly = [
        [cx - 3.4, cy + 3.4],
        [cx - 3.4, cy],
        [cx + 3.4, cy],
        [cx + 3.4, cy + 3.4],
      ];
      st.couched(w, D.cream, 0, D.walnutPale, 0.4, 1.2);
      const r: Poly = [
        [cx - 4.4, cy + 0.2],
        [cx, cy - 3.8],
        [cx + 4.4, cy + 0.2],
      ];
      st.couched(r, D.weld, Math.PI / 2, D.walnut, 0.4, 1.1);
      st.stem([...r, r[0]], D.walnutDark, 0.6, 0.7);
      return;
    }
    case "reeve": {
      st.stem([[cx, cy + 4], [cx, cy - 4]], D.walnut, 0.7, 1);
      for (let k = 0; k < 4; k++) st.stitch(cx - 1, cy - 2.6 + k * 1.2, cx + 1, cy - 2.6 + k * 1.2, D.madder, -1, 0.7);
      return;
    }
    case "slaughter": {
      const body = ellipse(cx, cy, 3.6, 2.1, 14);
      st.couched(body, D.madderPale, 0, D.madder, 0.4, 1.2);
      st.stem(body, D.walnut, 0.6, 0.7);
      st.knot(cx + 3.6, cy - 0.4, D.madderPale, 0.8);
      return;
    }
    case "feast": {
      st.satin([[cx - 3.6, cy + 1], [cx - 2.4, cy - 2], [cx - 1.2, cy + 1]], [D.weld], Math.PI / 2, 0.26);
      st.satin(ellipse(cx + 1.8, cy + 0.6, 2.2, 1.4, 12), [D.walnutPale], 0, 0.26);
      return;
    }
    case "priest": {
      st.stem([[cx, cy + 4], [cx, cy - 4]], D.weld, 0.6, 1);
      st.stem([[cx - 2.4, cy - 1.8], [cx + 2.4, cy - 1.8]], D.weld, 0.6, 1);
      return;
    }
    case "reeve" as ChronicleKind:
    default:
      st.knot(cx, cy, D.weld, 1.2);
  }
}

// --- Water ------------------------------------------------------------------------

function river(st: Stitcher, level: number): void {
  st.rng = new Rng(Math.round(level * 100) + 3);
  const top = hillY(690) + 1;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let y = top; y <= 86.8; y += 1.2) {
    const c = riverCentre(y);
    const hw = riverHalfWidth(level, y) * Math.min(1, (y - top) / 6 + 0.25);
    left.push([c - hw, y]);
    right.push([c + hw, y]);
  }
  const water: Poly = [...left, ...right.reverse()];
  st.pucker(water, 0.12);
  // Satin water, across the flow, in three blues and a pale for the light.
  st.satin(water, [D.woad, D.woad, D.woadPale, D.woad, D.cream], 0.62, 0.3, 2.4);
  // Ripples.
  for (let y = top + 4; y < 86; y += 3.1) {
    const c = riverCentre(y);
    const hw = riverHalfWidth(level, y) * 0.6;
    st.split([[c - hw * 0.5, y], [c + hw * 0.1, y + 0.6], [c + hw * 0.6, y + 0.3]], D.cream, 0.7, 0.6);
  }
  st.stem(left, D.walnut, 1, 0.9);
  st.stem(right.reverse(), D.walnut, 1, 0.9);
  // In spate, the water spreads over the low meadow.
  if (level > MEADOW_FLOOD_LEVEL) {
    const k = Math.min(1, (level - MEADOW_FLOOD_LEVEL) / 0.3);
    const x0 = 680 - (680 - MEADOW.x0) * k;
    // It meets the river at the bank, and thins to nothing at its far edge.
    const x1 = Math.min(684, riverCentre(84) - riverHalfWidth(level, 84) + 1.5);
    const pts: Pt[] = [];
    for (let x = x0; x <= x1 + 0.01; x += 1.6) {
      const u = Math.min(1, (x - x0) / 14);
      const ease = u * u * (3 - 2 * u);
      pts.push([x, 86.4 - ease * (6.4 + k * 7 + Math.sin(x / 3.3) * 0.8)]);
    }
    const flood: Poly = [...pts, [x1, 86.6], [x0, 86.6]];
    st.satin(flood, [D.woadPale, D.woad, D.woadPale, D.cream], 0.5, 0.3, 2.6);
    st.split(pts, D.woad, 0.8, 0.7);
  }
}

function bridge(st: Stitcher): void {
  st.rng = new Rng(77);
  const y = BRIDGE.y;
  const deck: Poly = [
    [BRIDGE.x0, y],
    [BRIDGE.x0 + 4, y - 1.6],
    [BRIDGE.x1 - 4, y - 1.6],
    [BRIDGE.x1, y],
    [BRIDGE.x1 - 4, y - 0.4],
    [BRIDGE.x0 + 4, y - 0.4],
  ];
  st.satin(deck, [D.walnutPale, D.walnut], Math.PI / 2, 0.3);
  st.stem([[BRIDGE.x0, y], [BRIDGE.x0 + 4, y - 1.6], [BRIDGE.x1 - 4, y - 1.6], [BRIDGE.x1, y]], D.walnutDark, 0.8);
  // Rails and posts.
  st.stem([[BRIDGE.x0 + 1, y - 3.6], [BRIDGE.x0 + 4, y - 5.2], [BRIDGE.x1 - 4, y - 5.2], [BRIDGE.x1 - 1, y - 3.6]], D.walnut, 0.8, 0.8);
  for (let x = BRIDGE.x0 + 2; x <= BRIDGE.x1 - 2; x += 4.5) {
    const yy = y - (x > BRIDGE.x0 + 4 && x < BRIDGE.x1 - 4 ? 1.6 : 0.8);
    st.split([[x, yy], [x, yy - 3.6]], D.walnut, 0.6, 0.8);
  }
  // Piles in the water.
  for (const x of [680, 700]) st.stem([[x, y - 0.6], [x, y + 2.4]], D.walnutDark, 0.7, 0.9);
}

// --- Trees, sky ------------------------------------------------------------------------

function canopy(st: Stitcher, t: Tree, season: number): void {
  const rng = new Rng(t.id * 57 + season);
  st.rng = rng;
  const evergreen = t.kind === "yew";
  if (season === 0 && !evergreen) return;
  const cy = t.y - t.h * 0.72;
  const crown = t.kind === "willow" ? blob(t.x, cy + 2, t.r * 1.05, t.r * 1.05, rng, 5, 0.12) : blob(t.x, cy, t.r, t.r * (t.kind === "yew" ? 1.2 : 0.86), rng, t.kind === "oak" ? 11 : 9, t.kind === "oak" ? 0.07 : 0.05);
  const fill =
    evergreen ? D.sageDark
    : season === 1 ? D.sage
    : season === 2 ? D.sage
    : season === 3 ? (t.id % 3 === 0 ? D.sageDark : D.sage)
    : season === 4 ? (t.id % 3 === 0 ? D.russet : t.id % 3 === 1 ? D.weld : D.madderPale)
    : D.russet;
  if (season === 1 && !evergreen) {
    // Leaf-buds only: knots over the branches.
    for (let i = 0; i < 26; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = Math.sqrt(rng.next());
      st.knot(t.x + Math.cos(a) * t.r * r, cy + Math.sin(a) * t.r * 0.8 * r, D.sage, 0.65);
    }
    return;
  }
  if (season === 5 && !evergreen) {
    // Last leaves hanging on.
    for (let i = 0; i < 16; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = Math.sqrt(rng.next());
      st.knot(t.x + Math.cos(a) * t.r * r, cy + Math.sin(a) * t.r * 0.8 * r, rng.pick([D.russet, D.weld]), 0.6);
    }
    return;
  }
  st.pucker(crown, 0.12);
  st.couched(crown, fill, t.kind === "willow" ? Math.PI / 2 : -0.5 + (t.id % 3) * 0.3, t.kind === "yew" ? D.walnutDark : D.sageDark, 0.42, 1.4);
  st.stem([...crown, crown[0]], evergreen || season === 3 ? D.sageDark : D.walnut, 1);
  // Inner veins of the crown, as crewel trees have.
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + (k - 1) * 0.7;
    st.split([[t.x, cy + t.r * 0.5], [t.x + Math.cos(a) * t.r * 0.7, cy + Math.sin(a) * t.r * 0.6]], season === 3 ? D.sageDark : D.walnut, 0.7, 0.6);
  }
  if (season === 2 && (t.kind === "fruit" || t.kind === "elm")) for (let i = 0; i < 14; i++) st.knot(t.x + (rng.next() - 0.5) * t.r * 1.6, cy + (rng.next() - 0.5) * t.r * 1.2, t.kind === "fruit" ? D.cream : D.rose, 0.7);
  if (season === 4 && t.kind === "fruit") for (let i = 0; i < 8; i++) st.knot(t.x + (rng.next() - 0.5) * t.r * 1.4, cy + (rng.next() - 0.5) * t.r, D.madder, 0.8);
  if (t.kind === "oak" && season === 4) for (let i = 0; i < 6; i++) st.knot(t.x + (rng.next() - 0.5) * t.r * 1.4, cy + (rng.next() - 0.2) * t.r * 0.8, D.walnut, 0.6);
}

function moon(st: Stitcher, phase: number, at: number): void {
  st.rng = new Rng(phase * 11 + at);
  const cx = at;
  const cy = 23;
  const r = 3.6;
  const p = phase / 16; // 0 new .. 0.5 full .. 1 new
  const lit = (1 - Math.cos(p * Math.PI * 2)) / 2;
  // The dark of the moon: nothing to stitch.
  if (lit < 0.04) return;
  const waxing = p < 0.5;
  const pts: Pt[] = [];
  // Outer limb on the lit side.
  for (let i = 0; i <= 16; i++) {
    const a = -Math.PI / 2 + (i / 16) * Math.PI;
    pts.push([cx + (waxing ? 1 : -1) * Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  // Terminator back.
  const k = 1 - 2 * lit;
  for (let i = 16; i >= 0; i--) {
    const a = -Math.PI / 2 + (i / 16) * Math.PI;
    pts.push([cx + (waxing ? 1 : -1) * Math.cos(a) * r * k, cy + Math.sin(a) * r]);
  }
  st.satin(pts, [D.cream, D.cream, D.weld], 1.1, 0.26);
  st.stem(pts, D.walnutPale, 0.6, 0.6);
}

function comet(st: Stitcher): void {
  st.rng = new Rng(1066);
  const hx = 956;
  const hy = 21;
  // The hair of the star, streaming.
  for (let k = 0; k < 13; k++) {
    const spread = (k - 6) * 0.7;
    const len = 118 - Math.abs(spread) * 9 - (k % 3) * 12;
    const pts: Pt[] = [];
    for (let t = 0; t <= 1.001; t += 0.07) {
      const x = hx - t * len;
      // Each hair of the star waves a little as it streams away.
      const y = hy + t * (10 + spread * 2.2) + t * t * 5 + Math.sin(t * 9 + k * 1.3) * 1.3 * t;
      pts.push([x, y]);
    }
    const wool = k % 3 === 0 ? D.madderPale : k % 3 === 1 ? D.weld : D.cream;
    if (k % 2 === 0) st.stem(pts, wool, 1, 0.8);
    else st.split(pts, wool, 0.9, 0.7);
  }
  // The star itself.
  const head = ellipse(hx, hy, 2.6, 2.4, 16);
  st.satin(head, [D.weld, D.cream, D.weld], 0.8, 0.26);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    st.stitch(hx + Math.cos(a) * 3, hy + Math.sin(a) * 3, hx + Math.cos(a) * 5, hy + Math.sin(a) * 5, D.weld, -1, 0.75);
  }
}

export function treeCount(): number {
  return TREES.length;
}

export { hash01 };
