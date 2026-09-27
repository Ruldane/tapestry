/**
 * Composes the hanging for one frame: the stitched tiles (day and night
 * blended), the changing patches and the needle's work on them, the mill
 * wheel and the bell, the people and the beasts, weather, night light, and,
 * when the cloth is turned, the threads between lives on its back.
 *
 * Everything is drawn in cloth units on a context transformed to them.
 */
import type { VillageClient } from "../client/village-client";
import { Act, Carry, PILGRIM, Work } from "../sim/types";
import { BAND, BUILDINGS, CLOTH_LENGTH, INSCRIPTION_SLOTS, type Building } from "../sim/geography";
import { unpackState, type Env, type RosterEntry, type SceneState, type StrangerView, type WeaveEdge } from "../worker/protocol";
import { bell, Birds, forgeGlow, Meteors, millWheel, nightLight, rain, rushlight, snow, type Light } from "./atmosphere";
import { CELL_U, LoomCache, TILE_U } from "./cache";
import { drawBeast, drawPerson, drawStranger, Patterns, STRANGER_LOOK, type Figure } from "./figures";
import type { TileVariant } from "./loom.worker";
import { drawNeedle, Needle, type RevealMode } from "./needle";
import { D, LINEN, WOOLS } from "./palette";
import { letterSpans, MOONS, patchBounds, patchKey, seasonOf, type PatchSpec } from "./patches";
import { strands } from "./strand";
import { TREES } from "./scenery";

export interface Camera {
  /** Cloth x at the canvas's left edge. */
  x0: number;
  /** CSS px per cloth unit. */
  k: number;
  /** CSS px from the canvas top to cloth y = cy0. */
  top: number;
  cy0: number;
  cy1: number;
  W: number;
  H: number;
  dpr: number;
}

export type { WeaveEdge };

export interface DrawInput {
  t: number;
  client: VillageClient;
  scene: SceneState | null;
  env: Env | null;
  stranger: StrangerView | null;
  selected: number | null;
  back: boolean;
  reduced: boolean;
  tier: number;
  weave: WeaveEdge[] | null;
  /** Show only these ids' threads on the back (the selected villager's). */
  frozen: boolean;
  /** When the current still was taken (reduced motion): figures hold one pose per still. */
  stillAt?: number;
}

interface HitBox {
  id: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Item {
  item: string;
  spec: PatchSpec;
  key: string;
  mode: RevealMode | null;
  dur: number;
}

interface EntityMotion {
  x: number;
  phase: number;
  speed: number;
  t: number;
}

const INSIDE_KINDS = new Set(["cottage", "hut", "alehouse", "bakehouse", "smithy", "priesthouse", "manor", "church", "mill"]);

export class Renderer {
  readonly cache = new LoomCache();
  readonly needle = new Needle();
  private pats: Patterns | null = null;
  private patsPx = 0;
  private displayed = new Map<string, string>();
  private leaving = new Set<string>();
  private initialised = false;
  private motion = new Map<number, EntityMotion>();
  private meteors = new Meteors();
  private birds = new Birds();
  private wheel = 0;
  private lastT = 0;
  bellSwing = 0;
  bellUntil = 0;
  hits: HitBox[] = [];
  /** Figures drawn last frame (for the "in view" list). */
  drawn: { id: number; x: number }[] = [];
  strangerStitch = { at: 0, started: 0 };
  /** Milliseconds of animation (does not advance while the needle is stayed). */
  animT = 0;
  /** The time figures, lights and the forge are drawn at: the animation clock, or held for a still. */
  private figT = 0;
  private stillKey = -1;
  figuresDrawn = 0;
  private bg: HTMLCanvasElement | null = null;
  private bgKey = "";
  private cacheGen = 0;
  /** Milliseconds spent in each part of the last frames (smoothed), for the debug readout. */
  timing = { tiles: 0, patches: 0, figures: 0, air: 0, total: 0 };
  private mark(k: keyof Renderer["timing"], t0: number): number {
    const t = performance.now();
    this.timing[k] = this.timing[k] * 0.9 + (t - t0) * 0.1;
    return t;
  }

  start(): void {
    this.cache.start();
    this.cache.onReady = () => {
      this.cacheGen++;
    };
  }

  dispose(): void {
    this.cache.dispose();
  }

  ringBell(_t: number, seconds = 6): void {
    this.bellUntil = Math.max(this.bellUntil, this.animT + seconds * 1000);
  }

  /** Something is moving that needs frames even when nothing else changes. */
  busy(): boolean {
    return !!this.needle.active || this.animT < this.bellUntil + 2000 || this.animT - this.strangerStitch.started < 3500;
  }

  /** px per cloth unit to stitch tiles at, for a camera. */
  tilePx(cam: Camera): number {
    return Math.round(cam.k * Math.min(cam.dpr, 1.75) * 4) / 4;
  }

  // -------------------------------------------------------------------------
  // What should be on the cloth
  // -------------------------------------------------------------------------

  private items(scene: SceneState, env: Env | null): Item[] {
    const out: Item[] = [];
    const add = (item: string, spec: PatchSpec, mode: RevealMode | null, dur: number) => out.push({ item, spec, key: patchKey(spec), mode, dur });
    add("river", { k: "river", level: Math.round((env?.river ?? 0.3) * 20) / 20 }, "fade", 1600);
    scene.strips.forEach((state, id) => add(`strip:${id}`, { k: "strip", id, state, flood: scene.stripFlood[id] ?? 0, fm: scene.fm }, "rows", 5200));
    add("meadow", { k: "meadow", mown: scene.meadow.mown, stacked: scene.meadow.stacked, carted: scene.meadow.carted, fm: scene.fm }, "fade", 1600);
    const season = seasonOf(scene.fm);
    for (const t of TREES) add(`canopy:${t.id}`, { k: "canopy", tree: t.id, season }, "fade", 2400);
    if (scene.bridge) add("bridge", { k: "bridge" }, "raster", 6000);
    for (const b of scene.built) add(`cottage:${b}`, { k: "cottage", building: b }, "raster", 11000);
    const graves = scene.graves.slice().sort((a, b) => a.t - b.t);
    graves.forEach((g, i) => add(`grave:${g.slot}`, { k: "grave", slot: g.slot, old: Math.round((1 - i / Math.max(1, graves.length - 1)) * 2) / 2 }, "raster", 4000));
    add("incipit", { k: "incipit" }, null, 0);
    add("lowIncipit", { k: "lowIncipit" }, null, 0);
    for (const ins of scene.inscriptions) {
      const letters = ins.la.replace(/[^A-Z]/g, "").length;
      add(`ins:${ins.slot}`, { k: "ins", slot: ins.slot, la: ins.la }, "ltr", 1400 + letters * 300);
    }
    for (const c of scene.chronicle) if (c.slot >= 0) add(`vig:${c.slot}`, { k: "vig", slot: c.slot, kind: c.kind, la: c.la }, "raster", 7000);
    if (env && env.daylight < 0.55) {
      const phase = Math.round(env.moon * 16) % 16;
      for (const at of MOONS) add(`moon:${at}`, { k: "moon", phase, at }, "fade", 2000);
      if (env.comet) add("comet", { k: "comet" }, "raster", 9000);
    }
    return out;
  }

  /** Reconcile what is wanted with what is shown; changes become needle jobs. */
  private reconcile(items: Item[], t: number): void {
    const seen = new Set<string>();
    for (const it of items) {
      seen.add(it.item);
      const cur = this.displayed.get(it.item);
      if (cur === it.key) continue;
      if (cur === undefined && !this.initialised) {
        this.displayed.set(it.item, it.key);
        continue;
      }
      if (it.mode === null) {
        this.displayed.set(it.item, it.key);
        continue;
      }
      const spans = it.spec.k === "ins" ? letterSpans(it.spec.la, INSCRIPTION_SLOTS[it.spec.slot].x0 + 3, INSCRIPTION_SLOTS[it.spec.slot].x1 - 3) : undefined;
      this.needle.add({ item: it.item, fromKey: cur ?? null, toKey: it.key, bounds: patchBounds(it.spec), mode: it.mode, dur: it.dur, spans }, t);
      this.displayed.set(it.item, it.key);
    }
    for (const [item, key] of this.displayed) {
      if (seen.has(item) || this.leaving.has(item)) continue;
      // Something is unpicked: the bridge carried off, the moon set.
      const spec = specFromKey(key);
      if (spec && (item === "bridge" || item.startsWith("cottage"))) {
        this.needle.add({ item, fromKey: key, toKey: null, bounds: patchBounds(spec), mode: "fade", dur: 2600 }, t);
        this.leaving.add(item);
      } else {
        this.displayed.delete(item);
      }
    }
    for (const d of this.needle.done.splice(0)) {
      if (d.key === null) {
        this.displayed.delete(d.item);
        this.leaving.delete(d.item);
      }
    }
    this.initialised = true;
  }

  // -------------------------------------------------------------------------
  // The frame
  // -------------------------------------------------------------------------

  draw(g: CanvasRenderingContext2D, cam: Camera, input: DrawInput, lens = false): void {
    const { scene, env } = input;
    // The animation clock stands still while the needle is stayed: nothing moves, not even the rain.
    const paused = (env?.speed ?? 1) === 0;
    const dReal = this.lastT ? Math.min(100, input.t - this.lastT) : 16;
    if (!lens) {
      this.lastT = input.t;
      if (!paused) this.animT += dReal;
    }
    const t = this.animT;
    if (input.frozen) {
      if (input.stillAt !== this.stillKey) {
        this.stillKey = input.stillAt ?? 0;
        this.figT = this.animT;
      }
    } else this.figT = this.animT;
    const T0 = performance.now();
    let T = T0;
    const dt = paused ? 0 : dReal;
    const px = this.tilePx(cam);
    if (!lens) this.cache.setScale(px);
    const figPx = cam.k * cam.dpr;
    if (!this.pats || Math.abs(this.patsPx - figPx) > 0.5) {
      this.pats = new Patterns(g, strands(figPx));
      this.patsPx = figPx;
    }
    const viewW = cam.W / cam.k;
    const x0 = cam.x0;
    const x1 = cam.x0 + viewW;
    const night = env ? smooth(1 - env.daylight) : 0;

    const s = cam.k * cam.dpr;
    const toCloth = (c: CanvasRenderingContext2D) => {
      if (input.back) c.setTransform(-s, 0, 0, s, (cam.W + x0 * cam.k) * cam.dpr, (cam.top - cam.cy0 * cam.k) * cam.dpr);
      else c.setTransform(s, 0, 0, s, -x0 * s, (cam.top - cam.cy0 * cam.k) * cam.dpr);
    };
    const clipCloth = (c: CanvasRenderingContext2D) => {
      c.beginPath();
      c.rect(Math.max(0, x0 - 1), cam.cy0, Math.min(CLOTH_LENGTH + 3, x1 + 1) - Math.max(0, x0 - 1), cam.cy1 - cam.cy0 + 0.01);
      c.clip();
    };

    let items: Item[] = [];
    if (scene) {
      items = this.items(scene, env);
      if (!lens) {
        this.reconcile(items, t);
        const inView = (b: [number, number, number, number]) => b[2] > x0 && b[0] < x1;
        const ready = (key: string | null) => key === null || !!this.cache.peekPatch(key, px);
        this.needle.update(t, inView, input.reduced, ready);
      }
    }

    // The stitched background (rod, tiles, patches) is cached while nothing in it changes;
    // what moves is drawn over it every frame.
    const W = Math.round(cam.W * cam.dpr);
    const H = Math.round(cam.H * cam.dpr);
    let bg: CanvasRenderingContext2D = g;
    let fresh = true;
    if (!lens) {
      if (!this.bg || this.bg.width !== W || this.bg.height !== H) {
        this.bg = document.createElement("canvas");
        this.bg.width = W;
        this.bg.height = H;
        this.bgKey = "";
      }
      bg = this.bg.getContext("2d")!;
      const key = [x0.toFixed(4), cam.k, cam.dpr, cam.top, W, H, input.back ? 1 : 0, Math.round(night * 60), scene?.version ?? 0, this.cacheGen, this.needle.active ? t : 0, this.needle.queue.length, this.leaving.size].join("|");
      fresh = key !== this.bgKey;
      this.bgKey = key;
    }
    if (fresh) {
      const bgc = bg;
      bgc.setTransform(1, 0, 0, 1, 0, 0);
      bgc.clearRect(0, 0, cam.W * cam.dpr, cam.H * cam.dpr);
      const s = cam.k * cam.dpr;
      if (input.back) bgc.setTransform(-s, 0, 0, s, (cam.W + x0 * cam.k) * cam.dpr, (cam.top - cam.cy0 * cam.k) * cam.dpr);
      else bgc.setTransform(s, 0, 0, s, -x0 * s, (cam.top - cam.cy0 * cam.k) * cam.dpr);

      // The rod the hanging hangs from.
      rod(bgc, x0, x1);
      // Clip everything else to the cloth.
      bgc.save();
      bgc.beginPath();
      bgc.rect(Math.max(0, x0 - 1), cam.cy0, Math.min(CLOTH_LENGTH + 3, x1 + 1) - Math.max(0, x0 - 1), cam.cy1 - cam.cy0 + 0.01);
      bgc.clip();

      // Tiles.
      const i0 = Math.max(0, Math.floor((x0 - 2) / TILE_U));
      const i1 = Math.min(Math.floor((CLOTH_LENGTH + 4) / TILE_U), Math.floor((x1 + 2) / TILE_U));
      const snowy = scene?.snow ?? false;
      const dayV: TileVariant = input.back ? "back" : snowy ? "daySnow" : "day";
      const nightV: TileVariant = snowy ? "nightSnow" : "night";
      const tilePx = lens ? Math.round(cam.k * cam.dpr * 4) / 4 : px;
      const mid = (x0 + x1) / 2;
      if (lens) {
        // The glass: small cells at its own scale, with the ordinary tiles showing through until they come.
        const yTop = cam.cy0 - cam.top / cam.k;
        const yBot = yTop + cam.H / cam.k;
        const variants: [TileVariant, number][] = [];
        const showNight = !input.back && night > 0.02;
        if (!showNight || night < 0.98) variants.push([dayV, 1]);
        if (showNight) variants.push([nightV, night < 0.98 ? night : 1]);
        for (let ci = Math.floor(Math.max(0, x0) / CELL_U); ci * CELL_U <= Math.min(CLOTH_LENGTH + 4, x1); ci++) {
          for (let cj = Math.floor(Math.max(0, yTop) / CELL_U); cj * CELL_U <= Math.min(BAND.bottom, yBot); cj++) {
            const cx = ci * CELL_U;
            const cy = cj * CELL_U;
            const ti = Math.floor(cx / TILE_U);
            for (const [v, alpha] of variants) {
              const prio = Math.hypot(cx + CELL_U / 2 - mid, cy + CELL_U / 2 - (yTop + yBot) / 2) / CELL_U;
              const cell = this.cache.cell(ci, cj, v, prio, tilePx);
              const tile = cell ? null : (this.cache.tile(ti, v, 50, px) ?? this.cache.anyTile(ti, v));
              bgc.globalAlpha = alpha;
              if (cell) bgc.drawImage(cell.bitmap, cx, cy, CELL_U, CELL_U);
              else if (tile) {
                const bw = tile.bitmap.width;
                const bh = tile.bitmap.height;
                bgc.drawImage(tile.bitmap, ((cx - ti * TILE_U) / TILE_U) * bw, (cy / 100) * bh, (CELL_U / TILE_U) * bw, (CELL_U / 100) * bh, cx, cy, CELL_U, CELL_U);
              } else {
                bgc.fillStyle = input.back ? LINEN.back : LINEN.base;
                bgc.fillRect(cx, cy, CELL_U, CELL_U);
              }
              bgc.globalAlpha = 1;
            }
          }
        }
      }
      for (let i = i0; i <= (lens ? i0 - 1 : i1); i++) {
        const prio = Math.abs((i + 0.5) * TILE_U - mid) / TILE_U;
        const tx = i * TILE_U;
        const drawTileImg = (v: TileVariant, alpha: number) => {
          let tile = this.cache.tile(i, v, prio, tilePx);
          if (!tile) tile = this.cache.anyTile(i, v);
          if (!tile) return false;
          bgc.globalAlpha = alpha;
          bgc.drawImage(tile.bitmap, tx, 0, TILE_U, BAND.bottom);
          bgc.globalAlpha = 1;
          return true;
        };
        const showNight = !input.back && night > 0.02;
        let ok = true;
        if (!showNight || night < 0.98) ok = drawTileImg(dayV, 1);
        if (showNight) {
          const nightOk = drawTileImg(nightV, night < 0.98 ? night : 1);
          if (night >= 0.98) ok = nightOk;
        }
        if (!ok) {
          // Not stitched yet: plain linen.
          bgc.fillStyle = input.back ? LINEN.back : LINEN.base;
          bgc.fillRect(tx, 0, Math.min(TILE_U, CLOTH_LENGTH - tx), BAND.bottom);
        }
      }
      // Look ahead: stitch the tiles either side.
      if (!lens) {
        for (const i of [i0 - 1, i1 + 1, i0 - 2, i1 + 2]) {
          if (i < 0 || i * TILE_U > CLOTH_LENGTH) continue;
          this.cache.tile(i, dayV, 6 + Math.abs(i - (i0 + i1) / 2), px);
          if (night > 0.02 && !input.back) this.cache.tile(i, nightV, 7 + Math.abs(i - (i0 + i1) / 2), px);
        }
      }

      // Patches, with the needle's work.
      const active = this.needle.active;
      const queued = new Map(this.needle.queue.map((j) => [j.item, j]));
      const backAlpha = input.back ? 0.28 : 1;
      const drawPatchKey = (key: string, spec: PatchSpec | null, alpha = 1) => {
        if (!spec) return;
        const b = patchBounds(spec);
        if (b[2] < x0 - 4 || b[0] > x1 + 4) return;
        const prio = 2 + Math.abs((b[0] + b[2]) / 2 - mid) / 60;
        const p = this.cache.patch(spec, key, prio, tilePx) ?? this.cache.anyPatch(key);
        if (!p) return;
        const [bx0, by0, bx1, by1] = p.bounds;
        bgc.globalAlpha = alpha * backAlpha;
        bgc.drawImage(p.bitmap, bx0, by0, bx1 - bx0, by1 - by0);
        bgc.globalAlpha = 1;
      };
      // Order: water, fields, trees, houses, churchyard, words.
      const order = (it: Item) => (it.item === "river" ? 0 : it.item.startsWith("strip") || it.item === "meadow" ? 1 : it.item.startsWith("canopy") ? 3 : it.item === "bridge" ? 2 : 4);
      const all = [...items];
      for (const item of this.leaving) {
        const key = this.displayed.get(item);
        const spec = key ? specFromKey(key) : null;
        if (spec && key) all.push({ item, spec, key, mode: "fade", dur: 0 });
      }
      all.sort((a, b) => order(a) - order(b));
      for (const it of all) {
        if (input.back && !(it.item.startsWith("ins") || it.item.startsWith("vig") || it.item === "incipit" || it.item === "lowIncipit" || it.item.startsWith("strip"))) continue;
        const job = active?.item === it.item ? active : null;
        const waiting = queued.get(it.item);
        if (waiting) {
          // Not begun: the old work still shows.
          if (waiting.fromKey) drawPatchKey(waiting.fromKey, specFromKey(waiting.fromKey));
          continue;
        }
        if (!job) {
          const key = this.displayed.get(it.item) ?? it.key;
          drawPatchKey(key, specFromKey(key) ?? it.spec);
          continue;
        }
        const r = this.needle.regions(job, t);
        if (job.fromKey && r.oldAlpha > 0) {
          // The old work, except where the new has been stitched over it.
          bgc.save();
          if (job.mode !== "fade" && job.mode !== "ltr") {
            bgc.beginPath();
            bgc.rect(job.bounds[0] - 1, job.bounds[1] - 1, job.bounds[2] - job.bounds[0] + 2, job.bounds[3] - job.bounds[1] + 2);
            for (const [a, b, c, d] of r.newRects) bgc.rect(c, b, a - c, d - b);
            bgc.clip("evenodd");
          }
          drawPatchKey(job.fromKey, specFromKey(job.fromKey), r.oldAlpha);
          bgc.restore();
        }
        if (job.toKey && r.newRects.length) {
          bgc.save();
          bgc.beginPath();
          for (const [a, b, c, d] of r.newRects) bgc.rect(a, b, c - a, d - b);
          bgc.clip();
          drawPatchKey(job.toKey, specFromKey(job.toKey), r.newAlpha);
          bgc.restore();
        }
      }


      bgc.restore();
      bgc.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (!lens) T = this.mark("tiles", T);
    if (!lens) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, W, H);
      g.drawImage(this.bg!, 0, 0);
    }
    toCloth(g);
    g.save();
    clipCloth(g);

    // The mill wheel turns with the water; the bell swings when rung.
    if (!input.back && env) {
      this.wheel += (dt / 1000) * (0.35 + env.millPower * 1.6 + Math.max(0, env.river - 0.7) * 5) * (env.speed > 0 && !input.frozen ? 1 : 0);
      if (x0 < 740 && x1 > 690) millWheel(g, this.wheel, env.river);
      const ringing = t < this.bellUntil;
      this.bellSwing = ringing ? Math.sin(t / 380) * Math.min(1, (this.bellUntil - t) / 1500) : this.bellSwing * (dt > 0 ? 0.9 : 1);
      if (x0 < 900 && x1 > 860) bell(g, input.frozen ? 0 : this.bellSwing);
    }

    if (!lens) T = this.mark("patches", T);
    // People and beasts.
    const lights: Light[] = [];
    this.drawFigures(g, cam, input, x0, x1, night, lights, lens);
    if (!lens) T = this.mark("figures", T);

    // The needle itself, and the stranger being stitched.
    if (!lens && !input.back && this.needle.pose && !input.reduced) drawNeedle(g, this.needle.pose, cam.cy0 - 2, t);
    else if (!input.back && x1 > 1500 && x0 < 1560) {
      // At rest, the needle works on at the edge of the stitching.
      const dip = input.reduced ? 0.2 : ((t / 1100) % 1 + 1) % 1;
      drawNeedle(g, { x: 1527 + (input.reduced ? 0 : Math.sin(t / 5200) * 1.5), y: 85.6, dip, wool: D.sage }, cam.cy0 - 2, t);
    }

    // Weather.
    if (env && !input.back) {
      if (env.rain > 0.05 && !input.reduced) {
        if (env.snow && env.fm !== 6) snow(g, x0, x1, t, input.tier);
        else rain(g, x0, x1, env.rain, t, env.storm, input.tier);
      }
      if (!input.reduced && !lens && input.tier < 3) this.birds.draw(g, x0, x1, t, env.daylight * (env.rain > 0.5 ? 0 : 1), dt);
      if (env.meteors && env.skyShow && !input.reduced) this.meteors.draw(g, x0, x1, t, night, input.tier >= 2 ? 0.5 : 1);
      const forge = forgeGlow(g, this.figT, x0 < 1110 && x1 > 1060 && this.smithAtWork(input));
      if (forge) lights.push(forge);
      nightLight(g, Math.max(0, x0), Math.min(CLOTH_LENGTH, x1), cam.cy0, cam.cy1, night * 0.78, lights, this.figT);
    }

    // The back of the cloth: the threads between lives.
    if (input.back && input.weave) this.drawWeave(g, input, x0, x1);

    g.restore();
    // Loose threads hanging off the unfinished end.
    if (!input.back && x1 > 1560) looseThreads(g, t, input.reduced);
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (!lens) {
      this.mark("air", T);
      this.mark("total", T0);
    }
  }

  private smithAtWork(input: DrawInput): boolean {
    const c = input.client.cur;
    if (!c) return false;
    for (let i = 0; i < c.n; i++) {
      const st = unpackState(c.u[i * 2 + 1]);
      if (st.work === Work.Smith && st.act === Act.Work) return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Figures
  // -------------------------------------------------------------------------

  private drawFigures(g: CanvasRenderingContext2D, cam: Camera, input: DrawInput, x0: number, x1: number, night: number, lights: Light[], lens: boolean): void {
    const { client } = input;
    const t = input.t;
    const at = this.figT;
    const cur = client.cur;
    const pats = this.pats!;
    const opts = { tier: input.tier, back: input.back };
    if (!lens) {
      this.hits = [];
      this.drawn = [];
    }
    const list: { y: number; draw: () => void }[] = [];
    if (cur) {
      // Babes go in arms.
      const babes: { x: number; y: number }[] = [];
      const insideGroups = new Map<Building, { sleep: number[]; sit: number[]; pray: number[] }>();
      const entities: { id: number; x: number; y: number; st: ReturnType<typeof unpackState> }[] = [];
      for (let i = 0; i < cur.n; i++) {
        const id = cur.u[i * 2];
        const pos = client.position(id, t);
        if (!pos) continue;
        if (pos.x < x0 - 14 || pos.x > x1 + 14) continue;
        const st = pos.state;
        const look = client.roster.get(id);
        if (st.kind === 0 && st.inside) {
          const b = buildingAt(pos.x);
          if (b) {
            let grp = insideGroups.get(b);
            if (!grp) insideGroups.set(b, (grp = { sleep: [], sit: [], pray: [] }));
            if (st.act === Act.Sleep || st.act === Act.Sick) grp.sleep.push(id);
            else if (st.act === Act.Service || st.act === Act.Pray || st.act === Act.Sermon) grp.pray.push(id);
            else if (look && look.ageClass > 0) grp.sit.push(id);
          }
          continue;
        }
        if (st.kind === 0 && look?.ageClass === 0) {
          babes.push({ x: pos.x, y: pos.y });
          continue;
        }
        entities.push({ id, x: pos.x, y: pos.y, st });
      }
      for (const e of entities) {
        const m = this.motionOf(e.id, e.x, at);
        if (e.st.kind === 0) {
          const look = client.roster.get(e.id);
          if (!look) continue;
          let carry = e.st.carry;
          if (carry === Carry.None && look.sex === 1 && look.ageClass >= 3 && babes.some((b) => Math.abs(b.x - e.x) < 1.6 && Math.abs(b.y - e.y) < 2)) carry = Carry.Babe;
          const fig: Figure = {
            id: e.id,
            x: e.x,
            y: e.y,
            facing: e.st.facing,
            act: e.st.act,
            work: e.st.work,
            carry,
            moving: m.speed > 0.6,
            phase: m.phase,
            t: at / 1000,
            sick: e.st.sick,
            selected: e.st.selected || input.selected === e.id,
            look,
            scale: 1,
            lying: false,
            sitting: e.st.act === Act.Drink || e.st.act === Act.Eat || (e.st.act === Act.Rest && (e.st.work === Work.Spin || look.ageClass === 4)) || (e.st.act === Act.Work && e.st.work === Work.Weave),
            reveal: 1,
          };
          list.push({
            y: e.y,
            draw: () => {
              if (fig.selected && !input.back) halo(g, fig.x, fig.y, look.height);
              drawPerson(g, pats, fig, opts);
              if (fig.sitting && !input.back) bench(g, fig.x - fig.facing * 0.6, fig.y);
            },
          });
          if (!lens) {
            this.hits.push({ id: e.id, x0: e.x - 2.4, y0: e.y - look.height - 1, x1: e.x + 2.4, y1: e.y + 0.8 });
            this.drawn.push({ id: e.id, x: e.x });
          }
        } else {
          const b = { kind: e.st.kind, x: e.x, y: e.y, facing: e.st.facing, moving: m.speed > 0.4, phase: m.phase, young: e.st.young, alarm: e.st.alarm, lying: e.st.anim === 2, t: at / 1000, id: e.id };
          list.push({ y: e.y, draw: () => drawBeast(g, pats, b, opts) });
        }
      }
      // Inside the houses: families abed, at table, the congregation at mass.
      for (const [b, grp] of insideGroups) {
        const awake = grp.sit.length > 0;
        if (b.kind === "church" || grp.pray.length) {
          const ids = grp.pray.slice(0, 16);
          ids.forEach((id, i) => {
            const look = client.roster.get(id);
            if (!look) return;
            const row = i % 2;
            const x = b.kind === "church" ? b.x - 12 + Math.floor(i / 2) * 3.4 : b.doorX - 4 + i * 2.6;
            const y = b.y - (row ? 2.2 : 0.2);
            const fig = personAt(id, x, y, look, Act.Service, at, 0.78, false, false, row ? -1 : 1);
            fig.facing = -1;
            list.push({ y: y - 30, draw: () => drawPerson(g, pats, fig, opts) });
            if (!lens) this.hits.push({ id, x0: x - 2, y0: y - look.height * 0.78, x1: x + 2, y1: y });
          });
          if (night > 0.3 && ids.length) lights.push({ x: b.x, y: b.y - 6, r: 22, strength: 0.8, warm: true });
          continue;
        }
        const arch = b.w * 0.4;
        grp.sleep.slice(0, 4).forEach((id, i) => {
          const look = client.roster.get(id);
          if (!look) return;
          const y = b.y - 0.4 - i * 1.9;
          const x = b.doorX - arch * 0.06 + (i % 2 ? 0.8 : -0.4);
          const fig = personAt(id, x, y, look, Act.Sleep, at, look.ageClass === 0 ? 0.55 : 0.72, true, false, i % 2 ? 1 : -1);
          list.push({ y: y - 40 + i * 0.01, draw: () => drawPerson(g, pats, fig, opts) });
          if (!lens) this.hits.push({ id, x0: x - 3.5, y0: y - 2, x1: x + 3.5, y1: y + 0.5 });
        });
        grp.sit.slice(0, 3).forEach((id, i) => {
          const look = client.roster.get(id);
          if (!look) return;
          const x = b.doorX - arch * 0.3 + i * (arch * 0.3);
          const y = b.y - 0.2;
          const fig = personAt(id, x, y, look, Act.Eat, at, 0.7, false, true, i === 2 ? -1 : 1);
          list.push({ y: y - 39, draw: () => drawPerson(g, pats, fig, opts) });
          if (!lens) this.hits.push({ id, x0: x - 2, y0: y - look.height * 0.7, x1: x + 2, y1: y });
        });
        if (awake && grp.sit.length) list.push({ y: b.y - 38.5, draw: () => table(g, b.doorX, b.y) });
        if (night > 0.3 && awake && !input.back) {
          list.push({ y: b.y - 38, draw: () => rushlight(g, b.doorX + arch * 0.42, b.y - 1.5, at) });
          lights.push({ x: b.doorX, y: b.y - 4, r: 13, strength: 1, warm: true });
        }
      }
      // The alehouse is lit when there are drinkers.
      if (night > 0.3) {
        const ale = BUILDINGS.find((b) => b.id === "alehouse")!;
        if (entities.some((e) => e.st.act === Act.Drink && Math.abs(e.x - ale.x) < 30)) lights.push({ x: ale.doorX, y: ale.y - 3, r: 26, strength: 1, warm: true });
      }
    }
    // The stranger.
    const st = input.stranger;
    if (st && st.present && st.x > x0 - 10 && st.x < x1 + 10) {
      if (st.stitchedAt !== this.strangerStitch.at) {
        this.strangerStitch = { at: st.stitchedAt, started: at };
      }
      const reveal = input.reduced ? Math.min(1, (at - this.strangerStitch.started) / 1200) : Math.min(1, (at - this.strangerStitch.started) / 3200);
      const m = this.motionOf(PILGRIM, st.x, at);
      const fig: Figure = {
        id: PILGRIM,
        x: st.x,
        y: st.y,
        facing: st.facing,
        act: Act.Idle,
        work: 0,
        carry: 0,
        moving: m.speed > 0.6,
        phase: m.phase,
        t: at / 1000,
        sick: false,
        selected: false,
        look: STRANGER_LOOK,
        scale: 1,
        lying: false,
        sitting: false,
        reveal,
      };
      const sitting = st.still > 45_000 && m.speed < 0.3;
      list.push({
        y: st.y + 0.05,
        draw: () => {
          drawStranger(g, pats, fig, opts, sitting);
          if (reveal < 1 && !input.reduced && !input.back) {
            drawNeedle(g, { x: st.x + 1.2, y: st.y - STRANGER_LOOK.height * 1.2 * reveal + 0.5, dip: ((at / 240) % 1 + 1) % 1, wool: D.grey }, cam.cy0 - 2, at);
          }
        },
      });
    }
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw();
    if (!lens) this.figuresDrawn = list.length;
  }

  private motionOf(id: number, x: number, t: number): EntityMotion {
    let m = this.motion.get(id);
    if (!m) {
      m = { x, phase: (id % 7) / 7, speed: 0, t };
      this.motion.set(id, m);
      return m;
    }
    const dt = Math.max(1, t - m.t) / 1000;
    if (dt > 0.001 && t !== m.t) {
      const dx = Math.abs(x - m.x);
      const v = dx / dt;
      m.speed = m.speed * 0.7 + Math.min(20, v) * 0.3;
      m.phase = (m.phase + dx / 7.2) % 1;
      m.x = x;
      m.t = t;
    }
    return m;
  }

  // -------------------------------------------------------------------------
  // Threads on the back
  // -------------------------------------------------------------------------

  private drawWeave(g: CanvasRenderingContext2D, input: DrawInput, x0: number, x1: number): void {
    const { client, t, weave } = input;
    if (!weave) return;
    const pos = (id: number): [number, number] | null => {
      if (id === PILGRIM) {
        const s = input.stranger;
        return s && s.present ? [s.x, s.y - 7] : null;
      }
      const p = client.position(id, t);
      return p ? [p.x, p.y - 7] : null;
    };
    const COLORS: Record<WeaveEdge["kind"], [number, number]> = {
      kin: [D.walnut, 0.26],
      spouse: [D.rose, 0.44],
      love: [D.weld, 0.4],
      friend: [D.sage, 0.32],
      grudge: [D.madder, 0.42],
      gossip: [D.woad, 0.26],
    };
    g.save();
    g.lineCap = "round";
    const sel = input.selected;
    const viewW = x1 - x0;
    // Only threads that touch the view (or pass over it), strongest first, at most a few hundred.
    const list: { e: WeaveEdge; a: [number, number]; b: [number, number]; focus: boolean }[] = [];
    for (const e of weave) {
      const a = pos(e.a);
      const b = pos(e.b);
      if (!a || !b) continue;
      const lo = Math.min(a[0], b[0]);
      const hi = Math.max(a[0], b[0]);
      if (hi < x0 - 10 || lo > x1 + 10) continue;
      if (hi - lo > viewW * 3 && (a[0] < x0 - viewW || a[0] > x1 + viewW) && (b[0] < x0 - viewW || b[0] > x1 + viewW)) continue;
      list.push({ e, a, b, focus: sel === null || e.a === sel || e.b === sel });
    }
    list.sort((p, q) => Number(p.focus) - Number(q.focus) || p.e.w - q.e.w);
    const shown = list.slice(-280);
    for (const { e, a, b, focus } of shown) {
      const [wool, w] = COLORS[e.kind];
      const dx = Math.abs(b[0] - a[0]);
      // Carried threads loop up over the back, the longer the higher.
      const lift = Math.min(58, 6 + dx * 0.22 + (e.kind === "gossip" ? 4 : 0));
      const mx = (a[0] + b[0]) / 2;
      const my = Math.max(15, Math.min(a[1], b[1]) - lift);
      g.globalAlpha = (focus ? (sel === null ? (e.kind === "kin" ? 0.4 : 0.72) : 0.95) : 0.12) * Math.max(0.4, 1 - dx / (viewW * 3));
      g.strokeStyle = WOOLS[wool].dark;
      g.lineWidth = w * (0.7 + e.w * 0.6) + 0.12;
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.quadraticCurveTo(mx, my, b[0], b[1]);
      g.stroke();
      g.strokeStyle = WOOLS[wool].light;
      g.lineWidth = w * 0.38;
      if (e.kind === "gossip") g.setLineDash([0.6, 0.9]);
      g.stroke();
      if (e.kind === "gossip") g.setLineDash([]);
      // Knots where a life is tied, and along a grudge, and one for a marriage.
      g.fillStyle = WOOLS[wool].mid;
      for (const [x, y] of [a, b]) {
        g.beginPath();
        g.arc(x, y, 0.5, 0, Math.PI * 2);
        g.fill();
      }
      if (e.kind === "grudge" || e.kind === "spouse") {
        const n = e.kind === "grudge" ? 2 + Math.round(e.w * 4) : 1;
        for (let k = 1; k <= n; k++) {
          const u = k / (n + 1);
          const qx = (1 - u) * (1 - u) * a[0] + 2 * (1 - u) * u * mx + u * u * b[0];
          const qy = (1 - u) * (1 - u) * a[1] + 2 * (1 - u) * u * my + u * u * b[1];
          g.beginPath();
          g.arc(qx, qy, e.kind === "grudge" ? 0.55 : 0.8, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    g.restore();
  }

  /** The villager or beast under a point (cloth units). */
  hitTest(x: number, y: number): number | null {
    let best: number | null = null;
    let bestD = Infinity;
    for (const h of this.hits) {
      if (x < h.x0 || x > h.x1 || y < h.y0 || y > h.y1) continue;
      const d = Math.abs((h.x0 + h.x1) / 2 - x) + Math.abs(h.y1 - y) * 0.2;
      if (d < bestD) {
        bestD = d;
        best = h.id;
      }
    }
    return best;
  }
}

// ---------------------------------------------------------------------------
// Small things
// ---------------------------------------------------------------------------

function smooth(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

function buildingAt(x: number): Building | null {
  let best: Building | null = null;
  let d = 15;
  for (const b of BUILDINGS) {
    if (!INSIDE_KINDS.has(b.kind)) continue;
    const dd = Math.abs(b.doorX - x);
    if (dd < d) {
      d = dd;
      best = b;
    }
  }
  return best;
}

function personAt(id: number, x: number, y: number, look: RosterEntry, act: number, t: number, scale: number, lying: boolean, sitting: boolean, facing: number): Figure {
  return { id, x, y, facing, act, work: 0, carry: 0, moving: false, phase: 0, t: t / 1000, sick: false, selected: false, look, scale, lying, sitting, reveal: 1 };
}

function halo(g: CanvasRenderingContext2D, x: number, y: number, h: number): void {
  g.save();
  g.strokeStyle = WOOLS[D.weld].light;
  g.lineWidth = 0.3;
  g.setLineDash([0.7, 0.45]);
  g.beginPath();
  g.ellipse(x, y + 0.2, 3.2, 0.9, 0, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = WOOLS[D.weld].mid;
  g.beginPath();
  g.moveTo(x, y - h - 2.4);
  g.lineTo(x - 0.8, y - h - 3.6);
  g.lineTo(x + 0.8, y - h - 3.6);
  g.closePath();
  g.fill();
  g.restore();
}

function bench(g: CanvasRenderingContext2D, x: number, y: number): void {
  g.save();
  g.strokeStyle = WOOLS[D.walnut].mid;
  g.lineWidth = 0.34;
  g.beginPath();
  g.moveTo(x - 2.4, y - 3);
  g.lineTo(x + 1.6, y - 3);
  g.moveTo(x - 1.8, y - 3);
  g.lineTo(x - 1.8, y);
  g.moveTo(x + 1, y - 3);
  g.lineTo(x + 1, y);
  g.stroke();
  g.restore();
}

function table(g: CanvasRenderingContext2D, x: number, y: number): void {
  g.save();
  g.strokeStyle = WOOLS[D.walnut].mid;
  g.lineWidth = 0.4;
  g.beginPath();
  g.moveTo(x - 3, y - 4.4);
  g.lineTo(x + 3, y - 4.4);
  g.moveTo(x - 2.4, y - 4.4);
  g.lineTo(x - 2.4, y);
  g.moveTo(x + 2.4, y - 4.4);
  g.lineTo(x + 2.4, y);
  g.stroke();
  g.fillStyle = WOOLS[D.walnutPale].mid;
  g.beginPath();
  g.arc(x - 0.6, y - 5, 0.6, Math.PI, 0);
  g.fill();
  g.fillStyle = WOOLS[D.cream].mid;
  g.beginPath();
  g.arc(x + 1, y - 4.9, 0.5, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function rod(g: CanvasRenderingContext2D, x0: number, x1: number): void {
  const a = Math.max(-5, x0 - 2);
  const b = Math.min(CLOTH_LENGTH + 5, x1 + 2);
  if (b <= a) return;
  g.save();
  const grad = g.createLinearGradient(0, -5.6, 0, -2.6);
  grad.addColorStop(0, "#7d5a3a");
  grad.addColorStop(0.35, "#a67c52");
  grad.addColorStop(0.7, "#6a4a2e");
  grad.addColorStop(1, "#4a331f");
  g.fillStyle = grad;
  g.fillRect(a, -5.4, b - a, 2.8);
  // Grain.
  g.strokeStyle = "rgba(60,40,22,0.35)";
  g.lineWidth = 0.12;
  for (let y = -5; y < -2.8; y += 0.6) {
    g.beginPath();
    g.moveTo(a, y);
    g.lineTo(b, y + 0.1);
    g.stroke();
  }
  // Loops of linen holding the cloth.
  for (let x = Math.ceil(a / 16) * 16 + 4; x < Math.min(b, CLOTH_LENGTH - 2); x += 16) {
    if (x < 1) continue;
    // A tab of linen folded over the rod and stitched down.
    const lg = g.createLinearGradient(0, -6.4, 0, 0.3);
    lg.addColorStop(0, "#b3aa93");
    lg.addColorStop(0.18, LINEN.base);
    lg.addColorStop(0.5, "#d9d2bf");
    lg.addColorStop(0.62, "#a79e87");
    lg.addColorStop(1, LINEN.base);
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(x - 1.7, 0.3);
    g.lineTo(x - 1.7, -4.6);
    g.quadraticCurveTo(x - 1.7, -6.5, x, -6.5);
    g.quadraticCurveTo(x + 1.7, -6.5, x + 1.7, -4.6);
    g.lineTo(x + 1.7, 0.3);
    g.closePath();
    g.fill();
    g.strokeStyle = "rgba(70,58,38,0.4)";
    g.lineWidth = 0.1;
    g.stroke();
    g.strokeStyle = "rgba(106,77,52,0.8)";
    g.lineWidth = 0.14;
    g.setLineDash([0.4, 0.35]);
    g.beginPath();
    g.moveTo(x - 1.3, -1.4);
    g.lineTo(x + 1.3, -1.4);
    g.stroke();
    g.setLineDash([]);
  }
  // Finials at the ends.
  for (const x of [-3.6, CLOTH_LENGTH + 3.6]) {
    if (x < a - 3 || x > b + 3) continue;
    g.fillStyle = "#6a4a2e";
    g.beginPath();
    g.arc(x, -4, 1.9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(255,235,200,0.25)";
    g.beginPath();
    g.arc(x - 0.5, -4.6, 0.7, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

function looseThreads(g: CanvasRenderingContext2D, t: number, reduced: boolean): void {
  const threads: [number, number, number][] = [
    [1598, D.madder, 2.6],
    [1606, D.woad, 3.4],
    [1611, D.weld, 2.2],
    [1622, D.sage, 3],
    [1633, D.madderPale, 1.8],
    [1642, D.walnut, 2.8],
  ];
  g.save();
  g.lineCap = "round";
  for (const [x, wool, len] of threads) {
    const sway = reduced ? 0 : Math.sin(t / 1700 + x) * 1.1;
    g.strokeStyle = WOOLS[wool].dark;
    g.lineWidth = 0.46;
    g.beginPath();
    g.moveTo(x, 98.6);
    g.bezierCurveTo(x + 1.5, 100.5, x - 1 + sway, 100 + len * 0.5, x + sway * 1.4, 99.4 + len);
    g.stroke();
    g.strokeStyle = WOOLS[wool].light;
    g.lineWidth = 0.2;
    g.setLineDash([0.5, 0.4]);
    g.stroke();
    g.setLineDash([]);
  }
  g.restore();
}

/** Recover a patch spec from its key (keys carry everything needed). */
export function specFromKey(key: string): PatchSpec | null {
  const parts = key.split(":");
  switch (parts[0]) {
    case "strip":
      return { k: "strip", id: Number(parts[1]), state: parts[2] as PatchSpec & { k: "strip" } extends { state: infer S } ? S : never, flood: Number(parts[3]) / 5, fm: fmForSeason(Number(parts[4])) };
    case "meadow":
      return { k: "meadow", mown: Number(parts[1]), stacked: Number(parts[2]), carted: Number(parts[3]), fm: fmForSeason(Number(parts[4])) };
    case "grave":
      return { k: "grave", slot: Number(parts[1]), old: Number(parts[2]) };
    case "ins":
      return { k: "ins", slot: Number(parts[1]), la: parts.slice(2).join(":") };
    case "incipit":
      return { k: "incipit" };
    case "lowIncipit":
      return { k: "lowIncipit" };
    case "vig":
      return { k: "vig", slot: Number(parts[1]), kind: parts[2] as PatchSpec & { k: "vig" } extends { kind: infer K } ? K : never, la: parts.slice(3).join(":") };
    case "cottage":
      return { k: "cottage", building: parts[1] };
    case "bridge":
      return { k: "bridge" };
    case "river":
      return { k: "river", level: Number(parts[1]) };
    case "canopy":
      return { k: "canopy", tree: Number(parts[1]), season: Number(parts[2]) };
    case "moon":
      return { k: "moon", phase: Number(parts[1]), at: Number(parts[2]) };
    case "comet":
      return { k: "comet" };
  }
  return null;
}

function fmForSeason(season: number): number {
  return [0, 2, 3, 5, 8, 10][season] ?? 5;
}

export { Carry };
