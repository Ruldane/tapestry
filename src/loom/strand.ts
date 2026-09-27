/**
 * Wool and linen as pixels: pre-drawn strand sprites (a two-ply wool
 * stitch with its twist, sheen, fuzz and the small shadow it casts on the
 * linen), French knots, the linen weave, and laid-and-couched fill patterns.
 * Everything is drawn once per scale and reused thousands of times.
 *
 * Works on the main thread and in a worker (OffscreenCanvas).
 */
import { LINEN, WOOLS, mix, shade } from "./palette";
import { Rng } from "../sim/rng";

export type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export function makeCanvas(w: number, h: number): AnyCanvas {
  const W = Math.max(1, Math.ceil(w));
  const H = Math.max(1, Math.ceil(h));
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(W, H);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  return c;
}

export function ctx2d(c: AnyCanvas): Canvas2D {
  const g = c.getContext("2d") as Canvas2D | null;
  if (!g) throw new Error("2d context unavailable");
  return g;
}

/** Strand lengths prepared, in cloth units. */
export const BUCKETS = [0.55, 1.1, 1.9, 3.2] as const;
export const VARIANTS = 3;
/** Wool thickness, in cloth units. */
export const WOOL = 0.46;

export interface StrandSet {
  /** px per cloth unit these sprites were drawn for. */
  px: number;
  /** [wool][variant][bucket] */
  sprites: AnyCanvas[][][];
  knots: AnyCanvas[][];
  /** Laid-and-couched fill pattern tiles, [wool]. */
  couch: AnyCanvas[];
  /** Satin fill pattern tiles, [wool]. */
  satin: AnyCanvas[];
  linen: AnyCanvas;
  linenBack: AnyCanvas;
  /** Size of the linen tile in cloth units. */
  linenU: number;
  thick: number;
}

function capsule(g: Canvas2D, x0: number, x1: number, cy: number, r: number): void {
  g.beginPath();
  g.moveTo(x0, cy - r);
  g.lineTo(x1, cy - r);
  g.arc(x1, cy, r, -Math.PI / 2, Math.PI / 2);
  g.lineTo(x0, cy + r);
  g.arc(x0, cy, r, Math.PI / 2, (Math.PI * 3) / 2);
  g.closePath();
}

function strandSprite(px: number, wool: number, variant: number, lenU: number, rng: Rng): AnyCanvas {
  const w = WOOLS[wool];
  const T = Math.max(2.2, WOOL * px);
  const L = Math.max(T * 0.9, lenU * px);
  const pad = T * 0.9;
  const W = L + pad * 2;
  const H = T * 2.3;
  const c = makeCanvas(W, H);
  const g = ctx2d(c);
  const cy = H / 2;
  const x0 = pad;
  const x1 = pad + L;
  const r = T / 2;
  const tone = (variant - 1) * 0.16 + (rng.next() - 0.5) * 0.08;
  const mid = shade(w, tone);
  const light = mix(w.light, "#fff6e6", 0.12 + Math.max(0, tone) * 0.4);
  const dark = shade(w, tone - 0.95);

  // The shadow the raised wool casts on the linen.
  g.fillStyle = "rgba(52,40,26,0.26)";
  capsule(g, x0 + T * 0.18, x1 + T * 0.18, cy + T * 0.3, r * 1.08);
  g.fill();

  // The body, rounded by light from above-left.
  const grad = g.createLinearGradient(0, cy - r, 0, cy + r);
  grad.addColorStop(0, dark);
  grad.addColorStop(0.2, mid);
  grad.addColorStop(0.4, light);
  grad.addColorStop(0.62, mid);
  grad.addColorStop(1, dark);
  g.fillStyle = grad;
  capsule(g, x0, x1, cy, r);
  g.fill();

  // The twist of the plies.
  g.save();
  capsule(g, x0, x1, cy, r);
  g.clip();
  const pitch = T * 0.78;
  g.lineCap = "round";
  for (let x = x0 - T; x < x1 + T; x += pitch) {
    g.strokeStyle = `rgba(30,20,12,${0.22 + rng.next() * 0.1})`;
    g.lineWidth = Math.max(0.6, T * 0.14);
    g.beginPath();
    g.moveTo(x, cy - r);
    g.lineTo(x + T * 0.62, cy + r);
    g.stroke();
    g.strokeStyle = `rgba(255,248,232,${0.12 + rng.next() * 0.1})`;
    g.lineWidth = Math.max(0.5, T * 0.1);
    g.beginPath();
    g.moveTo(x + T * 0.22, cy - r);
    g.lineTo(x + T * 0.84, cy + r);
    g.stroke();
  }
  // Where the strand goes into the cloth, it darkens.
  for (const ex of [x0, x1]) {
    const eg = g.createRadialGradient(ex, cy, 0, ex, cy, T * 0.9);
    eg.addColorStop(0, "rgba(28,18,10,0.35)");
    eg.addColorStop(1, "rgba(28,18,10,0)");
    g.fillStyle = eg;
    g.fillRect(ex - T, cy - T, T * 2, T * 2);
  }
  g.restore();

  // Loose fibres.
  const fibres = 3 + Math.floor(L / T);
  g.strokeStyle = mix(w.light, "#ffffff", 0.2);
  g.lineWidth = Math.max(0.4, T * 0.07);
  for (let i = 0; i < fibres; i++) {
    const fx = x0 + rng.next() * L;
    const side = rng.next() < 0.5 ? -1 : 1;
    g.globalAlpha = 0.25 + rng.next() * 0.25;
    g.beginPath();
    g.moveTo(fx, cy + side * r * 0.7);
    g.quadraticCurveTo(fx + T * 0.3, cy + side * r * 1.2, fx + T * (0.4 + rng.next() * 0.5), cy + side * r * (1.35 + rng.next() * 0.4));
    g.stroke();
  }
  g.globalAlpha = 1;
  return c;
}

function knotSprite(px: number, wool: number, variant: number, rng: Rng): AnyCanvas {
  const w = WOOLS[wool];
  const R = Math.max(1.6, 0.46 * px);
  const S = R * 3;
  const c = makeCanvas(S, S);
  const g = ctx2d(c);
  const cx = S / 2;
  const cy = S / 2;
  const tone = (variant - 1) * 0.16;
  g.fillStyle = "rgba(52,40,26,0.3)";
  g.beginPath();
  g.arc(cx + R * 0.22, cy + R * 0.3, R * 1.02, 0, Math.PI * 2);
  g.fill();
  const grad = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
  grad.addColorStop(0, mix(w.light, "#fff8ea", 0.2));
  grad.addColorStop(0.45, shade(w, tone));
  grad.addColorStop(1, shade(w, tone - 0.9));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fill();
  // The wrap of the knot.
  g.strokeStyle = "rgba(30,20,12,0.3)";
  g.lineWidth = Math.max(0.5, R * 0.16);
  g.beginPath();
  g.arc(cx + R * 0.05, cy + R * 0.05, R * 0.55, rng.next() * 6, rng.next() * 6 + 3.6);
  g.stroke();
  return c;
}

/** Plain-weave linen: warp and weft, slubs, the odd thick thread. */
function linenTile(px: number, sizeU: number, back: boolean, rng: Rng): AnyCanvas {
  const S = Math.max(8, Math.round(sizeU * px));
  const c = makeCanvas(S, S);
  const g = ctx2d(c);
  g.fillStyle = back ? LINEN.back : LINEN.base;
  g.fillRect(0, 0, S, S);
  const threadsPerU = px >= 16 ? 5.2 : px >= 9 ? 3.4 : 2.4;
  const pitch = px / threadsPerU;
  const n = Math.max(4, Math.round(S / pitch));
  const p = S / n;
  // Weft (horizontal) under, warp (vertical) over, alternating.
  for (let row = 0; row < n; row++) {
    const y = row * p;
    const thick = 0.6 + rng.next() * 0.2;
    g.fillStyle = mix(LINEN.weft, LINEN.shadow, 0.1 + rng.next() * 0.18);
    g.fillRect(0, y + p * (0.5 - thick / 2), S, p * thick);
  }
  for (let col = 0; col < n; col++) {
    const x = col * p;
    const thick = 0.55 + rng.next() * 0.2;
    const tone = 0.3 + rng.next() * 0.4;
    for (let row = 0; row < n; row++) {
      if ((row + col) % 2 === 0) continue;
      const y = row * p;
      g.fillStyle = mix(LINEN.warp, LINEN.slub, tone * 0.5 + rng.next() * 0.2);
      g.fillRect(x + p * (0.5 - thick / 2), y - p * 0.1, p * thick, p * 1.2);
      // Each crossing is a little rounded: a highlight and a shadow.
      if (p > 2.5) {
        g.fillStyle = "rgba(255,250,238,0.18)";
        g.fillRect(x + p * (0.5 - thick / 2), y, p * thick * 0.4, p);
        g.fillStyle = "rgba(70,60,40,0.12)";
        g.fillRect(x + p * (0.5 + thick / 4), y, p * thick * 0.25, p);
      }
    }
  }
  // Slubs: short thick lighter runs.
  const slubs = Math.round(n * 0.35);
  for (let i = 0; i < slubs; i++) {
    const horiz = rng.next() < 0.5;
    const x = rng.next() * S;
    const y = rng.next() * S;
    const len = p * (3 + rng.next() * 8);
    g.fillStyle = `rgba(232,226,210,${0.35 + rng.next() * 0.3})`;
    if (horiz) g.fillRect(x, y, len, p * 0.7);
    else g.fillRect(x, y, p * 0.7, len);
  }
  // Specks of flax.
  for (let i = 0; i < n * 2; i++) {
    g.fillStyle = `rgba(90,74,50,${0.08 + rng.next() * 0.12})`;
    g.fillRect(rng.next() * S, rng.next() * S, Math.max(0.6, p * 0.35), Math.max(0.6, p * 0.35));
  }
  return c;
}

/** A small tile of laid threads held by couching, for pattern fills. */
function couchTile(px: number, wool: number, rng: Rng): AnyCanvas {
  const w = WOOLS[wool];
  const lay = Math.max(2, 0.36 * px);
  const period = Math.max(6, 1.5 * px);
  const rows = 2;
  const c = makeCanvas(period * 2, lay * rows);
  const g = ctx2d(c);
  const W = period * 2;
  for (let r = 0; r < rows; r++) {
    const y = r * lay;
    const tone = (rng.next() - 0.5) * 0.3;
    const grad = g.createLinearGradient(0, y, 0, y + lay);
    grad.addColorStop(0, shade(w, tone - 0.7));
    grad.addColorStop(0.35, mix(shade(w, tone + 0.2), w.light, 0.3));
    grad.addColorStop(0.7, shade(w, tone));
    grad.addColorStop(1, shade(w, tone - 0.8));
    g.fillStyle = grad;
    g.fillRect(0, y, W, lay);
    // A little twist on the laid strand.
    g.strokeStyle = "rgba(30,20,12,0.12)";
    g.lineWidth = Math.max(0.5, lay * 0.12);
    for (let x = 0; x < W; x += lay * 0.8) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + lay * 0.5, y + lay);
      g.stroke();
    }
    // Couching tacks, offset row to row.
    const off = r % 2 === 0 ? 0 : period / 2;
    for (let x = off; x < W + period; x += period) {
      g.fillStyle = shade(w, -1);
      g.fillRect(x - lay * 0.16, y - lay * 0.1, lay * 0.32, lay * 1.2);
      g.fillStyle = "rgba(255,245,225,0.18)";
      g.fillRect(x - lay * 0.16, y, lay * 0.1, lay);
    }
  }
  return c;
}

function satinTile(px: number, wool: number, rng: Rng): AnyCanvas {
  const w = WOOLS[wool];
  const pitch = Math.max(1.6, 0.3 * px);
  const n = 6;
  const c = makeCanvas(pitch * n, Math.max(8, px * 2));
  const g = ctx2d(c);
  const H = c.height;
  for (let i = 0; i < n; i++) {
    const x = i * pitch;
    const tone = (rng.next() - 0.5) * 0.4;
    const grad = g.createLinearGradient(x, 0, x + pitch, 0);
    grad.addColorStop(0, shade(w, tone - 0.8));
    grad.addColorStop(0.45, mix(shade(w, tone + 0.3), w.light, 0.35));
    grad.addColorStop(1, shade(w, tone - 0.7));
    g.fillStyle = grad;
    g.fillRect(x, 0, pitch, H);
  }
  return c;
}

const cache = new Map<number, StrandSet>();

/** Strands, knots and patterns for a given px-per-unit (rounded). */
export function strands(pxPerUnit: number): StrandSet {
  const px = Math.round(pxPerUnit * 4) / 4;
  const hit = cache.get(px);
  if (hit) return hit;
  const rng = new Rng(1382);
  const sprites = WOOLS.map((_, wi) => Array.from({ length: VARIANTS }, (_, v) => BUCKETS.map((b) => strandSprite(px, wi, v, b, rng))));
  const knots = WOOLS.map((_, wi) => Array.from({ length: VARIANTS }, (_, v) => knotSprite(px, wi, v, rng)));
  const couch = WOOLS.map((_, wi) => couchTile(px, wi, rng));
  const satin = WOOLS.map((_, wi) => satinTile(px, wi, rng));
  const linenU = px >= 12 ? 26 : 40;
  const set: StrandSet = {
    px,
    sprites,
    knots,
    couch,
    satin,
    linen: linenTile(px, linenU, false, rng),
    linenBack: linenTile(px, linenU, true, rng),
    linenU,
    thick: WOOL,
  };
  cache.set(px, set);
  if (cache.size > 4) {
    const first = cache.keys().next().value;
    if (first !== undefined && first !== px) cache.delete(first);
  }
  return set;
}
