/**
 * The stitch vocabulary, drawn stitch by stitch from strand sprites:
 * stem stitch for outlines, split and running stitch for fine lines, satin
 * stitch for water and small shapes, laid-and-couched work for fills,
 * French knots, and seed stitch. All coordinates are cloth units.
 */
import { Rng } from "../sim/rng";
import { BUCKETS, VARIANTS, type Canvas2D, type StrandSet } from "./strand";

export type Pt = [number, number];
export type Poly = Pt[];

export class Stitcher {
  readonly g: Canvas2D;
  readonly set: StrandSet;
  /** Device px per cloth unit. */
  readonly px: number;
  readonly ox: number;
  readonly oy: number;
  rng: Rng;
  /** Stitches drawn (for budgets and tests). */
  count = 0;
  /** Reverse side: stitches show as short stubs and the traveling thread between them. */
  back = false;
  /** Thinner, fainter thread (the old, faded, or underdrawn). */
  fade = 1;
  /** Only stitches touching this rectangle (cloth units) are drawn; the random sequence still advances, so a cell matches its tile. */
  cull: [number, number, number, number] | null = null;

  constructor(g: Canvas2D, set: StrandSet, px: number, ox: number, oy: number, seed: number) {
    this.g = g;
    this.set = set;
    this.px = px;
    this.ox = ox;
    this.oy = oy;
    this.rng = new Rng(seed);
  }

  X(x: number): number {
    return (x - this.ox) * this.px;
  }
  Y(y: number): number {
    return (y - this.oy) * this.px;
  }

  /** One stitch from (x0,y0) to (x1,y1). */
  stitch(x0: number, y0: number, x1: number, y1: number, wool: number, variant = -1, thick = 1): void {
    const px0 = this.X(x0);
    const py0 = this.Y(y0);
    const px1 = this.X(x1);
    const py1 = this.Y(y1);
    const dx = px1 - px0;
    const dy = py1 - py0;
    const len = Math.hypot(dx, dy);
    if (len < 0.3) return;
    const lenU = len / this.px;
    let b = 0;
    for (let i = 1; i < BUCKETS.length; i++) if (Math.abs(BUCKETS[i] - lenU) < Math.abs(BUCKETS[b] - lenU)) b = i;
    const v = variant >= 0 ? variant : Math.floor(this.rng.next() * VARIANTS);
    const c0 = this.cull;
    if (c0 && (Math.max(x0, x1) < c0[0] - 1 || Math.min(x0, x1) > c0[2] + 1 || Math.max(y0, y1) < c0[1] - 1 || Math.min(y0, y1) > c0[3] + 1)) return;
    const sprite = this.set.sprites[wool][v][b];
    const sw = sprite.width;
    const sh = sprite.height;
    const spriteLen = BUCKETS[b] * this.set.px;
    const sx = len / spriteLen;
    const c = dx / len;
    const s = dy / len;
    const g = this.g;
    const th = thick * (this.back ? 0.7 : 1);
    g.setTransform(c * sx, s * sx, -s * th, c * th, (px0 + px1) / 2, (py0 + py1) / 2);
    if (this.fade !== 1) g.globalAlpha = this.fade;
    g.drawImage(sprite as CanvasImageSource, -sw / 2, -sh / 2);
    if (this.fade !== 1) g.globalAlpha = 1;
    this.count++;
  }

  reset(): void {
    this.g.setTransform(1, 0, 0, 1, 0, 0);
  }

  knot(x: number, y: number, wool: number, scale = 1): void {
    const sprite = this.set.knots[wool][Math.floor(this.rng.next() * VARIANTS)];
    const c0 = this.cull;
    if (c0 && (x < c0[0] - 1 || x > c0[2] + 1 || y < c0[1] - 1 || y > c0[3] + 1)) return;
    const w = sprite.width * scale;
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (this.fade !== 1) g.globalAlpha = this.fade;
    g.drawImage(sprite as CanvasImageSource, this.X(x) - w / 2, this.Y(y) - w / 2, w, w);
    if (this.fade !== 1) g.globalAlpha = 1;
    this.count++;
  }

  /** Stem stitch: overlapping slanted stitches, a twisted rope of wool. */
  stem(pts: Pt[], wool: number, len = 1.05, thick = 1): void {
    if (this.back) {
      // Behind stem stitch runs a line of short back-stitches.
      this.running(pts, wool, len * 0.45, len * 0.12, thick * 0.8);
      return;
    }
    const path = resample(pts, len * 0.48);
    if (path.length < 2) return;
    const step = 2;
    for (let i = 0; i + step < path.length; i += 1) {
      const [x0, y0] = path[i];
      const [x1, y1] = path[Math.min(path.length - 1, i + step)];
      const dx = x1 - x0;
      const dy = y1 - y0;
      const d = Math.hypot(dx, dy) || 1;
      const nx = -dy / d;
      const ny = dx / d;
      const o = 0.09;
      const v = Math.abs(Math.floor(x0 * 7.3 + y0 * 3.1)) % 3;
      this.stitch(x0 - nx * o, y0 - ny * o, x1 + nx * o, y1 + ny * o, wool, v, thick);
    }
  }

  /** Split stitch: short straight stitches in a line, finer than stem. */
  split(pts: Pt[], wool: number, len = 0.7, thick = 0.85): void {
    const path = resample(pts, len);
    for (let i = 0; i + 1 < path.length; i++) this.stitch(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1], wool, -1, thick);
  }

  /** Running stitch: dashes with linen between. */
  running(pts: Pt[], wool: number, len = 0.9, gap = 0.7, thick = 0.8): void {
    const path = resample(pts, (len + gap) / 2);
    for (let i = 0; i + 1 < path.length; i += 2) this.stitch(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1], wool, -1, thick);
  }

  /** Laid threads across a shape, held down by couching stitches. */
  couched(poly: Poly, wool: number, angle: number, couchWool: number, spacing = 0.42, tack = 1.5): void {
    if (this.back) {
      // From behind, laid work shows only the little couching tacks.
      const segs = scan(poly, angle, spacing * 5);
      for (const [x0, y0, x1, y1] of segs) this.running([[x0, y0], [x1, y1]], couchWool, 0.3, tack * 1.4, 0.5);
      return;
    }
    const segs = scan(poly, angle, spacing);
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    let row = 0;
    for (const [x0, y0, x1, y1] of segs) {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.max(1, Math.round(len / 1.8));
      for (let i = 0; i < n; i++) {
        const t0 = i / n;
        const t1 = (i + 1) / n;
        this.stitch(x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0, x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1, wool, row % VARIANTS, 0.92);
      }
      row++;
    }
    // Couching: short stitches across the laid threads, offset row to row.
    const csegs = scan(poly, angle, spacing * 2.6);
    let k = 0;
    for (const [x0, y0, x1, y1] of csegs) {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const off = (k % 2) * tack * 0.5 + this.rng.next() * 0.2;
      for (let d = off + 0.3; d < len - 0.2; d += tack) {
        const cx = x0 + ca * d;
        const cy = y0 + sa * d;
        this.stitch(cx + sa * 0.36, cy - ca * 0.36, cx - sa * 0.36, cy + ca * 0.36, couchWool, -1, 0.55);
      }
      k++;
    }
  }

  /** Satin stitch: close parallel stitches spanning the shape. */
  satin(poly: Poly, wools: number[], angle: number, spacing = 0.28, maxLen = 3.2): void {
    if (this.back) {
      this.split([...poly, poly[0]], wools[0], 0.8, 0.6);
      return;
    }
    const segs = scan(poly, angle, spacing);
    let i = 0;
    for (const [x0, y0, x1, y1] of segs) {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.max(1, Math.ceil(len / maxLen));
      const wool = wools[Math.floor(this.rng.next() * wools.length * 0.999)];
      for (let j = 0; j < n; j++) {
        // Long-and-short: stagger the joins so no seam shows.
        const stag = n > 1 ? ((i % 2) * 0.5) / n : 0;
        const t0 = Math.max(0, j / n - (j > 0 ? stag : 0));
        const t1 = Math.min(1, (j + 1) / n - (j + 1 < n ? stag : 0));
        this.stitch(x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0, x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1, wool, -1, 0.88);
      }
      i++;
    }
  }

  /** Seed stitch: small stitches scattered inside a shape. */
  seed(poly: Poly, wool: number, density = 0.4, len = 0.5): void {
    if (this.back) return;
    const [minX, minY, maxX, maxY] = bounds(poly);
    const n = Math.round((maxX - minX) * (maxY - minY) * density);
    for (let i = 0; i < n; i++) {
      const x = minX + this.rng.next() * (maxX - minX);
      const y = minY + this.rng.next() * (maxY - minY);
      if (!inside(poly, x, y)) continue;
      const a = this.rng.next() * Math.PI;
      this.stitch(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, wool, -1, 0.8);
    }
  }

  /** A soft darkening of the linen where dense work pulls it (puckering). */
  pucker(poly: Poly, strength = 0.14): void {
    if (this.back) return;
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.save();
    g.beginPath();
    poly.forEach(([x, y], i) => (i ? g.lineTo(this.X(x), this.Y(y)) : g.moveTo(this.X(x), this.Y(y))));
    g.closePath();
    g.shadowColor = `rgba(58,46,30,${strength})`;
    g.shadowBlur = Math.max(2, this.px * 1.1);
    g.fillStyle = `rgba(58,46,30,${strength * 0.6})`;
    g.fill();
    g.restore();
  }

  /** Laid fill with a stem outline, the common way to make a solid shape. */
  shape(poly: Poly, fill: number, outline: number, angle: number, couch = -1): void {
    this.pucker(poly);
    this.couched(poly, fill, angle, couch >= 0 ? couch : fill, 0.42, 1.5);
    this.stem([...poly, poly[0]], outline);
  }

  /** Faint drawn underdrawing (ink on linen, not wool), for the unfinished linen. */
  ink(pts: Pt[], alpha = 0.45, dash = true): void {
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.save();
    g.strokeStyle = `rgba(84,62,42,${alpha})`;
    g.lineWidth = Math.max(0.8, this.px * 0.12);
    g.lineCap = "round";
    if (dash) g.setLineDash([this.px * 0.8, this.px * 0.35]);
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(this.X(x), this.Y(y)) : g.moveTo(this.X(x), this.Y(y))));
    g.stroke();
    g.restore();
  }
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export function resample(pts: Pt[], step: number): Pt[] {
  if (pts.length < 2) return pts.slice();
  const out: Pt[] = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const seg = Math.hypot(bx - ax, by - ay);
    let d = step - carry;
    while (d <= seg) {
      const t = d / seg;
      out.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
      d += step;
    }
    carry = seg - (d - step);
  }
  const last = pts[pts.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > step * 0.3) out.push(last);
  return out;
}

export function bounds(poly: Poly): [number, number, number, number] {
  let a = Infinity;
  let b = Infinity;
  let c = -Infinity;
  let d = -Infinity;
  for (const [x, y] of poly) {
    if (x < a) a = x;
    if (y < b) b = y;
    if (x > c) c = x;
    if (y > d) d = y;
  }
  return [a, b, c, d];
}

export function inside(poly: Poly, x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Parallel lines across a polygon at an angle: [x0,y0,x1,y1][] in cloth units. */
export function scan(poly: Poly, angle: number, spacing: number): [number, number, number, number][] {
  const c = Math.cos(-angle);
  const s = Math.sin(-angle);
  const rot = poly.map(([x, y]) => [x * c - y * s, x * s + y * c] as Pt);
  const [, minY, , maxY] = bounds(rot);
  const out: [number, number, number, number][] = [];
  const ci = Math.cos(angle);
  const si = Math.sin(angle);
  for (let y = minY + spacing * 0.5; y < maxY; y += spacing) {
    const xs: number[] = [];
    for (let i = 0, j = rot.length - 1; i < rot.length; j = i++) {
      const [xi, yi] = rot[i];
      const [xj, yj] = rot[j];
      if (yi > y !== yj > y) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a0 = xs[k];
      const a1 = xs[k + 1];
      if (a1 - a0 < 0.12) continue;
      out.push([a0 * ci - y * si, a0 * si + y * ci, a1 * ci - y * si, a1 * si + y * ci]);
    }
  }
  return out;
}

/** An ellipse as a polygon. */
export function ellipse(cx: number, cy: number, rx: number, ry: number, n = 24, a0 = 0, a1 = Math.PI * 2): Poly {
  const out: Poly = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

/** A wobbly blob (a tree crown, a bush). */
export function blob(cx: number, cy: number, rx: number, ry: number, rng: Rng, lobes = 7, wobble = 0.18): Poly {
  const out: Poly = [];
  const n = lobes * 4;
  const ph = rng.next() * 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 1 + Math.sin(a * lobes + ph) * wobble + (rng.next() - 0.5) * 0.05;
    out.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]);
  }
  return out;
}

export function offsetPoly(pts: Pt[], d: number): Pt[] {
  return pts.map(([x, y]) => [x, y + d]);
}
