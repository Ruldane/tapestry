/**
 * The needle. When something new is stitched (an inscription, a strip
 * sown, a grave, a vignette in the chronicle), a job reveals the new patch
 * in the order a needle would work it (letter by letter, row by row) while
 * the old work is unpicked. One needle: jobs in view wait their turn; jobs
 * nobody is looking at are finished quietly.
 *
 * With reduced motion the needle rests and new work fades in.
 */
import { WOOLS, D } from "./palette";

export type RevealMode = "ltr" | "rows" | "raster" | "fade";

export interface Job {
  item: string;
  fromKey: string | null;
  toKey: string | null;
  bounds: [number, number, number, number];
  mode: RevealMode;
  dur: number;
  /** Letter spans for inscriptions. */
  spans?: [number, number][];
  created: number;
  started: number;
  wool: number;
}

export interface NeedlePose {
  x: number;
  y: number;
  /** 0..1: the phase of the in-and-out. */
  dip: number;
  wool: number;
}

const THREADS = [D.madder, D.woad, D.weld, D.sage, D.walnut, D.madderPale];

export class Needle {
  queue: Job[] = [];
  active: Job | null = null;
  /** Where the needle is, for drawing (null when resting at the end). */
  pose: NeedlePose | null = null;
  /** Completed transitions: item -> key that is now fully stitched. */
  done: Array<{ item: string; key: string | null }> = [];

  add(job: Omit<Job, "created" | "started" | "wool">, now: number): void {
    // A newer change to the same item replaces a waiting one.
    const i = this.queue.findIndex((j) => j.item === job.item);
    if (i >= 0) {
      const old = this.queue[i];
      this.queue.splice(i, 1);
      job.fromKey = old.fromKey;
    }
    if (this.active?.item === job.item) {
      this.finish(this.active);
      job.fromKey = this.active.toKey;
      this.active = null;
    }
    this.queue.push({ ...job, created: now, started: 0, wool: THREADS[Math.floor(Math.random() * THREADS.length)] });
  }

  finish(j: Job): void {
    this.done.push({ item: j.item, key: j.toKey });
  }

  /** Advance: start a job in view, finish ones long unseen. */
  update(now: number, inView: (b: Job["bounds"]) => boolean, reduced: boolean, ready: (key: string | null) => boolean): void {
    if (this.active && now - this.active.started >= this.active.dur) {
      this.finish(this.active);
      this.active = null;
    }
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const j = this.queue[i];
      if (!ready(j.toKey) || !ready(j.fromKey)) {
        if (now - j.created > 60_000) {
          this.queue.splice(i, 1);
          this.finish(j);
        }
        continue;
      }
      const visible = inView(j.bounds);
      if (!visible && now - j.created > 20_000) {
        this.queue.splice(i, 1);
        this.finish(j);
      }
    }
    if (!this.active) {
      const k = this.queue.findIndex((j) => ready(j.toKey) && ready(j.fromKey) && inView(j.bounds));
      if (k >= 0) {
        const j = this.queue.splice(k, 1)[0];
        j.started = now;
        if (reduced) {
          j.mode = "fade";
          j.dur = 1400;
        }
        this.active = j;
      }
    }
    this.pose = null;
    const a = this.active;
    if (a && a.mode !== "fade") this.pose = this.poseOf(a, now);
  }

  progress(j: Job, now: number): number {
    return Math.min(1, Math.max(0, (now - j.started) / j.dur));
  }

  private poseOf(j: Job, now: number): NeedlePose {
    const p = this.progress(j, now);
    const [x0, y0, x1, y1] = j.bounds;
    const dip = ((now / 260) % 1 + 1) % 1;
    if (j.mode === "ltr" && j.spans?.length) {
      const q = Math.max(0, (p - 0.18) / 0.82);
      const n = j.spans.length;
      const i = Math.min(n - 1, Math.floor(q * n));
      const f = q * n - i;
      const [a, b] = j.spans[i];
      return { x: a + (b - a) * f, y: y0 + (y1 - y0) * (0.35 + 0.3 * Math.sin(f * Math.PI * 3)), dip, wool: j.wool };
    }
    const rows = Math.max(3, Math.round((y1 - y0) / 2.2));
    const r = p * rows;
    const row = Math.min(rows - 1, Math.floor(r));
    const f = r - row;
    const across = row % 2 ? 1 - f : f;
    const y = j.mode === "rows" ? y1 - ((row + 0.5) / rows) * (y1 - y0) : y0 + ((row + 0.5) / rows) * (y1 - y0);
    return { x: x0 + (x1 - x0) * across, y, dip, wool: j.wool };
  }

  /**
   * Clip regions for a job at progress p: `reveal` shows the new work,
   * the rest shows the old. Returned as rectangles in cloth units.
   */
  regions(j: Job, now: number): { newRects: [number, number, number, number][]; oldAlpha: number; newAlpha: number } {
    const p = this.progress(j, now);
    const [x0, y0, x1, y1] = j.bounds;
    if (j.mode === "fade") return { newRects: [[x0, y0, x1, y1]], oldAlpha: 1 - p, newAlpha: p };
    if (j.mode === "ltr" && j.spans?.length) {
      const q = Math.max(0, (p - 0.18) / 0.82);
      const n = j.spans.length;
      const i = Math.floor(q * n);
      const f = q * n - i;
      const edge = i >= n ? x1 : j.spans[i][0] + (j.spans[i][1] - j.spans[i][0]) * f;
      // The old words are unpicked first, then the new are worked left to right.
      return { newRects: q > 0 ? [[x0, y0, Math.max(x0, edge), y1]] : [], oldAlpha: Math.max(0, 1 - p / 0.18), newAlpha: 1 };
    }
    const rows = Math.max(3, Math.round((y1 - y0) / 2.2));
    const r = p * rows;
    const row = Math.floor(r);
    const f = r - row;
    const h = (y1 - y0) / rows;
    const rects: [number, number, number, number][] = [];
    const across = row % 2 ? [x0 + (x1 - x0) * (1 - f), x1] : [x0, x0 + (x1 - x0) * f];
    if (j.mode === "rows") {
      if (row > 0) rects.push([x0, y1 - row * h, x1, y1]);
      if (row < rows) rects.push([across[0], y1 - (row + 1) * h, across[1], y1 - row * h]);
    } else {
      if (row > 0) rects.push([x0, y0, x1, y0 + row * h]);
      if (row < rows) rects.push([across[0], y0 + row * h, across[1], y0 + (row + 1) * h]);
    }
    return { newRects: rects, oldAlpha: 1, newAlpha: 1 };
  }
}

/**
 * Draw the needle at a point (cloth units, in a context already scaled to
 * cloth units), trailing its thread up out of the cloth to an unseen hand.
 */
export function drawNeedle(g: CanvasRenderingContext2D, pose: NeedlePose, topY: number, t: number): void {
  const len = 6.2;
  const under = pose.dip > 0.55;
  const lift = under ? 0.2 : 1.6 * Math.sin(pose.dip * Math.PI / 0.55);
  const ang = -0.95 + Math.sin(t / 700) * 0.1;
  const tipX = pose.x;
  const tipY = pose.y - (under ? 0 : lift * 0.3);
  const eyeX = tipX + Math.cos(ang) * len;
  const eyeY = tipY + Math.sin(ang) * len - lift;
  // The thread, up to the hand nobody sees.
  const wool = WOOLS[pose.wool];
  g.save();
  g.lineCap = "round";
  g.strokeStyle = wool.dark;
  g.lineWidth = 0.42;
  g.beginPath();
  g.moveTo(eyeX, eyeY);
  const hx = eyeX + 14 + Math.sin(t / 900) * 3;
  g.bezierCurveTo(eyeX + 4, eyeY - 6, hx - 6, topY + 10, hx, topY - 4);
  g.stroke();
  g.strokeStyle = wool.light;
  g.lineWidth = 0.18;
  g.setLineDash([0.5, 0.4]);
  g.stroke();
  g.setLineDash([]);
  // The needle: steel, with light along it.
  const visibleFrom = under ? 0.45 : 0;
  const sx = tipX + Math.cos(ang) * len * visibleFrom;
  const sy = tipY + Math.sin(ang) * len * visibleFrom - (under ? 0 : lift * visibleFrom);
  g.strokeStyle = "rgba(40,36,34,0.45)";
  g.lineWidth = 0.5;
  g.beginPath();
  g.moveTo(sx + 0.25, sy + 0.35);
  g.lineTo(eyeX + 0.25, eyeY + 0.35);
  g.stroke();
  const grad = g.createLinearGradient(sx, sy - 0.3, sx, sy + 0.3);
  grad.addColorStop(0, "#e9ebec");
  grad.addColorStop(0.5, "#9aa0a4");
  grad.addColorStop(1, "#5f6468");
  g.strokeStyle = grad;
  g.lineWidth = 0.36;
  g.beginPath();
  g.moveTo(sx, sy);
  g.lineTo(eyeX, eyeY);
  g.stroke();
  // The eye.
  g.strokeStyle = "#5f6468";
  g.lineWidth = 0.1;
  g.beginPath();
  g.ellipse(eyeX - Math.cos(ang) * 0.5, eyeY - Math.sin(ang) * 0.5, 0.35, 0.14, ang, 0, Math.PI * 2);
  g.stroke();
  // Where it goes in, the linen dimples.
  if (under) {
    g.fillStyle = "rgba(50,40,26,0.25)";
    g.beginPath();
    g.ellipse(tipX + Math.cos(ang) * len * 0.45, tipY + Math.sin(ang) * len * 0.45, 0.6, 0.35, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}
