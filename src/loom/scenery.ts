/**
 * Ashcombe in thread: the landscape, the borders, the trees and every
 * building, drawn stitch by stitch into a tile of the hanging. Only what
 * does not change is here; what changes (strips, graves, inscriptions, the
 * river's height, the leaves) is drawn as patches (see patches.ts).
 *
 * Variants: day, night (a laid woad sky, stars), and snow.
 */
import { hash01 } from "../sim/rng";
import { Rng } from "../sim/rng";
import { BAND, BUILDINGS, CLOTH_LENGTH, FIELD_X, FRONTIER_X, MEADOW, ROLLER_X, roadY, type Building } from "../sim/geography";
import { D } from "./palette";
import { blob, ellipse, type Poly, type Pt, type Stitcher } from "./stitches";

export interface Variant {
  night: boolean;
  snow: boolean;
}

// ---------------------------------------------------------------------------
// The far hills
// ---------------------------------------------------------------------------

export function hillY(x: number): number {
  return 43 + 3.4 * Math.sin(x / 57 + 0.4) + 2.1 * Math.sin(x / 19 + 1.3) + 0.8 * Math.sin(x / 7.3);
}

/**
 * Points along a line, on a grid anchored at the hem, and running a little
 * past the ends: neighbouring tiles then stitch exactly the same stitches
 * across their shared edge, so no seam shows.
 */
function linePts(x0: number, x1: number, f: (x: number) => number, step = 1.2, overrun = 3): Pt[] {
  const out: Pt[] = [];
  const start = Math.floor((x0 - overrun) / step) * step;
  for (let x = start; x <= x1 + overrun + 0.01; x += step) out.push([x, f(x)]);
  return out;
}

// ---------------------------------------------------------------------------
// Trees: where they stand. Canopies are seasonal patches; trunks are here.
// ---------------------------------------------------------------------------

export interface Tree {
  id: number;
  x: number;
  /** Foot of the trunk. */
  y: number;
  h: number;
  r: number;
  kind: "oak" | "ash" | "willow" | "fruit" | "yew" | "elm";
}

export const TREES: Tree[] = (() => {
  const out: Tree[] = [];
  const rng = new Rng(9021);
  // The forest edge: thick at the hem, thinning toward the fields.
  const forestXs = [6, 20, 34, 44, 86, 94, 134, 150, 164, 180, 196, 212, 226];
  forestXs.forEach((x, i) => {
    const back = i % 2 === 0;
    out.push({
      id: out.length,
      x: x + rng.range(-3, 3),
      y: back ? 64 + rng.range(-1, 1) : 72 + rng.range(-2, 3),
      h: back ? rng.range(20, 26) : rng.range(15, 21),
      r: rng.range(7, 10),
      kind: rng.chance(0.5) ? "oak" : rng.chance(0.5) ? "ash" : "elm",
    });
  });
  const add = (x: number, y: number, h: number, r: number, kind: Tree["kind"]) => out.push({ id: out.length, x, y, h, r, kind });
  add(258, 58, 12, 5.5, "elm");
  add(532, 58, 11, 5, "ash");
  add(606, 64, 15, 6, "willow");
  add(664, 70, 14, 6.5, "willow");
  add(740, 60, 12, 5.5, "ash");
  add(862, 62, 16, 6, "yew");
  add(1000, 60, 12, 5, "elm");
  add(1100, 60, 13, 5.5, "oak");
  add(1232, 66, 9, 4.2, "fruit");
  add(1266, 70, 9, 4.2, "fruit");
  add(1292, 66, 9, 4.2, "fruit");
  add(1316, 60, 13, 6, "oak");
  add(1420, 60, 12, 5, "ash");
  add(1498, 62, 10, 5, "elm");
  return out;
})();

function trunk(st: Stitcher, t: Tree, snow: boolean): void {
  const top = t.y - t.h * 0.55;
  const w = t.kind === "willow" ? 1.4 : t.kind === "fruit" ? 0.9 : 1.2 + t.h * 0.03;
  const lean = (hash01(t.id, 3) - 0.5) * 1.6;
  const poly: Poly = [
    [t.x - w, t.y],
    [t.x - w * 0.5 + lean, top],
    [t.x + w * 0.5 + lean, top],
    [t.x + w, t.y],
  ];
  st.couched(poly, D.walnut, Math.PI / 2 + 0.05, D.walnutDark, 0.4, 1.2);
  st.stem([poly[0], poly[1]], D.walnutDark, 0.9, 0.8);
  st.stem([poly[3], poly[2]], D.walnutDark, 0.9, 0.8);
  // Branches, which show bare in winter and under the leaves otherwise.
  const rng = new Rng(t.id * 31 + 7);
  const n = t.kind === "willow" ? 6 : 5;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * (t.kind === "yew" ? 1.2 : 2.2);
    const len = t.r * (0.6 + rng.next() * 0.45);
    const bx = t.x + lean;
    const by = top + rng.range(0, 1.5);
    const ex = bx + Math.cos(a) * len;
    const ey = by + Math.sin(a) * len * 0.9;
    const mx = bx + Math.cos(a) * len * 0.5 + rng.range(-0.8, 0.8);
    const my = by + Math.sin(a) * len * 0.45;
    st.stem(t.kind === "willow" ? [[bx, by], [mx, my - 1], [ex, ey + 2], [ex + Math.cos(a) * 1.5, ey + 5]] : [[bx, by], [mx, my], [ex, ey]], D.walnut, 0.9, 0.75);
    // Twigs.
    for (let k = 0; k < 2; k++) {
      const ta = a + (k ? 0.5 : -0.5);
      st.split([[ex, ey], [ex + Math.cos(ta) * 1.8, ey + Math.sin(ta) * 1.8]], D.walnut, 0.6, 0.6);
    }
    if (snow && rng.chance(0.6)) st.knot(ex, ey - 0.3, D.cream, 0.8);
  }
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

type Roof = "thatch" | "slate" | "stone" | "tile";

function wallPoly(x0: number, x1: number, yTop: number, yBase: number): Poly {
  return [
    [x0, yBase],
    [x0, yTop],
    [x1, yTop],
    [x1, yBase],
  ];
}

/** Timber-framed walls with a cruck roof and an arched opening onto the interior. */
function cottage(st: Stitcher, b: Building, v: Variant, opts: { roof?: Roof; wall?: number; big?: boolean } = {}): void {
  const x0 = b.x - b.w / 2;
  const x1 = b.x + b.w / 2;
  const base = b.y;
  const wallTop = base - b.h * 0.5;
  const ridge = base - b.h;
  const wall = opts.wall ?? D.cream;
  const roofWool = opts.roof === "slate" ? D.woadPale : opts.roof === "stone" ? D.grey : opts.roof === "tile" ? D.madderPale : D.weld;
  // Walls.
  const wp = wallPoly(x0, x1, wallTop, base);
  st.pucker(wp, 0.1);
  st.couched(wp, wall, 0.02, D.walnutPale, 0.42, 1.6);
  // Timber framing.
  st.stem([[x0, base], [x0, wallTop], [x1, wallTop], [x1, base]], D.walnut, 0.9);
  st.stem([[x0 + b.w * 0.33, wallTop], [x0 + b.w * 0.33, base]], D.walnut, 0.9, 0.8);
  st.stem([[x0 + b.w * 0.66, wallTop], [x0 + b.w * 0.66, base]], D.walnut, 0.9, 0.8);
  st.split([[x0, wallTop + (base - wallTop) * 0.45], [x1, wallTop + (base - wallTop) * 0.45]], D.walnut, 0.7, 0.7);
  // The arched opening (the house shown open, as the old hangings do).
  const ax0 = b.doorX - b.w * 0.2;
  const ax1 = b.doorX + b.w * 0.2;
  const aTop = wallTop + 1.4;
  const arch: Pt[] = [[ax0, base], [ax0, aTop + 2], ...ellipse((ax0 + ax1) / 2, aTop + 2, (ax1 - ax0) / 2, 2, 10, Math.PI, Math.PI * 2), [ax1, base]];
  // Bare linen inside: unpick the wall there by laying linen colour over it.
  const g = st.g;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.save();
  g.beginPath();
  arch.forEach(([x, y], i) => (i ? g.lineTo(st.X(x), st.Y(y)) : g.moveTo(st.X(x), st.Y(y))));
  g.closePath();
  if (!st.back) {
    g.fillStyle = "rgba(196,188,168,0.97)";
    g.fill();
  }
  g.restore();
  st.stem(arch, D.walnutDark, 0.8);
  // Roof.
  const over = 1.4;
  const roof: Poly = [
    [x0 - over, wallTop + 0.4],
    [b.x - b.w * 0.18, ridge],
    [b.x + b.w * 0.18, ridge],
    [x1 + over, wallTop + 0.4],
  ];
  st.pucker(roof, 0.12);
  if (opts.roof === "slate" || opts.roof === "tile") st.satin(roof, [roofWool, roofWool, D.grey], 1.2, 0.34, 2.2);
  else st.couched(roof, roofWool, Math.PI / 2 - 0.5, D.walnut, 0.4, 1.3);
  st.stem([...roof, roof[0]], D.walnut, 0.92);
  // Thatch texture: rows of couching along the eaves.
  if (!opts.roof || opts.roof === "thatch") {
    for (let k = 1; k <= 3; k++) {
      const yy = ridge + ((wallTop - ridge) * k) / 4;
      const f = (yy - ridge) / (wallTop + 0.4 - ridge);
      const xl = b.x - b.w * 0.18 - (b.w * 0.32 + over) * f;
      const xr = b.x + b.w * 0.18 + (b.w * 0.32 + over) * f;
      st.running([[xl, yy], [xr, yy]], D.walnut, 0.7, 0.9, 0.7);
    }
  }
  if (v.snow) {
    const cap: Poly = [
      [x0 - over, wallTop + 0.1],
      [b.x - b.w * 0.18, ridge - 0.6],
      [b.x + b.w * 0.18, ridge - 0.6],
      [x1 + over, wallTop + 0.1],
      [x1 + over - 1, wallTop - 1],
      [b.x, ridge + 1.8],
      [x0 - over + 1, wallTop - 1],
    ];
    st.couched(cap, D.cream, 0.1, D.grey, 0.4, 1.8);
  }
  // A window.
  const wx = b.doorX > b.x ? x0 + b.w * 0.16 : x1 - b.w * 0.16;
  st.satin(wallPoly(wx - 1, wx + 1, wallTop + 2, wallTop + 4.2), [D.walnutDark], 0, 0.3);
}

function church(st: Stitcher, b: Building, v: Variant): void {
  const x0 = b.x - b.w / 2;
  const x1 = b.x + b.w / 2;
  const base = b.y;
  const naveTop = base - b.h * 0.55;
  // Nave: grey stone in laid work with courses.
  const nave = wallPoly(x0 + 10, x1, naveTop, base);
  st.pucker(nave, 0.12);
  st.couched(nave, D.grey, 0, D.greyDark, 0.42, 2.2);
  for (let y = naveTop + 2.4; y < base; y += 2.4) st.running([[x0 + 10, y], [x1, y]], D.greyDark, 0.9, 1.2, 0.6);
  st.stem([...nave, nave[0]], D.walnut, 0.92);
  // Roof of the nave: slate.
  const roof: Poly = [
    [x0 + 9, naveTop + 0.4],
    [x0 + 13, naveTop - 8.5],
    [x1 - 3, naveTop - 8.5],
    [x1 + 1.5, naveTop + 0.4],
  ];
  st.satin(roof, [D.woad, D.woadPale, D.woad], 1.1, 0.34, 2.4);
  st.stem([...roof, roof[0]], D.walnut, 0.92);
  // Round-headed windows.
  for (const wx of [x0 + 20, x0 + 31, x0 + 42]) {
    const w: Pt[] = [[wx - 1.2, naveTop + 9], [wx - 1.2, naveTop + 5], ...ellipse(wx, naveTop + 5, 1.2, 1.4, 8, Math.PI, Math.PI * 2), [wx + 1.2, naveTop + 9]];
    st.satin(w, [v.night ? D.weld : D.woad], 0.1, 0.28);
    st.stem([...w, w[0]], D.walnutDark, 0.7, 0.8);
  }
  // The door, with its arch.
  const dx = b.doorX;
  const door: Pt[] = [[dx - 2.4, base], [dx - 2.4, base - 6], ...ellipse(dx, base - 6, 2.4, 2.4, 10, Math.PI, Math.PI * 2), [dx + 2.4, base]];
  st.couched(door, D.walnut, Math.PI / 2, D.walnutDark, 0.4, 1.3);
  st.stem([...door, door[0]], D.madder, 0.8);
  // The tower at the west end, with the bell chamber open.
  const tx0 = x0;
  const tx1 = x0 + 11;
  const tTop = base - b.h * 1.25;
  const tower = wallPoly(tx0, tx1, tTop, base);
  st.pucker(tower, 0.14);
  st.couched(tower, D.grey, Math.PI / 2, D.greyDark, 0.42, 2);
  for (let y = tTop + 2.4; y < base; y += 2.4) st.running([[tx0, y], [tx1, y]], D.greyDark, 0.8, 1.1, 0.6);
  st.stem([...tower, tower[0]], D.walnut, 0.92);
  // Battlements.
  for (let x = tx0; x < tx1 - 0.5; x += 2.2) {
    const m = wallPoly(x, x + 1.2, tTop - 1.6, tTop);
    st.satin(m, [D.grey], Math.PI / 2, 0.3);
    st.stem([...m, m[0]], D.walnutDark, 0.6, 0.7);
  }
  // The bell chamber (the bell itself is drawn live, swinging).
  const bc: Pt[] = [[tx0 + 3, tTop + 8], [tx0 + 3, tTop + 3.5], ...ellipse(tx0 + 5.5, tTop + 3.5, 2.5, 1.6, 8, Math.PI, Math.PI * 2), [tx0 + 8, tTop + 8]];
  const g = st.g;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.save();
  g.beginPath();
  bc.forEach(([x, y], i) => (i ? g.lineTo(st.X(x), st.Y(y)) : g.moveTo(st.X(x), st.Y(y))));
  g.closePath();
  if (!st.back) {
    g.fillStyle = "rgba(186,178,158,0.96)";
    g.fill();
  }
  g.restore();
  st.stem([...bc, bc[0]], D.walnutDark, 0.7);
  // The cross on the gable.
  st.stem([[x1 - 3, naveTop - 8.5], [x1 - 3, naveTop - 13]], D.weld, 0.8);
  st.stem([[x1 - 4.6, naveTop - 11.6], [x1 - 1.4, naveTop - 11.6]], D.weld, 0.8);
  // Churchyard wall.
  st.stem([[x1 + 3, base + 1], [x1 + 48, base + 1]], D.greyDark, 1, 0.8);
  for (let x = x1 + 3; x < x1 + 48; x += 1.6) st.knot(x, base + 0.3, D.grey, 0.6);
  if (v.snow) st.couched([[x0 + 9, naveTop - 0.4], [x0 + 13, naveTop - 9.2], [x1 - 3, naveTop - 9.2], [x1 + 1.5, naveTop - 0.4], [x1, naveTop - 2], [x0 + 12, naveTop - 7.5]], D.cream, 0.05, D.grey);
}

function mill(st: Stitcher, b: Building, v: Variant): void {
  cottage(st, b, v, { wall: D.walnutPale, roof: "thatch" });
  // The leat and the wheel pit on the river side.
  const x0 = b.x - b.w / 2;
  st.stem([[x0 - 2, b.y - 16], [x0 - 2, b.y + 4]], D.walnutDark, 1);
  st.satin(wallPoly(x0 - 8, x0 - 2, b.y - 1, b.y + 2), [D.woad, D.woadPale], 0.9, 0.3);
}

function alehouse(st: Stitcher, b: Building, v: Variant): void {
  cottage(st, b, v, { wall: D.cream });
  // The ale-stake: a pole out from the eaves with a bush on the end.
  const x1 = b.x + b.w / 2;
  const y = b.y - b.h * 0.52;
  st.stem([[x1 - 1, y], [x1 + 7, y - 3]], D.walnut, 0.9);
  const bush = blob(x1 + 8.3, y - 3.2, 2, 1.7, new Rng(88), 6, 0.2);
  st.couched(bush, D.sage, 0.6, D.sageDark, 0.4, 1.1);
  for (let i = 0; i < 6; i++) st.knot(x1 + 7 + (i % 3) * 1.2, y - 4 + Math.floor(i / 3) * 1.5, D.sageDark, 0.7);
  // A bench outside.
  st.stem([[b.x - 8, b.y + 8], [b.x + 8, b.y + 8]], D.walnut, 0.9);
  st.stem([[b.x - 7, b.y + 8], [b.x - 7, b.y + 10]], D.walnut, 0.7);
  st.stem([[b.x + 7, b.y + 8], [b.x + 7, b.y + 10]], D.walnut, 0.7);
}

function bakehouse(st: Stitcher, b: Building, v: Variant): void {
  cottage(st, b, v, { wall: D.walnutPale, roof: "tile" });
  // The oven dome beside it.
  const o = ellipse(b.x - b.w / 2 - 3, b.y, 3.6, 3.2, 14, Math.PI, Math.PI * 2);
  st.couched(o, D.madderPale, 0, D.madder, 0.4, 1.2);
  st.stem(o, D.walnutDark, 0.8);
}

function smithy(st: Stitcher, b: Building, v: Variant): void {
  cottage(st, b, v, { wall: D.greyDark, roof: "stone" });
  // Anvil at the door.
  const ax = b.x + b.w / 2 + 3;
  st.satin(wallPoly(ax - 1.8, ax + 1.8, b.y + 5.6, b.y + 6.6), [D.greyDark], 0, 0.28);
  st.satin(wallPoly(ax - 0.7, ax + 0.7, b.y + 6.6, b.y + 8.4), [D.greyDark], Math.PI / 2, 0.28);
}

function manor(st: Stitcher, b: Building, v: Variant): void {
  const x0 = b.x - b.w / 2;
  const x1 = b.x + b.w / 2;
  const base = b.y;
  const top = base - b.h * 0.58;
  const hall = wallPoly(x0, x1, top, base);
  st.pucker(hall, 0.14);
  st.couched(hall, D.cream, 0, D.walnutPale, 0.42, 1.8);
  st.stem([...hall, hall[0]], D.walnut, 0.92);
  for (const fx of [x0 + b.w * 0.25, x0 + b.w * 0.5, x0 + b.w * 0.75]) st.stem([[fx, top], [fx, base]], D.walnut, 0.9, 0.8);
  st.split([[x0, top + 5], [x1, top + 5]], D.walnut, 0.7, 0.7);
  // Tall windows of the hall.
  for (const wx of [x0 + 7, x0 + 19, x1 - 19, x1 - 7]) {
    const w: Pt[] = [[wx - 1.3, top + 13], [wx - 1.3, top + 8], ...ellipse(wx, top + 8, 1.3, 1.6, 8, Math.PI, Math.PI * 2), [wx + 1.3, top + 13]];
    st.satin(w, [v.night ? D.weld : D.woad], 0.1, 0.28);
    st.stem([...w, w[0]], D.walnutDark, 0.7, 0.8);
  }
  // The porch and door.
  const door: Pt[] = [[b.x - 2.6, base], [b.x - 2.6, base - 7], ...ellipse(b.x, base - 7, 2.6, 2.6, 10, Math.PI, Math.PI * 2), [b.x + 2.6, base]];
  st.couched(door, D.walnut, Math.PI / 2, D.walnutDark, 0.4, 1.3);
  st.stem([...door, door[0]], D.madder, 0.8);
  // Roof, tiled in madder.
  const roof: Poly = [
    [x0 - 1.5, top + 0.4],
    [x0 + 6, base - b.h],
    [x1 - 6, base - b.h],
    [x1 + 1.5, top + 0.4],
  ];
  st.pucker(roof, 0.12);
  st.satin(roof, [D.madder, D.madderPale, D.madder, D.russet], 1.15, 0.34, 2.3);
  st.stem([...roof, roof[0]], D.walnut, 0.92);
  // Louvre on the ridge, and a pennon.
  const lx = b.x + 4;
  st.satin(wallPoly(lx - 1.4, lx + 1.4, base - b.h - 3, base - b.h), [D.walnut], Math.PI / 2, 0.3);
  st.stem([[x1 - 7, base - b.h], [x1 - 7, base - b.h - 7]], D.walnutDark, 0.8);
  st.satin([[x1 - 7, base - b.h - 7], [x1 - 1.5, base - b.h - 6], [x1 - 7, base - b.h - 5]], [D.woad], 0.2, 0.28);
  if (v.snow) st.couched([[x0 - 1.5, top], [x0 + 6, base - b.h - 0.6], [x1 - 6, base - b.h - 0.6], [x1 + 1.5, top], [x1, top - 1.6], [x0, top - 1.6]], D.cream, 0.05, D.grey);
}

function barn(st: Stitcher, b: Building, v: Variant): void {
  const x0 = b.x - b.w / 2;
  const x1 = b.x + b.w / 2;
  const base = b.y;
  const top = base - b.h * 0.5;
  const walls = wallPoly(x0, x1, top, base);
  st.pucker(walls, 0.1);
  st.couched(walls, D.walnutPale, Math.PI / 2, D.walnut, 0.42, 1.6);
  for (let x = x0 + 3; x < x1; x += 3.2) st.split([[x, top], [x, base]], D.walnut, 0.8, 0.6);
  st.stem([...walls, walls[0]], D.walnut, 0.92);
  // Great doors.
  const d = wallPoly(b.x - 4, b.x + 4, top + 2, base);
  st.couched(d, D.walnut, Math.PI / 2, D.walnutDark, 0.42, 1.3);
  st.stem([...d, d[0]], D.walnutDark, 0.8);
  st.stem([[b.x, top + 2], [b.x, base]], D.walnutDark, 0.8);
  const roof: Poly = [
    [x0 - 1.4, top + 0.4],
    [x0 + 7, base - b.h],
    [x1 - 7, base - b.h],
    [x1 + 1.4, top + 0.4],
  ];
  st.couched(roof, D.weld, Math.PI / 2 - 0.45, D.walnut, 0.4, 1.3);
  st.stem([...roof, roof[0]], D.walnut, 0.92);
  if (v.snow) st.couched([[x0 - 1.4, top], [x0 + 7, base - b.h - 0.6], [x1 - 7, base - b.h - 0.6], [x1 + 1.4, top], [x1, top - 1.4], [x0, top - 1.4]], D.cream, 0.05, D.grey);
}

function dovecote(st: Stitcher, b: Building, v: Variant): void {
  const x0 = b.x - b.w / 2;
  const x1 = b.x + b.w / 2;
  const top = b.y - b.h * 0.6;
  const body = wallPoly(x0, x1, top, b.y);
  st.couched(body, D.cream, 0, D.grey, 0.42, 1.6);
  st.stem([...body, body[0]], D.walnut, 0.9);
  for (let y = top + 2; y < b.y - 1; y += 3) for (let x = x0 + 2; x < x1 - 1; x += 3) st.knot(x, y, D.walnutDark, 0.6);
  const roof: Poly = [[x0 - 1, top], [b.x, b.y - b.h], [x1 + 1, top]];
  st.couched(roof, D.madderPale, Math.PI / 2, D.madder, 0.4, 1.3);
  st.stem([...roof, roof[0]], D.walnut, 0.9);
  if (v.snow) st.couched([[x0, top - 0.2], [b.x, b.y - b.h - 0.4], [x1, top - 0.2], [b.x, top - 3]], D.cream, 0.05, D.grey);
}

function fold(st: Stitcher, b: Building): void {
  // Wattle hurdles: stakes and woven withies.
  const x0 = b.x - b.w / 2;
  const x1 = b.x + b.w / 2;
  const y0 = b.y - 6;
  const y1 = b.y + 7;
  for (const [ya, yb] of [
    [y0, y0 + 4.2],
    [y1 - 4.2, y1],
  ]) {
    for (let x = x0; x <= x1 + 0.1; x += 3.2) st.stem([[x, ya - 0.8], [x, yb + 0.6]], D.walnutDark, 0.8, 0.8);
    for (let k = 0; k < 4; k++) {
      const yy = ya + 0.6 + k * 1;
      const pts: Pt[] = [];
      for (let x = x0; x <= x1; x += 1.6) pts.push([x, yy + (Math.floor((x - x0) / 1.6 + k) % 2 ? 0.25 : -0.25)]);
      st.split(pts, D.walnutPale, 0.8, 0.8);
    }
  }
  for (const x of [x0, x1]) st.stem([[x, y0], [x, y1]], D.walnut, 0.9);
}

function hut(st: Stitcher, b: Building, v: Variant): void {
  cottage(st, b, v, { wall: D.walnutPale });
}

export function drawBuilding(st: Stitcher, b: Building, v: Variant): void {
  switch (b.kind) {
    case "church":
      return church(st, b, v);
    case "mill":
      return mill(st, b, v);
    case "alehouse":
      return alehouse(st, b, v);
    case "bakehouse":
      return bakehouse(st, b, v);
    case "smithy":
      return smithy(st, b, v);
    case "manor":
      return manor(st, b, v);
    case "barn":
      return barn(st, b, v);
    case "dovecote":
      return dovecote(st, b, v);
    case "fold":
      return fold(st, b);
    case "hut":
      return hut(st, b, v);
    case "priesthouse":
      return cottage(st, b, v, { wall: D.grey, roof: "stone" });
    default:
      return cottage(st, b, v, { wall: b.id.charCodeAt(b.id.length - 1) % 2 ? D.cream : D.walnutPale });
  }
}

/** The underdrawing of a house not yet built, in the unfinished linen. */
export function underdrawHouse(st: Stitcher, b: Building): void {
  const x0 = b.x - b.w / 2;
  const x1 = b.x + b.w / 2;
  const wallTop = b.y - b.h * 0.5;
  const ridge = b.y - b.h;
  st.ink([[x0, b.y], [x0, wallTop], [x1, wallTop], [x1, b.y]], 0.6);
  st.ink([[x0 - 1.4, wallTop + 0.4], [b.x - b.w * 0.18, ridge], [b.x + b.w * 0.18, ridge], [x1 + 1.4, wallTop + 0.4]], 0.6);
  st.ink([[b.doorX - b.w * 0.2, b.y], [b.doorX - b.w * 0.2, wallTop + 3.4], [b.doorX, wallTop + 1.4], [b.doorX + b.w * 0.2, wallTop + 3.4], [b.doorX + b.w * 0.2, b.y]], 0.45);
  // Thatch marked out in a few strokes.
  for (let k = 1; k <= 2; k++) st.ink([[x0 - 1 + k * 2, wallTop - k * 2.2], [x1 + 1 - k * 2, wallTop - k * 2.2]], 0.3);
}

// ---------------------------------------------------------------------------
// Borders
// ---------------------------------------------------------------------------

function borders(st: Stitcher, x0: number, x1: number): void {
  const end = Math.min(x1, FRONTIER_X + 40);
  if (x0 < end) {
    const a = Math.max(x0, 0.6);
    const flat = (y: number) => linePts(a, end, () => y, 1.2, a <= 0.6 ? 0 : 3);
    // Upper border: a double rule, walnut over madder.
    st.stem(flat(1.3), D.walnut, 1.05);
    st.stem(flat(11.9), D.madder, 1.05);
    st.running(flat(12.7), D.weld, 0.7, 0.8, 0.6);
    // Lower border.
    st.running(flat(87.3), D.weld, 0.7, 0.8, 0.6);
    st.stem(flat(88.1), D.madder, 1.05);
    st.stem(flat(98.8), D.walnut, 1.05);
  }
  // Into the unfinished: the rules run on as running stitch, then as ink.
  if (x1 > FRONTIER_X + 40) {
    const a = Math.max(x0, FRONTIER_X + 40);
    const b = Math.min(x1, FRONTIER_X + 70);
    if (b > a) {
      for (const y of [1.3, 11.9, 88.1, 98.8]) st.running([[a, y], [b, y]], y < 50 ? D.walnut : D.madder, 0.8, 1.6, 0.8);
    }
    const c = Math.max(x0, FRONTIER_X + 70);
    const d = Math.min(x1, ROLLER_X - 4);
    if (d > c) for (const y of [1.3, 11.9, 88.1, 98.8]) st.ink([[c, y], [d, y]], 0.3);
  }
  // Small ornaments on the rules: knots at intervals, sprigs in the lower border margins.
  for (let x = Math.ceil(x0 / 14) * 14; x < Math.min(x1, FRONTIER_X + 30); x += 14) {
    st.knot(x, 1.3, D.weld, 0.8);
    st.knot(x + 7, 98.8, D.weld, 0.8);
  }
}

// ---------------------------------------------------------------------------
// The ground, the road, the hills
// ---------------------------------------------------------------------------

function ground(st: Stitcher, x0: number, x1: number, v: Variant): void {
  const rng = new Rng(Math.floor(x0) * 17 + 3);
  const end = Math.min(x1, FRONTIER_X + 20);
  const a = Math.max(x0 - 1, 0);
  if (end > a) {
    // Far hills.
    st.stem(linePts(a, end, hillY), D.sage, 1.1);
    // Contour hatching on the hills, sparse.
    for (let x = Math.ceil(a / 17) * 17; x < end; x += 17) {
      if (hash01(x, 9) < 0.45) continue;
      const pts = linePts(x - 3, x + 3, (xx) => hillY(xx) + 2.2, 1.5);
      st.running(pts, D.sage, 0.8, 1, 0.55);
    }
    // Distant strip-fields laid on the hills over the village and fields.
    for (let x = Math.ceil(a / 61) * 61; x < end; x += 61) {
      if (x < 240 || hash01(x, 5) < 0.35) continue;
      const w = 9 + hash01(x, 5) * 8;
      const top = linePts(x, x + w, (xx) => hillY(xx) + 1.2, 1);
      const bottom = linePts(x, x + w, (xx) => hillY(xx) + 3.2, 1).reverse();
      st.couched([...top, ...bottom], hash01(x, 6) < 0.5 ? D.sage : D.walnutPale, 0.03, D.sageDark, 0.44, 2.2);
    }
    // Along the skyline: small trees, now and then a far spire or a post-mill.
    for (let x = Math.ceil(a / 23) * 23; x < end; x += 23) {
      const k = hash01(x, 31);
      if (k < 0.45 || (x > 860 && x < 960)) continue;
      const tx = x + hash01(x, 32) * 8;
      const ty = hillY(tx) - 0.4;
      const h = 2.6 + hash01(x, 33) * 2.2;
      st.stem([[tx, ty], [tx, ty - h * 0.55]], D.walnut, 0.6, 0.7);
      for (let i = 0; i < 7; i++) {
        const ang = (i / 7) * Math.PI * 2;
        st.knot(tx + Math.cos(ang) * h * 0.32, ty - h * 0.72 + Math.sin(ang) * h * 0.26, i % 2 ? D.sage : D.sageDark, 0.72);
      }
    }
    if (a < 436 && end > 424) {
      // A far village's spire on the hill.
      const sx = 430;
      const sy = hillY(sx);
      st.stem([[sx - 1.4, sy], [sx - 1.4, sy - 4], [sx + 1.4, sy - 4], [sx + 1.4, sy]], D.grey, 0.7, 0.75);
      st.stem([[sx - 1.6, sy - 4], [sx, sy - 9], [sx + 1.6, sy - 4]], D.woadPale, 0.7, 0.75);
    }
    if (a < 1246 && end > 1230) {
      // A post-mill on the rise beyond the manor.
      const mx = 1238;
      const my = hillY(mx);
      st.stem([[mx, my], [mx, my - 4]], D.walnut, 0.6, 0.8);
      st.satin([[mx - 1.3, my - 4], [mx + 1.3, my - 4], [mx + 1.3, my - 7], [mx - 1.3, my - 7]], [D.walnutPale], Math.PI / 2, 0.3);
      for (let i = 0; i < 4; i++) {
        const ang = Math.PI / 4 + (i * Math.PI) / 2;
        st.split([[mx, my - 5.5], [mx + Math.cos(ang) * 5, my - 5.5 + Math.sin(ang) * 5]], D.walnut, 0.6, 0.7);
      }
    }
    // Clouds, as the old hangings draw them: a curl of outline, a few couched threads.
    if (!v.night) {
      for (let x = Math.ceil(a / 97) * 97; x < end; x += 97) {
        if (hash01(x, 41) < 0.4) continue;
        const cx = x + hash01(x, 42) * 30;
        const cy = 20 + hash01(x, 43) * 10;
        const w = 9 + hash01(x, 44) * 8;
        const pts: Pt[] = [];
        for (let i = 0; i <= 24; i++) {
          const t = i / 24;
          const ang = t * Math.PI;
          pts.push([cx - w / 2 + t * w, cy - Math.abs(Math.sin(ang * 3)) * 1.6 - Math.sin(ang) * 1.2]);
        }
        pts.push([cx + w / 2, cy + 0.4]);
        pts.push([cx - w / 2, cy + 0.4]);
        st.running([...pts, pts[0]], D.woadPale, 0.8, 0.35, 0.7);
        st.running([[cx - w / 2 + 1.5, cy - 0.6], [cx + w / 2 - 1.5, cy - 0.6]], D.woadPale, 0.9, 0.9, 0.55);
      }
    }
    // The front ground line, wavy, with grass.
    st.stem(
      linePts(a, end, (x) => 85.8 + Math.sin(x / 6.5) * 0.35),
      D.sage,
      1.05,
    );
    for (let x = a + rng.next() * 3; x < end; x += 2.5 + rng.next() * 4) {
      const y = 85.6;
      for (let k = -1; k <= 1; k++) st.stitch(x, y, x + k * 0.6, y - 1.2 - rng.next() * 0.6, rng.next() < 0.5 ? D.sage : D.sageDark, -1, 0.7);
    }
    // The back line the houses stand on.
    for (const [p, q] of [
      [0, 258],
      [560, 566],
      [712, 1506],
    ] as const) {
      const s0 = Math.max(a, p);
      const s1 = Math.min(end, q);
      if (s1 > s0) st.running(linePts(s0, s1, () => 64.2), D.walnutPale, 0.8, 1.1, 0.6);
    }
    // The road: two faint lines, where it runs through the village.
    const roadA = Math.max(a, 560);
    const roadB = Math.min(end, 1500);
    if (roadB > roadA) {
      // The road: a worn track, stitched in short broken runs.
      for (let x = Math.ceil(roadA / 26) * 26; x < roadB; x += 26) {
        const len = 8 + hash01(x, 21) * 12;
        const from = x + hash01(x, 22) * 6;
        st.running(linePts(from, Math.min(roadB, from + len), (xx) => roadY(xx) + 2.6 + Math.sin(xx / 5) * 0.3, 1), D.walnutPale, 0.9, 1.1, 0.55);
      }
    }
    // Tufts and flowers on the ground between.
    for (let x = a + rng.next() * 6; x < end; x += 6 + rng.next() * 9) {
      const y = 66 + rng.next() * 18;
      if (x > FIELD_X[0][0] - 4 && x < FIELD_X[2][1] + 4 && y > 49 && y < 82) continue;
      if (x > MEADOW.x0 && x < MEADOW.x1 && y > 60) continue;
      if (Math.abs(x - 690) < 22) continue;
      st.stitch(x, y, x - 0.5, y - 1.1, D.sage, -1, 0.65);
      st.stitch(x, y, x + 0.4, y - 1.2, D.sageDark, -1, 0.65);
      if (v.snow) st.knot(x, y - 0.2, D.cream, 0.9);
    }
    // Field hedges between the three fields.
    for (const hx of [FIELD_X[0][0] - 2, FIELD_X[1][0] - 2, FIELD_X[2][0] - 2, FIELD_X[2][1] + 2]) {
      if (hx < a - 2 || hx > end + 2) continue;
      st.stem([[hx + 2.2, 49.5], [hx, 82.5]], D.sageDark, 0.9);
      for (let y = 50; y < 82; y += 1.7) st.knot(hx + 2.2 * (1 - (y - 49.5) / 33) + (rng.next() - 0.5) * 0.8, y, rng.next() < 0.5 ? D.sageDark : D.sage, 0.85);
    }
  }
  // Snow lies on the ground.
  if (v.snow && end > a) {
    for (let x = a; x < end; x += 3 + rng.next() * 4) st.stitch(x, 85.2, x + 2.5, 85.2, D.cream, -1, 0.9);
  }
}

// ---------------------------------------------------------------------------
// The unfinished end
// ---------------------------------------------------------------------------

function unfinished(st: Stitcher, x0: number, x1: number): void {
  const a = Math.max(x0, FRONTIER_X);
  const b = Math.min(x1, ROLLER_X - 2);
  if (b <= a) return;
  // The hills go on only as running stitch, then as ink.
  const r0 = Math.max(a, FRONTIER_X + 20);
  const r1 = Math.min(b, FRONTIER_X + 60);
  if (r1 > r0) st.running(linePts(r0, r1, hillY), D.sage, 0.9, 1.5, 0.9);
  const i0 = Math.max(a, FRONTIER_X + 60);
  if (b > i0) st.ink(linePts(i0, b, hillY), 0.34);
  const g0 = Math.max(a, FRONTIER_X + 20);
  if (b > g0) st.ink(linePts(g0, b, (x) => 85.8 + Math.sin(x / 6.5) * 0.35), 0.3);
  // Sketched figures for work not yet begun: a woman with a pail, a man with a spade.
  const sketch = (x: number, h: number, tool: boolean) => {
    if (x < a - 6 || x > b + 6) return;
    const y = 82;
    st.ink([[x - 1.6, y], [x - 0.6, y - h * 0.42]], 0.5);
    st.ink([[x + 1.6, y], [x + 0.6, y - h * 0.42]], 0.5);
    st.ink([[x - 1.9, y - h * 0.4], [x - 1.2, y - h * 0.8], [x + 1.2, y - h * 0.8], [x + 1.9, y - h * 0.4], [x - 1.9, y - h * 0.4]], 0.5);
    st.ink([...ellipse(x + 0.4, y - h * 0.9, 1.2, 1.3, 12)], 0.5, false);
    if (tool) st.ink([[x + 2.4, y - h * 0.75], [x + 3.4, y + 0.5]], 0.5);
  };
  sketch(1640, 12, true);
  sketch(1600, 11.5, false);
  // Half-worked: the outline of a tree stitched, its crown only drawn.
  if (a < 1575 && b > 1560) {
    st.stem([[1566, 64], [1566.6, 54]], D.walnut, 0.9, 0.9);
    st.ink(ellipse(1567, 49, 6, 5.5, 20), 0.35, false);
  }
  // Where the finished work stops, a few thread ends are left hanging.
  const rng = new Rng(4404);
  for (const [x, y, wool] of [
    [FRONTIER_X + 60, hillY(FRONTIER_X + 60), D.sage],
    [FRONTIER_X + 20, 85.8, D.sage],
    [FRONTIER_X + 70, 11.9, D.madder],
    [FRONTIER_X + 70, 88.1, D.madder],
  ] as const) {
    if (x < a - 6 || x > b + 6) continue;
    const pts: Pt[] = [[x, y]];
    let px = x;
    let py = y;
    for (let i = 0; i < 5; i++) {
      px += 0.8 + rng.next() * 0.6;
      py += 0.5 + rng.next() * 0.9;
      pts.push([px, py]);
    }
    st.split(pts, wool, 0.6, 0.75);
  }
}

/** The roller the unworked linen is still wound on. */
function roller(st: Stitcher, x0: number, x1: number, v: Variant): void {
  if (x1 < ROLLER_X - 6 || x0 > CLOTH_LENGTH + 4) return;
  const g = st.g;
  g.setTransform(1, 0, 0, 1, 0, 0);
  const X = st.X(ROLLER_X);
  const W = (CLOTH_LENGTH - ROLLER_X + 4) * st.px;
  const top = st.Y(-3);
  const bottom = st.Y(BAND.bottom + 3);
  // The wound linen.
  const grad = g.createLinearGradient(X, 0, X + W, 0);
  const lit = v.night ? 0.55 : 1;
  grad.addColorStop(0, `rgba(${Math.round(150 * lit)},${Math.round(142 * lit)},${Math.round(122 * lit)},1)`);
  grad.addColorStop(0.35, `rgba(${Math.round(214 * lit)},${Math.round(206 * lit)},${Math.round(186 * lit)},1)`);
  grad.addColorStop(0.7, `rgba(${Math.round(178 * lit)},${Math.round(170 * lit)},${Math.round(150 * lit)},1)`);
  grad.addColorStop(1, `rgba(${Math.round(110 * lit)},${Math.round(102 * lit)},${Math.round(88 * lit)},1)`);
  g.fillStyle = grad;
  g.fillRect(X, top, W, bottom - top);
  // The turns of cloth on the roll.
  g.strokeStyle = "rgba(90,80,62,0.28)";
  g.lineWidth = Math.max(1, st.px * 0.12);
  for (let i = 1; i < 6; i++) {
    const xx = X + (W * i) / 6;
    g.beginPath();
    g.moveTo(xx, top);
    g.lineTo(xx + st.px * 0.4, bottom);
    g.stroke();
  }
}

// ---------------------------------------------------------------------------
// Night sky
// ---------------------------------------------------------------------------

function nightSky(st: Stitcher, x0: number, x1: number): void {
  const end = Math.min(x1, FRONTIER_X + 50);
  if (end <= x0) return;
  const pts: Pt[] = [[x0 - 1, 13.6], [end + 1, 13.6]];
  for (let x = end + 1; x >= x0 - 1.01; x -= 1.5) pts.push([x, hillY(x) + 0.4]);
  // A laid woad sky, couched in paler woad.
  st.couched(pts, D.woad, 0.03, D.woadPale, 0.44, 2.4);
  // The frontier: the night sky frays out too.
  const rng = new Rng(Math.floor(x0) * 7 + 5);
  for (let x = x0 + rng.next() * 4; x < end; x += 3 + rng.next() * 6) {
    const y = 15 + rng.next() * (hillY(x) - 17);
    st.knot(x, y, rng.next() < 0.8 ? D.cream : D.weld, 0.55 + rng.next() * 0.35);
  }
}

// ---------------------------------------------------------------------------
// The whole tile
// ---------------------------------------------------------------------------

/** Draw the linen ground for a region: the weave, the hang of the cloth, its hems. */
export function linen(st: Stitcher, x0: number, x1: number, back: boolean): void {
  const g = st.g;
  const set = st.set;
  g.setTransform(1, 0, 0, 1, 0, 0);
  const pat = g.createPattern((back ? set.linenBack : set.linen) as CanvasImageSource, "repeat");
  if (!pat) return;
  const tilePx = set.linenU * st.px;
  const offX = -(((st.ox * st.px) % tilePx) + tilePx) % tilePx;
  const offY = -(((st.oy * st.px) % tilePx) + tilePx) % tilePx;
  pat.setTransform(new DOMMatrix([1, 0, 0, 1, offX, offY]));
  g.fillStyle = pat;
  const top = st.Y(0);
  const bottom = st.Y(BAND.bottom);
  const L = st.X(Math.max(0, x0 - 1));
  const R = st.X(Math.min(ROLLER_X, x1 + 1));
  g.fillRect(L, top, R - L, bottom - top);
  // The linen's own unevenness: blotches of lighter and darker flax.
  for (let x = Math.floor(x0 / 7) * 7; x < x1 + 7; x += 7) {
    for (let y = 1; y < BAND.bottom; y += 7) {
      const k = hash01(x, y, 5);
      if (k < 0.35) continue;
      const cx = st.X(x + hash01(x, y, 6) * 7);
      const cy = st.Y(y + hash01(x, y, 7) * 7);
      const r = (3 + hash01(x, y, 8) * 6) * st.px;
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      const light = hash01(x, y, 9) < 0.5;
      grad.addColorStop(0, light ? "rgba(255,250,236,0.07)" : "rgba(70,58,38,0.06)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  }
  // The hang of the cloth: long soft folds, lighter and darker.
  for (let x = Math.floor(x0 / 23) * 23; x < x1 + 23; x += 23) {
    const k = hash01(x, 11);
    const w = (8 + k * 12) * st.px;
    const cx = st.X(x + hash01(x, 12) * 10);
    const grad = g.createLinearGradient(cx - w, 0, cx + w, 0);
    const a = 0.035 + k * 0.05;
    grad.addColorStop(0, "rgba(60,48,30,0)");
    grad.addColorStop(0.45, `rgba(60,48,30,${a})`);
    grad.addColorStop(0.55, `rgba(255,248,230,${a * 0.7})`);
    grad.addColorStop(1, "rgba(255,248,230,0)");
    g.fillStyle = grad;
    g.fillRect(Math.max(L, cx - w), top, Math.min(R, cx + w) - Math.max(L, cx - w), bottom - top);
  }
  // Hems: the turned edges, a little darker, with running stitch.
  const hem = (y0: number, y1: number, dark: number) => {
    const grad = g.createLinearGradient(0, st.Y(y0), 0, st.Y(y1));
    grad.addColorStop(0, `rgba(70,58,38,${dark})`);
    grad.addColorStop(1, "rgba(70,58,38,0)");
    g.fillStyle = grad;
    g.fillRect(L, st.Y(y0), R - L, st.Y(y1) - st.Y(y0));
  };
  hem(0, 0.9, 0.22);
  const grad = g.createLinearGradient(0, st.Y(99.1), 0, st.Y(100));
  grad.addColorStop(0, "rgba(70,58,38,0)");
  grad.addColorStop(1, "rgba(70,58,38,0.28)");
  g.fillStyle = grad;
  g.fillRect(L, st.Y(99.1), R - L, st.Y(100) - st.Y(99.1));
  // The left hem, where the hanging begins.
  if (x0 < 3) {
    const gg = g.createLinearGradient(st.X(0), 0, st.X(1.2), 0);
    gg.addColorStop(0, "rgba(70,58,38,0.3)");
    gg.addColorStop(1, "rgba(70,58,38,0)");
    g.fillStyle = gg;
    g.fillRect(st.X(0), top, st.X(1.2) - st.X(0), bottom - top);
  }
}

export function drawTile(st: Stitcher, x0: number, x1: number, v: Variant): void {
  linen(st, x0, x1, false);
  if (v.night) nightSky(st, x0, x1);
  borders(st, x0, x1);
  ground(st, x0, x1, v);
  for (const t of TREES) if (t.x + t.r > x0 - 2 && t.x - t.r < x1 + 2) trunk(st, t, v.snow);
  // Buildings in back-to-front order (the fold and small things last).
  for (const b of BUILDINGS) {
    if (b.x + b.w / 2 + 12 < x0 || b.x - b.w / 2 - 12 > x1) continue;
    if (b.expansion) underdrawHouse(st, b);
    else drawBuilding(st, b, v);
  }
  unfinished(st, x0, x1);
  roller(st, x0, x1, v);
  st.reset();
}

/** The back of the cloth: ghostly outlines only, mirrored, over darker linen. */
export function drawBackTile(st: Stitcher, x0: number, x1: number): void {
  linen(st, x0, x1, true);
  st.back = true;
  st.fade = 0.42;
  borders(st, x0, x1);
  const v = { night: false, snow: false };
  ground(st, x0, x1, v);
  for (const t of TREES) if (t.x + t.r > x0 - 2 && t.x - t.r < x1 + 2) trunk(st, t, false);
  for (const b of BUILDINGS) {
    if (b.expansion || b.x + b.w / 2 + 12 < x0 || b.x - b.w / 2 - 12 > x1) continue;
    drawBuilding(st, b, v);
  }
  st.back = false;
  st.fade = 1;
  st.reset();
}
