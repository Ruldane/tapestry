/**
 * Adaptive detail from sustained frame intervals (not just script cost):
 * two-second windows, the 90th-percentile interval, with hysteresis. Tiers
 * step detail down: the stem-stitch sheen on figures, then device pixels,
 * then a 30 fps cap.
 */
export class FrameMonitor {
  private intervals: number[] = [];
  private windowStart = 0;
  private last = 0;
  private bad = 0;
  private good = 0;
  tier: number;
  fps = 60;
  p90 = 16;
  private readonly maxTier = 3;
  onTier: (tier: number) => void = () => {};

  constructor(startTier: number) {
    this.tier = startTier;
  }

  tick(now: number, rendering: boolean): void {
    if (!rendering) {
      this.last = 0;
      return;
    }
    if (this.last) {
      const dt = now - this.last;
      if (dt < 250) this.intervals.push(dt);
    }
    this.last = now;
    if (!this.windowStart) this.windowStart = now;
    if (now - this.windowStart < 2000 || this.intervals.length < 20) return;
    const sorted = this.intervals.slice().sort((a, b) => a - b);
    this.p90 = sorted[Math.floor(sorted.length * 0.9)];
    this.fps = 1000 / (sorted.reduce((s, v) => s + v, 0) / sorted.length);
    this.intervals = [];
    this.windowStart = now;
    const target = this.tier >= 3 ? 36 : 22;
    if (this.p90 > target + 6) {
      this.bad++;
      this.good = 0;
    } else if (this.p90 < target - 4) {
      this.good++;
      this.bad = 0;
    } else {
      this.bad = 0;
      this.good = 0;
    }
    if (this.bad >= 2 && this.tier < this.maxTier) {
      this.tier++;
      this.bad = 0;
      this.onTier(this.tier);
    } else if (this.good >= 8 && this.tier > 0) {
      this.tier--;
      this.good = 0;
      this.onTier(this.tier);
    }
  }
}

/** A first guess at what the device can manage. */
export function startingTier(width: number): number {
  const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { deviceMemory?: number }) : undefined;
  const cores = nav?.hardwareConcurrency ?? 4;
  const memory = nav?.deviceMemory ?? 4;
  const weak = cores <= 4 || memory <= 2;
  if (width < 720) return weak ? 2 : 1;
  return weak ? 1 : 0;
}
