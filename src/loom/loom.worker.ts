/// <reference lib="webworker" />
/**
 * The loom: stitches tiles of the hanging and small changing patches in an
 * OffscreenCanvas, off the main thread, and hands back ImageBitmaps. Jobs
 * are taken most urgent first; stale ones are dropped.
 */
import { drawBackTile, drawTile } from "./scenery";
import { drawPatch, patchBounds, type PatchSpec } from "./patches";
import { Stitcher } from "./stitches";
import { ctx2d, makeCanvas, strands } from "./strand";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

export type TileVariant = "day" | "night" | "daySnow" | "nightSnow" | "back";

export type ToLoom =
  | { type: "tile"; key: string; x0: number; x1: number; px: number; variant: TileVariant; prio: number; gen: number; cell?: [number, number, number, number] }
  | { type: "patch"; key: string; spec: PatchSpec; px: number; prio: number; gen: number }
  | { type: "drop"; below: number }
  | { type: "reprioritise"; prios: Record<string, number> };

export type FromLoom =
  | { type: "tile"; key: string; bitmap: ImageBitmap; ms: number; gen: number }
  | { type: "patch"; key: string; bitmap: ImageBitmap; bounds: [number, number, number, number]; ms: number; gen: number }
  | { type: "failed"; key: string; message: string };

type Job = Extract<ToLoom, { type: "tile" } | { type: "patch" }>;

const queue: Job[] = [];
let busy = false;
let minGen = 0;

function next(): void {
  if (busy) return;
  const live = queue.filter((j) => j.gen >= minGen);
  queue.length = 0;
  queue.push(...live);
  if (!queue.length) return;
  queue.sort((a, b) => a.prio - b.prio);
  const job = queue.shift()!;
  busy = true;
  // Yield between jobs so new, more urgent requests can overtake.
  setTimeout(() => {
    try {
      run(job);
    } catch (e) {
      ctx.postMessage({ type: "failed", key: job.key, message: e instanceof Error ? e.message : String(e) } satisfies FromLoom);
    }
    busy = false;
    next();
  }, 0);
}

function run(job: Job): void {
  const t0 = performance.now();
  const set = strands(job.px);
  if (job.type === "tile") {
    // A whole tile, or (for the glass) one small cell of it, stitched with the tile's own random sequence.
    const [cx0, cy0, cx1, cy1] = job.cell ?? [job.x0, 0, job.x1, 100];
    const w = Math.ceil((cx1 - cx0) * job.px);
    const h = Math.ceil((cy1 - cy0) * job.px);
    const c = makeCanvas(w, h) as OffscreenCanvas;
    const g = ctx2d(c);
    const st = new Stitcher(g, set, job.px, cx0, cy0, Math.floor(job.x0 * 13 + job.variant.length));
    if (job.cell) st.cull = job.cell;
    if (job.variant === "back") drawBackTile(st, job.x0, job.x1);
    else drawTile(st, job.x0, job.x1, { night: job.variant.startsWith("night"), snow: job.variant.endsWith("Snow") });
    const bitmap = c.transferToImageBitmap();
    ctx.postMessage({ type: "tile", key: job.key, bitmap, ms: performance.now() - t0, gen: job.gen } satisfies FromLoom, [bitmap]);
    return;
  }
  const b = patchBounds(job.spec);
  const pad = 0.8;
  const bx0 = b[0] - pad;
  const by0 = b[1] - pad;
  const w = (b[2] - b[0] + pad * 2) * job.px;
  const h = (b[3] - b[1] + pad * 2) * job.px;
  const c = makeCanvas(w, h) as OffscreenCanvas;
  const g = ctx2d(c);
  const st = new Stitcher(g, set, job.px, bx0, by0, job.key.length * 31);
  drawPatch(st, job.spec);
  st.reset();
  const bitmap = c.transferToImageBitmap();
  ctx.postMessage({ type: "patch", key: job.key, bitmap, bounds: [bx0, by0, b[2] + pad, b[3] + pad], ms: performance.now() - t0, gen: job.gen } satisfies FromLoom, [bitmap]);
}

ctx.onmessage = (ev: MessageEvent<ToLoom>) => {
  const m = ev.data;
  if (m.type === "drop") {
    minGen = m.below;
    return;
  }
  if (m.type === "reprioritise") {
    for (const j of queue) if (m.prios[j.key] !== undefined) j.prio = m.prios[j.key];
    return;
  }
  // Replace a queued job for the same thing.
  const i = queue.findIndex((j) => j.key === m.key);
  if (i >= 0) queue.splice(i, 1);
  queue.push(m);
  next();
};
