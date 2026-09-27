/**
 * What moves in the air and the light: night falling on the hall and the
 * rushlights in doorways, rain as falling running-stitches, snow, falling
 * stars, the mill wheel turning with the river, the church bell swinging.
 * All drawn in cloth units on a context already transformed to them.
 */
import { BUILDING, RIVER_X } from "../sim/geography";
import { hillY } from "./scenery";
import { WOOLS, D } from "./palette";

type G = CanvasRenderingContext2D;

export interface Light {
  x: number;
  y: number;
  r: number;
  strength: number;
  warm: boolean;
}

/** Night on the cloth: dim it, then let the lights through. */
export function nightLight(g: G, x0: number, x1: number, y0: number, y1: number, night: number, lights: Light[], t: number): void {
  if (night <= 0.01) return;
  g.save();
  g.globalCompositeOperation = "multiply";
  g.fillStyle = `rgba(${Math.round(255 - 200 * night)},${Math.round(255 - 190 * night)},${Math.round(255 - 150 * night)},1)`;
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  g.globalCompositeOperation = "screen";
  for (const l of lights) {
    if (l.x + l.r < x0 || l.x - l.r > x1) continue;
    const flick = 0.85 + Math.sin(t / 130 + l.x) * 0.08 + Math.sin(t / 47 + l.x * 3) * 0.05;
    const a = l.strength * night * flick;
    const grad = g.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
    grad.addColorStop(0, l.warm ? `rgba(255,190,90,${a * 0.55})` : `rgba(200,210,255,${a * 0.3})`);
    grad.addColorStop(0.4, l.warm ? `rgba(220,140,60,${a * 0.22})` : `rgba(160,170,220,${a * 0.1})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
  }
  g.restore();
}

/** A rushlight: a little stitched flame on a holder. */
export function rushlight(g: G, x: number, y: number, t: number): void {
  const f = 1 + Math.sin(t / 90 + x) * 0.12;
  g.strokeStyle = WOOLS[D.walnutDark].mid;
  g.lineWidth = 0.2;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x, y - 1.6);
  g.stroke();
  g.fillStyle = WOOLS[D.weld].light;
  g.beginPath();
  g.ellipse(x, y - 2.1 * f, 0.34, 0.6 * f, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = WOOLS[D.madder].light;
  g.beginPath();
  g.ellipse(x, y - 1.9, 0.18, 0.3, 0, 0, Math.PI * 2);
  g.fill();
}

// ---------------------------------------------------------------------------
// Rain and snow
// ---------------------------------------------------------------------------

const RAIN_SEEDS = Array.from({ length: 260 }, (_, i) => [((i * 7919) % 997) / 997, ((i * 104729) % 991) / 991, ((i * 31) % 17) / 17]);

export function rain(g: G, x0: number, x1: number, intensity: number, t: number, storm: boolean, tier: number): void {
  if (intensity < 0.05) return;
  const n = Math.round(RAIN_SEEDS.length * Math.min(1, intensity) * (tier >= 2 ? 0.35 : tier === 1 ? 0.6 : 1));
  const w = x1 - x0;
  const slant = storm ? 0.55 : 0.3;
  g.save();
  g.lineCap = "round";
  g.strokeStyle = WOOLS[D.woadPale].mid;
  g.lineWidth = 0.22;
  g.setLineDash([0.8, 0.55]);
  g.globalAlpha = 0.75;
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const [a, b, c] = RAIN_SEEDS[i];
    const fall = 38 + c * 18;
    const y = 14 + ((b * 72 + (t / 1000) * fall) % 72);
    const x = x0 + ((a * w + (t / 1000) * fall * slant + i * 3.1) % w);
    g.moveTo(x, y);
    g.lineTo(x - slant * 2.4, y + 2.4);
  }
  g.stroke();
  g.restore();
}

export function snow(g: G, x0: number, x1: number, t: number, tier: number): void {
  const n = tier >= 2 ? 60 : 140;
  const w = x1 - x0;
  g.save();
  g.fillStyle = WOOLS[D.cream].light;
  for (let i = 0; i < n; i++) {
    const [a, b, c] = RAIN_SEEDS[i];
    const y = 14 + ((b * 72 + (t / 1000) * (4 + c * 3)) % 72);
    const x = x0 + ((a * w + Math.sin(t / 1400 + i) * 2 + i * 1.7) % w);
    g.beginPath();
    g.arc(x, y, 0.28 + c * 0.2, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

// ---------------------------------------------------------------------------
// Falling stars
// ---------------------------------------------------------------------------

export class Meteors {
  private list: { x: number; y: number; born: number; len: number; ang: number }[] = [];
  private next = 0;

  draw(g: G, x0: number, x1: number, t: number, night: number, rate: number): void {
    if (night < 0.6) return;
    if (t > this.next) {
      const x = x0 + Math.random() * (x1 - x0);
      this.list.push({ x, y: 15 + Math.random() * Math.max(4, hillY(x) - 22), born: t, len: 7 + Math.random() * 10, ang: 0.35 + Math.random() * 0.4 });
      this.next = t + (900 + Math.random() * 2600) / rate;
    }
    g.save();
    g.lineCap = "round";
    for (const m of this.list) {
      const age = (t - m.born) / 900;
      if (age > 1.6) continue;
      const grow = Math.min(1, age * 2.2);
      const fade = age > 1 ? 1 - (age - 1) / 0.6 : 1;
      const hx = m.x - Math.cos(m.ang) * m.len * grow;
      const hy = m.y + Math.sin(m.ang) * m.len * grow;
      g.globalAlpha = fade * night;
      g.strokeStyle = WOOLS[D.woadPale].light;
      g.lineWidth = 0.24;
      g.setLineDash([0.7, 0.4]);
      g.beginPath();
      g.moveTo(m.x, m.y);
      g.lineTo(hx, hy);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = WOOLS[D.cream].light;
      g.beginPath();
      g.arc(hx, hy, 0.45, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    this.list = this.list.filter((m) => t - m.born < 1500);
  }
}

// ---------------------------------------------------------------------------
// Birds: rooks and starlings crossing the day sky, a few at a time
// ---------------------------------------------------------------------------

export class Birds {
  private flocks: { x: number; y: number; vx: number; n: number; born: number; seed: number }[] = [];
  private next = 0;

  draw(g: G, x0: number, x1: number, t: number, day: number, dt: number): void {
    if (day < 0.4) {
      this.flocks = [];
      return;
    }
    if (t > this.next && this.flocks.length < 2) {
      const fromLeft = Math.random() < 0.5;
      const w = x1 - x0;
      this.flocks.push({ x: fromLeft ? x0 - 8 : x1 + 8, y: 17 + Math.random() * 14, vx: (fromLeft ? 1 : -1) * (3.5 + Math.random() * 3), n: 3 + Math.floor(Math.random() * 6), born: t, seed: Math.random() * 100 });
      this.next = t + 7000 + Math.random() * 16000 * (w / 180);
    }
    g.save();
    g.strokeStyle = WOOLS[D.walnutDark].mid;
    g.lineWidth = 0.26;
    g.lineCap = "round";
    for (const f of this.flocks) {
      f.x += (f.vx * dt) / 1000;
      for (let i = 0; i < f.n; i++) {
        const bx = f.x - Math.sign(f.vx) * (i * 2.6 + Math.sin(i * 7.3 + f.seed) * 1.4);
        const by = f.y + Math.sin(i * 3.1 + f.seed) * 2.2 + Math.sin(t / 900 + i) * 0.4;
        const flap = Math.sin(t / 110 + i * 1.7) * 0.6;
        g.beginPath();
        g.moveTo(bx - 0.9, by - 0.2 - flap * 0.5);
        g.quadraticCurveTo(bx - 0.45, by - 0.6 - flap, bx, by);
        g.quadraticCurveTo(bx + 0.45, by - 0.6 - flap, bx + 0.9, by - 0.2 - flap * 0.5);
        g.stroke();
      }
    }
    g.restore();
    this.flocks = this.flocks.filter((f) => f.x > x0 - 40 && f.x < x1 + 40);
  }
}

// ---------------------------------------------------------------------------
// The mill wheel and the bell
// ---------------------------------------------------------------------------

export function millWheel(g: G, angle: number, level: number): void {
  const b = BUILDING.mill;
  const cx = b.x - b.w / 2 - 5.2;
  const cy = b.y - 5;
  const r = 5.4;
  g.save();
  g.translate(cx, cy);
  // Spokes and rim, in walnut.
  g.strokeStyle = WOOLS[D.walnutDark].mid;
  g.lineWidth = 0.5;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = WOOLS[D.walnut].mid;
  g.lineWidth = 0.34;
  g.beginPath();
  g.arc(0, 0, r - 0.5, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 8; i++) {
    const a = angle + (i / 8) * Math.PI * 2;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    g.stroke();
    // Paddles.
    g.save();
    g.translate(Math.cos(a) * r, Math.sin(a) * r);
    g.rotate(a);
    g.fillStyle = WOOLS[D.walnutPale].mid;
    g.fillRect(-0.1, -0.9, 1.6, 1.8);
    g.strokeStyle = WOOLS[D.walnutDark].mid;
    g.lineWidth = 0.14;
    g.strokeRect(-0.1, -0.9, 1.6, 1.8);
    g.restore();
  }
  g.fillStyle = WOOLS[D.greyDark].mid;
  g.beginPath();
  g.arc(0, 0, 0.8, 0, Math.PI * 2);
  g.fill();
  // White water where the paddles strike, more in spate.
  const splash = 0.3 + level * 1.4;
  g.strokeStyle = WOOLS[D.cream].light;
  g.lineWidth = 0.2;
  for (let i = 0; i < Math.round(3 + level * 8); i++) {
    const a = Math.PI * 0.35 + ((i * 0.37 + angle * 0.2) % 0.9);
    const sx = Math.cos(a) * (r + 0.8);
    const sy = Math.sin(a) * (r + 0.8);
    g.beginPath();
    g.moveTo(sx, sy);
    g.lineTo(sx + Math.cos(a) * splash, sy + Math.sin(a) * splash * 0.6);
    g.stroke();
  }
  g.restore();
  void RIVER_X;
}

export function bell(g: G, swing: number): void {
  const b = BUILDING.church;
  const tx0 = b.x - b.w / 2;
  const tTop = b.y - b.h * 1.25;
  const cx = tx0 + 5.5;
  const cy = tTop + 3.8;
  g.save();
  g.translate(cx, cy);
  g.rotate(swing * 0.6);
  g.fillStyle = WOOLS[D.weld].mid;
  g.strokeStyle = WOOLS[D.walnutDark].mid;
  g.lineWidth = 0.16;
  g.beginPath();
  g.moveTo(-0.5, 0.3);
  g.bezierCurveTo(-0.7, 1.2, -1.2, 2.2, -1.4, 2.6);
  g.lineTo(1.4, 2.6);
  g.bezierCurveTo(1.2, 2.2, 0.7, 1.2, 0.5, 0.3);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = WOOLS[D.walnutDark].mid;
  g.beginPath();
  g.arc(swing * 0.8, 2.9, 0.32, 0, Math.PI * 2);
  g.fill();
  g.restore();
  // The sound: small stitched arcs either side of the tower.
  if (Math.abs(swing) > 0.25) {
    g.save();
    g.strokeStyle = WOOLS[D.weld].light;
    g.lineWidth = 0.18;
    g.setLineDash([0.5, 0.35]);
    for (const side of [-1, 1]) {
      for (let k = 1; k <= 2; k++) {
        g.beginPath();
        g.arc(cx + side * 7.5, cy + 1.5, 1.2 * k, side > 0 ? -0.8 : Math.PI - 0.8, side > 0 ? 0.8 : Math.PI + 0.8);
        g.stroke();
      }
    }
    g.restore();
  }
}

export function forgeGlow(g: G, t: number, on: boolean): Light | null {
  if (!on) return null;
  const b = BUILDING.smithy;
  const x = b.doorX;
  const y = b.y - 3;
  const f = 0.7 + Math.sin(t / 60) * 0.15 + Math.sin(t / 23) * 0.1;
  g.save();
  g.fillStyle = `rgba(230,120,50,${0.35 * f})`;
  g.beginPath();
  g.ellipse(x, y + 1, 2, 1.4, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  return { x, y, r: 12, strength: 0.9 * f, warm: true };
}
