/**
 * The page's side of the loom: asks the loom worker for tiles and patches,
 * keeps the ones near the view, forgets the rest. Nothing here blocks the
 * main thread; what is not ready yet is drawn as plain linen until it is.
 */
import type { FromLoom, TileVariant, ToLoom } from "./loom.worker";
import type { PatchSpec } from "./patches";

export const TILE_U = 48;
/** The glass stitches small square cells instead of whole tiles. */
export const CELL_U = 12;

export interface Tile {
  bitmap: ImageBitmap;
  at: number;
  used: number;
}

export interface Patch {
  bitmap: ImageBitmap;
  bounds: [number, number, number, number];
  at: number;
  used: number;
}

export class LoomCache {
  private worker: Worker | null = null;
  private tiles = new Map<string, Tile>();
  private cells = new Map<string, Tile>();
  /** Jobs that failed, and when they may be tried again. */
  private retry = new Map<string, { at: number; n: number }>();
  private patches = new Map<string, Patch>();
  private pending = new Map<string, number>();
  private gen = 1;
  /** px per unit the cloth is currently stitched at. */
  px = 0;
  tileMs = 0;
  onReady: (key: string) => void = () => {};
  failed = false;

  start(): void {
    try {
      this.worker = new Worker(new URL("./loom.worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (ev: MessageEvent<FromLoom>) => this.receive(ev.data);
      this.worker.onerror = () => {
        this.failed = true;
      };
    } catch {
      this.failed = true;
    }
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const t of this.tiles.values()) t.bitmap.close();
    for (const p of this.patches.values()) p.bitmap.close();
    for (const c of this.cells.values()) c.bitmap.close();
    this.cells.clear();
    this.tiles.clear();
    this.patches.clear();
  }

  /** A new scale: everything will be stitched afresh (old bitmaps stay until replaced). */
  setScale(px: number): void {
    if (Math.abs(px - this.px) < 0.01) return;
    this.px = px;
    this.gen++;
    this.pending.clear();
    this.send({ type: "drop", below: this.gen });
  }

  private send(m: ToLoom): void {
    this.worker?.postMessage(m);
  }

  private receive(m: FromLoom): void {
    if (m.type === "failed") {
      this.pending.delete(m.key);
      const n = (this.retry.get(m.key)?.n ?? 0) + 1;
      this.retry.set(m.key, { at: performance.now() + Math.min(60_000, 2000 * 2 ** n), n });
      return;
    }
    this.retry.delete(m.key);
    this.pending.delete(m.key);
    const now = performance.now();
    if (m.type === "tile") {
      this.tileMs = this.tileMs ? this.tileMs * 0.8 + m.ms * 0.2 : m.ms;
      const map = m.key.startsWith("c:") ? this.cells : this.tiles;
      map.get(m.key)?.bitmap.close();
      map.set(m.key, { bitmap: m.bitmap, at: now, used: now });
    } else {
      const old = this.patches.get(m.key);
      old?.bitmap.close();
      this.patches.set(m.key, { bitmap: m.bitmap, bounds: m.bounds, at: now, used: now });
    }
    this.onReady(m.key);
  }

  tileKey(i: number, variant: TileVariant, px = this.px): string {
    return `t:${i}:${variant}:${px}`;
  }

  tile(i: number, variant: TileVariant, prio: number, px = this.px): Tile | null {
    const key = this.tileKey(i, variant, px);
    const t = this.tiles.get(key);
    if (t) {
      t.used = performance.now();
      return t;
    }
    if (!this.pending.has(key) && px > 0 && this.mayTry(key)) {
      this.pending.set(key, prio);
      this.send({ type: "tile", key, x0: i * TILE_U, x1: (i + 1) * TILE_U, px, variant, prio, gen: this.gen });
    }
    return null;
  }

  /** One CELL_U-square cell of the cloth at a (large) scale, for the glass. */
  cell(ci: number, cj: number, variant: TileVariant, prio: number, px: number): Tile | null {
    const key = `c:${ci}:${cj}:${variant}:${px}`;
    const t = this.cells.get(key);
    if (t) {
      t.used = performance.now();
      return t;
    }
    if (!this.pending.has(key) && px > 0 && this.mayTry(key)) {
      const i = Math.floor((ci * CELL_U) / TILE_U);
      this.pending.set(key, prio);
      this.send({ type: "tile", key, x0: i * TILE_U, x1: (i + 1) * TILE_U, px, variant, prio, gen: this.gen, cell: [ci * CELL_U, cj * CELL_U, (ci + 1) * CELL_U, (cj + 1) * CELL_U] });
    }
    return null;
  }

  private mayTry(key: string): boolean {
    const r = this.retry.get(key);
    return !r || performance.now() >= r.at;
  }

  /** The best tile we have for this place, at any scale, for use while the right one is stitched. */
  anyTile(i: number, variant: TileVariant): Tile | null {
    let best: Tile | null = null;
    for (const [k, t] of this.tiles) {
      const [, idx, v] = k.split(":");
      if (Number(idx) === i && v === variant && (!best || t.at > best.at)) best = t;
    }
    return best;
  }

  patch(spec: PatchSpec, key: string, prio: number, px = this.px): Patch | null {
    const k = `${key}@${px}`;
    const p = this.patches.get(k);
    if (p) {
      p.used = performance.now();
      return p;
    }
    if (!this.pending.has(k) && px > 0 && this.mayTry(k)) {
      this.pending.set(k, prio);
      this.send({ type: "patch", key: k, spec, px, prio, gen: this.gen });
    }
    return null;
  }

  peekPatch(key: string, px = this.px): Patch | null {
    return this.patches.get(`${key}@${px}`) ?? null;
  }

  /** A patch at any scale (for drawing while the right scale arrives). */
  anyPatch(key: string): Patch | null {
    let best: Patch | null = null;
    for (const [k, p] of this.patches) {
      if (k.slice(0, k.lastIndexOf("@")) === key && (!best || p.at > best.at)) best = p;
    }
    return best;
  }

  isPending(key: string, px = this.px): boolean {
    return this.pending.has(`${key}@${px}`);
  }

  /** Forget what has not been used lately. */
  sweep(maxTiles = 26, maxPatches = 380): void {
    const now = performance.now();
    if (this.tiles.size > maxTiles) {
      const list = [...this.tiles.entries()].sort((a, b) => a[1].used - b[1].used);
      for (const [k, t] of list.slice(0, this.tiles.size - maxTiles)) {
        if (now - t.used < 1500) continue;
        t.bitmap.close();
        this.tiles.delete(k);
      }
    }
    if (this.cells.size > 72) {
      const list = [...this.cells.entries()].sort((a, b) => a[1].used - b[1].used);
      for (const [k, t] of list.slice(0, this.cells.size - 72)) {
        if (now - t.used < 1500) continue;
        t.bitmap.close();
        this.cells.delete(k);
      }
    }
    if (this.patches.size > maxPatches) {
      const list = [...this.patches.entries()].sort((a, b) => a[1].used - b[1].used);
      for (const [k, p] of list.slice(0, this.patches.size - maxPatches)) {
        if (now - p.used < 3000) continue;
        p.bitmap.close();
        this.patches.delete(k);
      }
    }
  }

  stats(): { tiles: number; patches: number; pending: number } {
    return { tiles: this.tiles.size, patches: this.patches.size, pending: this.pending.size };
  }
}
