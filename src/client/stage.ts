/**
 * The stage: walking along the hanging.
 *
 * The page scrolls vertically in the ordinary way; a tall "walk" section
 * holds a sticky stage, and how far down the section the visitor has
 * scrolled is how far along the cloth they have walked. Horizontal wheel and
 * trackpad gestures, arrow keys, horizontal swipes and the selvedge all move
 * the same scroll position, so nothing is hijacked and every input walks.
 *
 * The animation loop reads the scroll position each frame (no scroll
 * listeners), draws the cloth, and moves a few DOM overlays by transform.
 * Nothing per-frame goes into React state.
 */
import { SCENES, CLOTH_LENGTH, BAND, CHRONICLE_SLOTS, INSCRIPTION_SLOTS, LOWER_INCIPIT, sceneAt } from "../sim/geography";
import { PILGRIM, type SimEvent } from "../sim/types";
import { unpackState, type Env } from "../worker/protocol";
import { Renderer, type Camera, type WeaveEdge } from "../loom/renderer";
import { readParams, type Params } from "./params";
import { FrameMonitor, startingTier } from "./perf";
import { Store, initialUi, type Caption, type UiState } from "./store";
import { VillageClient, type Frame } from "./village-client";
import { actWords } from "./words";

export interface StageDom {
  walk: HTMLElement;
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  lens: HTMLCanvasElement;
  wall: HTMLElement | null;
  captions: (HTMLElement | null)[];
  windowMark: HTMLElement | null;
  strangerMark: HTMLElement | null;
  selectedMark: HTMLElement | null;
  youTag: HTMLElement | null;
  nameTag: HTMLElement | null;
  /** The name of whoever the pointer rests on. */
  hoverTag: HTMLElement | null;
  flipper: HTMLElement | null;
}

export interface Layout {
  W: number;
  H: number;
  k: number;
  top: number;
  cy0: number;
  cy1: number;
  camX0: number;
  camMax: number;
  walkPx: number;
  mobile: boolean;
  /** Height of the cloth band on screen, css px. */
  band: number;
}

const WEIGHTY = new Set<SimEvent["kind"]>(["death", "birth", "marriage", "stranger", "strangerGreeted", "strangerFollowed", "strangerDistrusted", "spate", "bridgeLost", "bridgeMended", "comet", "meteors", "sermon", "burial", "quarrel", "reconcile", "flockSaved", "reeve", "cottage", "postponed"]);

/** A still: a frozen copy of a frame, shown for a few seconds (reduced motion). */
interface StillView {
  cur: Frame | null;
  roster: VillageClient["roster"];
  position: VillageClient["position"];
}

export class Stage {
  readonly store = new Store<UiState>(initialUi);
  readonly client = new VillageClient();
  readonly renderer = new Renderer();
  readonly params: Params;
  private dom: StageDom | null = null;
  private raf = 0;
  private layout: Layout | null = null;
  private monitor: FrameMonitor;
  private env: Env | null = null;
  private lastGazeAt = 0;
  private lastGaze = -1;
  private lastInView = 0;
  private lastCaptionSlot = -1;
  private lastNightSet = -1;
  private flip = { active: false, start: 0, to: false };
  private lensAt: { x: number; y: number } | null = null;
  private weave: WeaveEdge[] | null = null;
  private narrateNext = 0;
  private lastDraw = { camX: NaN, frame: -1, t: 0 };
  private still: { frame: Frame | null; at: number; prev: Frame | null } = { frame: null, at: 0, prev: null };
  private followStopAt = 0;
  private touch: { id: number; x: number; y: number; moved: boolean } | null = null;
  /** Whoever the mouse rests on (not touch): named on the cloth, and the cursor offers them. */
  private hover: number | null = null;
  /** The English of a lower-border vignette under the pointer, or tapped. */
  private gloss: { text: string; x: number; until: number } | null = null;
  private keyTarget: number | null = null;
  private keyAt = 0;
  private disposers: (() => void)[] = [];
  private arrivedAt = 0;
  private ready = false;
  private reducedQuery: MediaQueryList | null = null;
  private visibleSince = performance.now();

  constructor() {
    this.params = readParams(typeof location !== "undefined" ? location.search : "");
    this.monitor = new FrameMonitor(startingTier(typeof innerWidth !== "undefined" ? innerWidth : 1200));
    this.monitor.onTier = (tier) => {
      this.store.set((s) => ({ perf: { ...s.perf, tier } }));
      this.relayout();
    };
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  start(): void {
    const p = this.params;
    this.reducedQuery = matchMedia("(prefers-reduced-motion: reduce)");
    const systemReduced = this.reducedQuery.matches;
    this.store.set({ still: p.still || systemReduced, systemReduced, debug: p.debug, speed: p.speed, paused: p.speed === 0, mobile: innerWidth < 720 });
    const onReduced = () => this.store.set({ systemReduced: this.reducedQuery!.matches, still: this.reducedQuery!.matches || this.store.get().still });
    this.reducedQuery.addEventListener("change", onReduced);
    this.disposers.push(() => this.reducedQuery?.removeEventListener("change", onReduced));

    this.renderer.start();
    this.wireClient();
    this.client.start({
      timeZone: p.timeZone,
      offsetMinutes: p.offsetMinutes,
      clockOffset: p.clockOffset,
      seed: p.seed,
      fresh: p.fresh,
      weather: p.weather,
      sky: p.sky,
      speed: p.speed,
      persist: p.persist,
      startX: p.startX,
    });

    const onVis = () => {
      const hidden = document.visibilityState === "hidden";
      this.client.visibility(hidden);
      cancelAnimationFrame(this.raf);
      if (!hidden) {
        this.visibleSince = performance.now();
        this.loop();
      }
    };
    // Opened in a background tab: nobody is looking yet.
    if (document.visibilityState === "hidden") this.client.visibility(true);
    document.addEventListener("visibilitychange", onVis);
    this.disposers.push(() => document.removeEventListener("visibilitychange", onVis));
    const onKey = (e: KeyboardEvent) => this.key(e);
    window.addEventListener("keydown", onKey);
    this.disposers.push(() => window.removeEventListener("keydown", onKey));
    const onResize = () => this.relayout();
    window.addEventListener("resize", onResize);
    this.disposers.push(() => window.removeEventListener("resize", onResize));
    const onPageHide = () => this.client.save();
    window.addEventListener("pagehide", onPageHide);
    this.disposers.push(() => window.removeEventListener("pagehide", onPageHide));
    if (p.debug || (typeof navigator !== "undefined" && navigator.webdriver)) this.exposeHooks();
    this.loop();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    for (const d of this.disposers) d();
    this.disposers = [];
    this.client.dispose();
    this.renderer.dispose();
    const w = window as unknown as { __ashcombe?: unknown };
    if (w.__ashcombe && (w.__ashcombe as { stage?: unknown }).stage === this) delete w.__ashcombe;
  }

  attach(dom: StageDom): () => void {
    this.dom = dom;
    this.relayout();
    const c = dom.canvas;
    const onClick = (e: MouseEvent) => this.click(e.clientX, e.clientY);
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      if (this.store.get().lens) {
        this.lensAt = { x: e.clientX, y: e.clientY };
        this.setHover(null);
        return;
      }
      const p = this.toCloth(e.clientX, e.clientY);
      const id = p ? this.renderer.hitTest(p.x, p.y) : null;
      this.setHover(id !== null && id !== PILGRIM && this.client.roster.has(id) ? id : null);
      this.setGloss(p ? this.glossAt(p.x, p.y) : null, Infinity);
    };
    const onLeave = () => {
      if (this.store.get().lens) this.lensAt = null;
      this.setHover(null);
      this.setGloss(null, 0);
    };
    const onWheel = (e: WheelEvent) => {
      // Horizontal gestures walk too; vertical ones already scroll the page.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 0.5) {
        window.scrollBy({ top: e.deltaX * (e.deltaMode === 1 ? 16 : 1), behavior: "instant" as ScrollBehavior });
        this.stopFollow();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") this.touch = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
      if (this.store.get().lens && e.pointerType === "touch") this.lensAt = { x: e.clientX, y: e.clientY };
    };
    const onPMove = (e: PointerEvent) => {
      const tc = this.touch;
      if (!tc || tc.id !== e.pointerId) return;
      const dx = e.clientX - tc.x;
      const dy = e.clientY - tc.y;
      if (this.store.get().lens) {
        this.lensAt = { x: e.clientX, y: e.clientY };
        return;
      }
      // A sideways swipe walks along the cloth; up and down the browser scrolls natively.
      if (Math.abs(dx) > Math.abs(dy) * 1.2) {
        window.scrollBy({ top: -dx, behavior: "instant" as ScrollBehavior });
        tc.x = e.clientX;
        tc.y = e.clientY;
        tc.moved = true;
        this.stopFollow();
      }
    };
    const onUp = (e: PointerEvent) => {
      if (this.touch?.id === e.pointerId) this.touch = null;
    };
    c.addEventListener("click", onClick);
    c.addEventListener("pointermove", onMove);
    c.addEventListener("pointerleave", onLeave);
    dom.stage.addEventListener("wheel", onWheel, { passive: true });
    c.addEventListener("pointerdown", onDown);
    c.addEventListener("pointermove", onPMove);
    c.addEventListener("pointerup", onUp);
    c.addEventListener("pointercancel", onUp);
    const ro = new ResizeObserver(() => this.relayout());
    ro.observe(dom.stage);
    return () => {
      c.removeEventListener("click", onClick);
      c.removeEventListener("pointermove", onMove);
      c.removeEventListener("pointerleave", onLeave);
      dom.stage.removeEventListener("wheel", onWheel);
      c.removeEventListener("pointerdown", onDown);
      c.removeEventListener("pointermove", onPMove);
      c.removeEventListener("pointerup", onUp);
      c.removeEventListener("pointercancel", onUp);
      ro.disconnect();
      this.dom = null;
    };
  }

  // -------------------------------------------------------------------------
  // The worker's news
  // -------------------------------------------------------------------------

  private wireClient(): void {
    const c = this.client;
    const s = this.store;
    this.disposers.push(
      c.onReady.on((r) => {
        this.ready = true;
        this.arrivedAt = performance.now();
        const firstVisit = r.visits.length <= 1;
        s.set({
          ready: true,
          founded: r.founded,
          resetReason: r.resetReason,
          absence: r.absence,
          returnOpen: !!r.absence,
          visits: r.visits,
          absences: r.absences,
          firstVisit,
        });
        // Returning: stand where the stranger was left.
        if (!r.founded && r.visits.length > 1 && this.params.startX === null) {
          const last = r.visits[r.visits.length - 2];
          if (last) requestAnimationFrame(() => this.walkTo(last.x, "auto"));
        } else if (this.params.startX !== null) {
          requestAnimationFrame(() => this.walkTo(this.params.startX!, "auto"));
        }
      }),
      c.onFrame.on((f) => {
        this.env = f.env;
      }),
      c.onScene.on((scene) => {
        this.updateCaptions(scene.inscriptions);
        const chronicle = scene.chronicle
          .slice()
          .sort((a, b) => b.t - a.t)
          .map((e) => ({ id: e.id, la: e.la, en: e.en, scene: SCENES.find((x) => x.id === e.scene)?.name ?? "", away: e.away !== null }));
        const prev = this.store.get().chronicle;
        if (prev.length !== chronicle.length || prev.some((p, i) => p.id !== chronicle[i].id)) this.store.set({ chronicle });
      }),
      c.onEvents.on((events) => this.onEvents(events)),
      c.onBio.on((bio) => s.set({ bio })),
      c.onRoll.on((roll) => s.set({ roll })),
      c.onSummary.on((lines) => s.set({ summary: lines })),
      c.onWeave.on((edges) => {
        this.weave = edges;
      }),
      c.onReturned.on((report) => s.set({ absence: report, returnOpen: true })),
      c.onSaved.on((at) => s.set({ savedAt: at })),
      c.onError.on((message) => s.set({ error: message })),
    );
  }

  private updateCaptions(ins: { slot: number; la: string; en: string }[]): void {
    const captions: Caption[] = INSCRIPTION_SLOTS.map((slot) => {
      const i = ins.find((x) => x.slot === slot.id);
      return { slot: slot.id, la: i?.la ?? "", en: i?.en ?? "", x0: slot.x0, x1: slot.x1 };
    });
    captions.unshift({ slot: -1, la: "HIC INCIPIT PANNUS DE ASHCOMBE", en: "Here begins the cloth of Ashcombe", x0: 6, x1: 132 });
    this.store.set({ captions });
  }

  private onEvents(events: SimEvent[]): void {
    const t = performance.now();
    const s = this.store.get();
    const add: { id: number; text: string; at: number }[] = [];
    for (const e of events) {
      if (e.kind === "bell") this.renderer.ringBell(t, 5);
      if (e.kind === "passingBell") this.renderer.ringBell(t, 12);
      if (e.kind === "marriage" || e.kind === "sermon") this.renderer.ringBell(t, 8);
      if (e.quiet || !WEIGHTY.has(e.kind)) continue;
      const text = e.text.charAt(0).toUpperCase() + e.text.slice(1);
      add.push({ id: Math.round(e.t) + add.length, text, at: e.t });
    }
    if (!add.length) return;
    const narrations = [...add.reverse(), ...s.narrations].slice(0, 40);
    const patch: Partial<UiState> = { narrations };
    // A polite, rate-limited voice for screen readers.
    if (s.narrate && t > this.narrateNext) {
      patch.announce = add[0].text;
      this.narrateNext = t + 15_000;
    }
    this.store.set(patch);
  }

  // -------------------------------------------------------------------------
  // Layout: how the band sits in the window, how far the walk goes
  // -------------------------------------------------------------------------

  relayout(): void {
    const dom = this.dom;
    if (!dom) return;
    const W = dom.stage.clientWidth || innerWidth;
    const H = dom.stage.clientHeight || innerHeight;
    const mobile = W < 720;
    const tablet = !mobile && W < 1100;
    const cy0 = mobile ? BAND.upper - 0.6 : 0;
    const cy1 = BAND.bottom;
    const topSpace = mobile ? 96 : H > 1100 ? 70 : 44;
    const bottomSpace = mobile ? 134 : H > 1100 ? 170 : 136;
    const avail = Math.max(160, H - topSpace - bottomSpace);
    const maxK = mobile ? 9.2 : W > 2000 ? 12.5 : 11;
    const k = Math.max(3.2, Math.min(maxK, avail / (cy1 - cy0)));
    const band = (cy1 - cy0) * k;
    const top = topSpace + Math.max(0, (avail - band) * 0.42);
    const wallFrac = mobile ? 0.6 : tablet ? 0.52 : W > 2000 ? 0.3 : 0.37;
    const camX0 = -(W * wallFrac) / k;
    const camMax = CLOTH_LENGTH + 26 - W / k;
    const walkPx = Math.max(0, (camMax - camX0) * k);
    this.layout = { W, H, k, top, cy0, cy1, camX0, camMax, walkPx, mobile, band };
    const dpr = this.dpr();
    for (const cv of [dom.canvas]) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cv.style.width = `${W}px`;
      cv.style.height = `${H}px`;
    }
    dom.walk.style.setProperty("--walk", `${Math.round(walkPx)}px`);
    document.documentElement.style.setProperty("--band-top", `${Math.round(top)}px`);
    document.documentElement.style.setProperty("--band-h", `${Math.round(band)}px`);
    document.documentElement.style.setProperty("--band-bottom", `${Math.round(top + band)}px`);
    if (this.store.get().mobile !== mobile) this.store.set({ mobile });
    this.lastDraw.camX = NaN;
  }

  private dpr(): number {
    const tier = this.monitor.tier;
    const raw = window.devicePixelRatio || 1;
    return tier >= 3 ? 0.75 : tier >= 2 ? Math.min(raw, 1) : Math.min(raw, 2);
  }

  /** Cloth x at the left of the view, from the scroll position. */
  camX(): number {
    const L = this.layout;
    const dom = this.dom;
    if (!L || !dom) return 0;
    const top = dom.walk.offsetTop;
    const s = Math.min(L.walkPx, Math.max(0, scrollY - top));
    return L.camX0 + s / L.k;
  }

  /** Walk so that cloth x is near the middle of the view. */
  walkTo(x: number, behavior: ScrollBehavior = "smooth"): void {
    const L = this.layout;
    const dom = this.dom;
    if (!L || !dom) return;
    const viewU = L.W / L.k;
    const cam = Math.max(L.camX0, Math.min(L.camMax, x - viewU * 0.5));
    const top = dom.walk.offsetTop + (cam - L.camX0) * L.k;
    const reduced = this.store.get().still || this.store.get().systemReduced;
    window.scrollTo({ top, behavior: reduced ? "auto" : behavior });
  }

  walkToScene(id: string): void {
    const s = SCENES.find((x) => x.id === id);
    if (!s) return;
    this.stopFollow();
    this.walkTo(id === "end" ? CLOTH_LENGTH - 60 : (s.x0 + s.x1) / 2);
  }

  walkToStart(): void {
    const dom = this.dom;
    if (!dom) return;
    this.stopFollow();
    window.scrollTo({ top: dom.walk.offsetTop, behavior: this.store.get().still ? "auto" : "smooth" });
  }

  private key(e: KeyboardEvent): void {
    const tgt = e.target as HTMLElement | null;
    if (tgt && (tgt.closest("input, textarea, select, [contenteditable], table, dialog[open]") || tgt.isContentEditable)) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const L = this.layout;
    if (!L || !this.inWalk()) return;
    const step = e.shiftKey ? L.W * 0.8 : 110;
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    this.stopFollow();
    // Presses in quick succession add up (a smooth scroll would otherwise restart from where it is).
    const now = performance.now();
    const base = this.keyTarget !== null && now - this.keyAt < 700 ? this.keyTarget : scrollY;
    const top = this.dom!.walk.offsetTop;
    this.keyTarget = Math.max(top, Math.min(top + L.walkPx, base + (e.key === "ArrowRight" ? step : -step)));
    this.keyAt = now;
    window.scrollTo({ top: this.keyTarget, behavior: this.store.get().still || this.store.get().systemReduced ? "auto" : "smooth" });
  }

  inWalk(): boolean {
    const dom = this.dom;
    const L = this.layout;
    if (!dom || !L) return false;
    const top = dom.walk.offsetTop;
    return scrollY >= top - 40 && scrollY <= top + L.walkPx + 40;
  }

  // -------------------------------------------------------------------------
  // Interaction
  // -------------------------------------------------------------------------

  private toCloth(clientX: number, clientY: number): { x: number; y: number } | null {
    const L = this.layout;
    const dom = this.dom;
    if (!L || !dom) return null;
    const r = dom.canvas.getBoundingClientRect();
    let sx = clientX - r.left;
    if (this.store.get().back) sx = L.W - sx;
    const sy = clientY - r.top;
    return { x: this.camX() + sx / L.k, y: L.cy0 + (sy - L.top) / L.k };
  }

  clothToClient(x: number, y: number): { x: number; y: number } | null {
    const L = this.layout;
    const dom = this.dom;
    if (!L || !dom) return null;
    const r = dom.canvas.getBoundingClientRect();
    let sx = (x - this.camX()) * L.k;
    if (this.store.get().back) sx = L.W - sx;
    return { x: r.left + sx, y: r.top + L.top + (y - L.cy0) * L.k };
  }

  private setHover(id: number | null): void {
    if (id === this.hover) return;
    this.hover = id;
    this.lastDraw.camX = NaN;
    const dom = this.dom;
    if (!dom) return;
    dom.canvas.style.cursor = id === null ? "" : "pointer";
    if (id !== null) this.gloss = null;
    if (dom.hoverTag) {
      dom.hoverTag.classList.remove("is-gloss");
      const look = id === null ? undefined : this.client.roster.get(id);
      dom.hoverTag.textContent = look ? look.name : "";
      if (!look) dom.hoverTag.style.opacity = "0";
    }
  }

  /** The lower-border vignette at a cloth point, in English. */
  private glossAt(x: number, y: number): { text: string; x: number } | null {
    if (this.store.get().back || y < BAND.lower || y > BAND.bottom) return null;
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const chron = this.client.scene?.chronicle ?? [];
    if (x >= LOWER_INCIPIT.x0 && x <= LOWER_INCIPIT.x1) {
      const inc = chron.find((c) => c.kind === "incipit");
      return inc ? { text: cap(inc.en), x: (LOWER_INCIPIT.x0 + LOWER_INCIPIT.x1) / 2 } : null;
    }
    const slot = CHRONICLE_SLOTS.find((s) => x >= s.x0 && x <= s.x1);
    const e = slot ? chron.find((c) => c.slot === slot.id) : undefined;
    return slot && e ? { text: cap(e.en), x: (slot.x0 + slot.x1) / 2 } : null;
  }

  private setGloss(g: { text: string; x: number } | null, until: number): void {
    const dom = this.dom;
    if (!dom?.hoverTag) return;
    if (!g) {
      // A tapped gloss stays a few seconds; a hovered one goes with the pointer.
      if (this.gloss && this.gloss.until === Infinity) {
        this.gloss = null;
        this.lastDraw.camX = NaN;
      }
      return;
    }
    if (this.hover !== null) return;
    if (!this.gloss || this.gloss.text !== g.text) {
      dom.hoverTag.textContent = g.text;
      dom.hoverTag.classList.add("is-gloss");
      this.lastDraw.camX = NaN;
    }
    this.gloss = { ...g, until };
  }

  private click(clientX: number, clientY: number): void {
    if (this.touch?.moved) return;
    const p = this.toCloth(clientX, clientY);
    if (!p) return;
    const g = this.glossAt(p.x, p.y);
    if (g) {
      this.setHover(null);
      this.setGloss(g, performance.now() + 5000);
      return;
    }
    const id = this.renderer.hitTest(p.x, p.y);
    if (id !== null && id !== PILGRIM && this.client.roster.has(id)) this.select(id);
    else if (this.store.get().selected !== null && id === null) this.select(null);
  }

  select(id: number | null): void {
    this.store.set({ selected: id, bio: id === null ? null : this.store.get().bio?.id === id ? this.store.get().bio : null, follow: false });
    this.client.inspect(id);
    if (id !== null && !this.inWalk()) {
      // Chosen from the roll: go to them on the cloth.
      const p = this.client.position(id, performance.now());
      if (p) this.walkTo(p.x, "auto");
    }
  }

  follow(on: boolean): void {
    this.store.set({ follow: on });
    this.followStopAt = 0;
  }

  private stopFollow(): void {
    if (this.store.get().follow) this.store.set({ follow: false });
  }

  setSpeed(speed: number): void {
    this.client.speed(speed);
    this.store.set({ speed, paused: speed === 0 });
  }

  togglePause(): void {
    const s = this.store.get();
    this.setSpeed(s.paused ? 1 : 0);
  }

  toggleHasten(): void {
    const s = this.store.get();
    this.setSpeed(s.speed > 1 ? 1 : 6);
  }

  toggleLens(): void {
    const on = !this.store.get().lens;
    this.store.set({ lens: on });
    if (!on) this.lensAt = null;
    else if (this.layout) {
      const r = this.dom?.canvas.getBoundingClientRect();
      if (r) this.lensAt = { x: r.left + this.layout.W / 2, y: r.top + this.layout.top + this.layout.band * 0.62 };
    }
  }

  moveLens(dx: number, dy: number): void {
    const r = this.dom?.canvas.getBoundingClientRect();
    if (!r || !this.lensAt) return;
    this.lensAt = { x: Math.max(r.left, Math.min(r.right, this.lensAt.x + dx)), y: Math.max(r.top, Math.min(r.bottom, this.lensAt.y + dy)) };
  }

  toggleBack(): void {
    const to = !this.store.get().back;
    const reduced = this.store.get().still || this.store.get().systemReduced;
    this.client.weave(to);
    if (reduced) {
      this.store.set({ back: to });
      return;
    }
    this.flip = { active: true, start: performance.now(), to };
  }

  openSummary(): void {
    this.client.summary();
    this.store.set({ summaryOpen: true, summary: null });
  }

  setStill(on: boolean): void {
    this.store.set({ still: on });
  }

  setNarrate(on: boolean): void {
    this.store.set({ narrate: on });
  }

  // -------------------------------------------------------------------------
  // The loop
  // -------------------------------------------------------------------------

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    const t = performance.now();
    const dom = this.dom;
    const L = this.layout;
    if (!dom || !L) return;
    const ui = this.store.get();
    const reduced = ui.still || ui.systemReduced;
    const tier = this.monitor.tier;
    if (tier >= 3 && t - this.lastDraw.t < 30) return;

    // Following a villager: the view keeps them in the middle (not in reduced motion).
    if (ui.follow && ui.selected !== null) {
      const p = this.client.position(ui.selected, t);
      if (p && !reduced) {
        const viewU = L.W / L.k;
        const want = p.x - viewU * 0.5;
        const cur = this.camX();
        const next = cur + (want - cur) * 0.08;
        const top = dom.walk.offsetTop + (Math.max(L.camX0, Math.min(L.camMax, next)) - L.camX0) * L.k;
        if (Math.abs(next - cur) > 0.05) window.scrollTo({ top, behavior: "instant" as ScrollBehavior });
      } else if (p && reduced && t > this.followStopAt) {
        // In reduced motion, following is a jump every few seconds, not a glide.
        this.walkTo(p.x, "auto");
        this.followStopAt = t + 4000;
      }
    }

    const camX = this.camX();
    const viewU = L.W / L.k;
    // Where the visitor is standing: the stranger walks there.
    const centre = camX + viewU * (L.mobile ? 0.5 : 0.5);
    if (this.ready && (Math.abs(centre - this.lastGaze) > 1.5 || t - this.lastGazeAt > 2000) && t - this.lastGazeAt > 120) {
      this.client.gaze(Math.max(4, centre));
      this.lastGaze = centre;
      this.lastGazeAt = t;
    }

    // The flip of the cloth.
    let back = ui.back;
    if (this.flip.active) {
      const p = Math.min(1, (t - this.flip.start) / 900);
      const angle = p < 0.5 ? p * 2 * 90 : (1 - p) * 2 * -90;
      if (p >= 0.5 && ui.back !== this.flip.to) {
        this.store.set({ back: this.flip.to });
        back = this.flip.to;
      }
      if (dom.flipper) dom.flipper.style.transform = p >= 1 ? "" : `perspective(1400px) rotateY(${angle}deg)`;
      if (p >= 1) this.flip.active = false;
    }

    // Reduced motion: a still that changes every few seconds.
    let view: StillView = this.client;
    if (reduced) {
      if (!this.still.frame || t - this.still.at > 4000) {
        // A copy: the live frame's buffers go back to the worker for reuse.
        const c = this.client.cur;
        this.still = { frame: c ? { ...c, f: c.f.slice(), u: c.u.slice(), index: new Map(c.index), buffers: [] } : null, prev: null, at: t };
      }
      const frame = this.still.frame;
      view = {
        cur: frame,
        roster: this.client.roster,
        position: (id: number) => {
          if (!frame) return null;
          const i = frame.index.get(id);
          if (i === undefined) return null;
          return { x: frame.f[i * 2], y: frame.f[i * 2 + 1], state: unpackState(frame.u[i * 2 + 1]) };
        },
      };
    }

    const stranger = reduced ? (this.still.frame?.stranger ?? this.client.cur?.stranger ?? null) : (this.client.cur?.stranger ?? null);
    const env = this.env;
    const frameNo = this.client.framesReceived;
    // A stayed needle stops everything that moves by itself; only what the visitor does is drawn.
    const paused = (env?.speed ?? 1) === 0;
    const animating =
      this.flip.active ||
      ui.lens ||
      this.renderer.cache.stats().pending > 0 ||
      (!paused && (this.renderer.busy() || (env?.rain ?? 0) > 0.05 || (env?.skyShow ?? false) || !reduced));
    const moved = camX !== this.lastDraw.camX;
    const changed = frameNo !== this.lastDraw.frame;
    // Idle and still: draw rarely.
    if (!moved && !changed && !animating && t - this.lastDraw.t < 500) {
      this.monitor.tick(t, false);
      return;
    }
    this.monitor.tick(t, true);
    this.lastDraw = { camX, frame: frameNo, t };

    const cam: Camera = { x0: camX, k: L.k, top: L.top, cy0: L.cy0, cy1: L.cy1, W: L.W, H: L.H, dpr: this.dpr() };
    const g = dom.canvas.getContext("2d");
    if (!g) return;
    this.renderer.draw(g, cam, {
      t,
      client: view as VillageClient,
      scene: this.client.scene,
      env,
      stranger,
      selected: ui.selected,
      back,
      reduced,
      tier,
      weave: this.weave,
      frozen: reduced,
      stillAt: this.still.at,
    });
    this.drawLens(cam, view as VillageClient, stranger, env, reduced, back, t);
    this.overlays(cam, camX, t, stranger);
    this.human(t, env, camX);
    if (t % 5000 < 20) this.renderer.cache.sweep();
  };

  private drawLens(cam: Camera, view: VillageClient, stranger: Frame["stranger"] | null, env: Env | null, reduced: boolean, back: boolean, t: number): void {
    const dom = this.dom!;
    const ui = this.store.get();
    const lens = dom.lens;
    if (!ui.lens || !this.lensAt) {
      lens.style.display = "none";
      return;
    }
    const R = this.layout!.mobile ? 86 : 120;
    const mag = 3;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = R * 2;
    if (lens.width !== Math.round(size * dpr)) {
      lens.width = Math.round(size * dpr);
      lens.height = Math.round(size * dpr);
      lens.style.width = `${size}px`;
      lens.style.height = `${size}px`;
    }
    const r = dom.canvas.getBoundingClientRect();
    const cx = this.lensAt.x - r.left;
    const cy = this.lensAt.y - r.top;
    lens.style.display = "block";
    lens.style.transform = `translate3d(${Math.round(this.lensAt.x - R)}px, ${Math.round(this.lensAt.y - R)}px, 0)`;
    const g = lens.getContext("2d");
    if (!g) return;
    const k = cam.k * mag;
    const sx = back ? cam.W - cx : cx;
    const clothX = cam.x0 + sx / cam.k;
    const clothY = cam.cy0 + (cy - cam.top) / cam.k;
    const lcam: Camera = { x0: clothX - R / k, k, top: R - (clothY - cam.cy0) * k, cy0: cam.cy0, cy1: cam.cy1, W: size, H: size, dpr };
    this.renderer.draw(g, lcam, { t, client: view, scene: this.client.scene, env, stranger, selected: ui.selected, back, reduced, tier: 0, weave: this.weave, frozen: reduced }, true);
  }

  /** Per-frame DOM: the wall moves with the cloth, captions sit under their inscriptions. */
  private overlays(cam: Camera, camX: number, t: number, stranger: Frame["stranger"] | null): void {
    const dom = this.dom!;
    const L = this.layout!;
    const ui = this.store.get();
    const shift = -(camX - L.camX0) * L.k;
    if (dom.wall) dom.wall.style.transform = `translate3d(${Math.round(shift)}px,0,0)`;
    // Captions under their slots (desktop).
    if (!L.mobile) {
      ui.captions.forEach((c, i) => {
        const el = dom.captions[i];
        if (!el) return;
        const mid = ((c.x0 + c.x1) / 2 - camX) * L.k;
        const halfW = ((c.x1 - c.x0) / 2) * L.k;
        const visible = mid + halfW > 40 && mid - halfW < L.W - 40 && !ui.back && c.en;
        if (!visible) {
          if (el.dataset.v !== "0") {
            el.style.opacity = "0";
            el.dataset.v = "0";
          }
          return;
        }
        el.dataset.v = "1";
        el.style.opacity = "1";
        const x = Math.max(16 + 140, Math.min(L.W - 16 - 140, mid));
        el.style.transform = `translate3d(${Math.round(x)}px,0,0) translateX(-50%)`;
      });
    } else {
      // Mobile: one caption, the inscription nearest the middle of the view.
      const centre = camX + L.W / L.k / 2;
      let best = -1;
      let bd = Infinity;
      ui.captions.forEach((c, i) => {
        const d = Math.abs((c.x0 + c.x1) / 2 - centre);
        if (c.en && d < bd) {
          bd = d;
          best = i;
        }
      });
      if (best !== this.lastCaptionSlot) {
        this.lastCaptionSlot = best;
        dom.captions.forEach((el, i) => {
          if (el) el.dataset.current = i === best ? "1" : "0";
        });
      }
    }
    // The selvedge: where you are along the whole cloth.
    const total = CLOTH_LENGTH;
    const a = Math.max(0, camX) / total;
    const b = Math.min(total, camX + L.W / L.k) / total;
    if (dom.windowMark) dom.windowMark.style.transform = `translateX(${(a * 100).toFixed(3)}%) scaleX(${Math.max(0.002, b - a).toFixed(4)})`;
    if (dom.strangerMark && stranger) dom.strangerMark.style.transform = `translateX(${((stranger.x / total) * 100).toFixed(3)}cqw)`;
    if (dom.selectedMark) {
      const p = ui.selected !== null ? this.client.position(ui.selected, t) : null;
      dom.selectedMark.style.display = p ? "block" : "none";
      if (p) dom.selectedMark.style.transform = `translateX(${((p.x / total) * 100).toFixed(3)}cqw)`;
    }
    // "You": a small tag by the stranger on a first visit, until they have walked a while.
    if (dom.youTag) {
      const show = stranger && stranger.present && !ui.back && (ui.firstVisit ? t - this.arrivedAt < 100_000 : t - this.arrivedAt < 12_000);
      if (show && stranger) {
        const sx = (stranger.x - camX) * L.k;
        const sy = L.top + (stranger.y - L.cy0) * L.k;
        dom.youTag.style.opacity = sx > -40 && sx < L.W + 40 ? "1" : "0";
        dom.youTag.style.transform = `translate3d(${Math.round(sx)}px, ${Math.round(sy)}px, 0)`;
      } else dom.youTag.style.opacity = "0";
    }
    // The name of whoever the pointer rests on (unless they are already chosen).
    if (this.gloss && this.gloss.until !== Infinity && t > this.gloss.until) this.gloss = null;
    if (dom.hoverTag && this.gloss && this.hover === null) {
      let sx = (this.gloss.x - camX) * L.k;
      if (ui.back) sx = L.W - sx;
      const half = dom.hoverTag.offsetWidth / 2 + 8;
      sx = Math.max(half, Math.min(L.W - half, sx));
      const sy = L.top + (BAND.lower - 0.6 - L.cy0) * L.k;
      dom.hoverTag.style.opacity = "1";
      dom.hoverTag.style.transform = `translate3d(${Math.round(sx)}px, ${Math.round(sy)}px, 0) translate(-50%, -100%)`;
    } else if (dom.hoverTag) {
      const id = this.hover !== ui.selected ? this.hover : null;
      const p = id !== null ? this.client.position(id, t) : null;
      const look = id !== null ? this.client.roster.get(id) : undefined;
      if (p && look && !p.state.inside) {
        let sx = (p.x - camX) * L.k;
        if (ui.back) sx = L.W - sx;
        const sy = L.top + (p.y - look.height - 4 - L.cy0) * L.k;
        dom.hoverTag.style.opacity = "1";
        dom.hoverTag.style.transform = `translate3d(${Math.round(sx)}px, ${Math.round(sy)}px, 0) translate(-50%, -100%)`;
      } else dom.hoverTag.style.opacity = "0";
    }
    // The selected villager's name.
    if (dom.nameTag) {
      const p = ui.selected !== null ? this.client.position(ui.selected, t) : null;
      const look = ui.selected !== null ? this.client.roster.get(ui.selected) : undefined;
      if (p && look && !p.state.inside) {
        let sx = (p.x - camX) * L.k;
        if (ui.back) sx = L.W - sx;
        const sy = L.top + (p.y - look.height - 4 - L.cy0) * L.k;
        dom.nameTag.style.opacity = sx > 0 && sx < L.W ? "1" : "0";
        dom.nameTag.style.transform = `translate3d(${Math.round(sx)}px, ${Math.round(sy)}px, 0) translate(-50%, -100%)`;
      } else dom.nameTag.style.opacity = "0";
    }
  }

  /** Things at human pace: the list of people in view, the scene name, the hall at night. */
  private human(t: number, env: Env | null, camX: number): void {
    const L = this.layout!;
    if (env) {
      const night = Math.round((1 - env.daylight) * 20) / 20;
      if (night !== this.lastNightSet) {
        this.lastNightSet = night;
        document.documentElement.style.setProperty("--night", String(night));
        this.store.set({ night });
      }
      if (Math.abs(env.ahead - this.store.get().ahead) > 30_000) this.store.set({ ahead: env.ahead });
    }
    if (t - this.lastInView < 1500) return;
    this.lastInView = t;
    const scene = sceneAt(Math.max(0, camX + L.W / L.k / 2)).name;
    const cur = this.client.cur;
    const inView = this.renderer.drawn
      .map((d) => {
        const look = this.client.roster.get(d.id);
        const i = cur?.index.get(d.id);
        if (!look || i === undefined || !cur) return null;
        const st = unpackState(cur.u[i * 2 + 1]);
        return { id: d.id, name: look.name, doing: actWords(st.act, st.work, st.carry), x: d.x };
      })
      .filter((x): x is { id: number; name: string; doing: string; x: number } => !!x)
      .sort((a, b) => a.x - b.x)
      .slice(0, 24)
      .map(({ id, name, doing }) => ({ id, name, doing }));
    const perf = { fps: Math.round(this.monitor.fps), p90: Math.round(this.monitor.p90), tier: this.monitor.tier, figures: this.renderer.figuresDrawn, msPerStep: Math.round(this.client.msPerStep * 100) / 100, tiles: this.renderer.cache.stats().tiles, pending: this.renderer.cache.stats().pending };
    const prev = this.store.get();
    const sameView = prev.inView.length === inView.length && prev.inView.every((p, i) => p.id === inView[i].id && p.doing === inView[i].doing);
    this.store.set({ inView: sameView ? prev.inView : inView, scene, perf: prev.debug ? perf : prev.perf });
  }

  // -------------------------------------------------------------------------
  // Read-only views for the browser tests (and the curious)
  // -------------------------------------------------------------------------

  private exposeHooks(): void {
    const w = window as unknown as Record<string, unknown>;
    w.__ashcombe = {
      stage: this,
      ready: () => this.ready && !!this.client.cur,
      tick: () => this.client.cur?.tick ?? 0,
      now: () => this.client.cur?.now ?? 0,
      frames: () => this.client.framesReceived,
      population: () => this.client.roster.size,
      positions: (n = 400) => {
        const c = this.client.cur;
        if (!c) return [];
        const out: { id: number; x: number; y: number; kind: number; act: number; inside: boolean }[] = [];
        for (let i = 0; i < Math.min(n, c.n); i++) {
          const st = unpackState(c.u[i * 2 + 1]);
          out.push({ id: c.u[i * 2], x: c.f[i * 2], y: c.f[i * 2 + 1], kind: st.kind, act: st.act, inside: st.inside });
        }
        return out;
      },
      stranger: () => this.client.cur?.stranger ?? null,
      env: () => this.env,
      scene: () => this.client.scene,
      camX: () => this.camX(),
      clothToClient: (x: number, y: number) => this.clothToClient(x, y),
      hits: () => this.renderer.hits.slice(),
      ui: () => {
        const s = this.store.get();
        return { selected: s.selected, bio: s.bio, back: s.back, lens: s.lens, still: s.still, paused: s.paused, speed: s.speed, absence: s.absence, visits: s.visits, inView: s.inView, founded: s.founded };
      },
      walkTo: (x: number) => this.walkTo(x, "auto"),
      force: (what: string) => this.client.force(what as never),
      save: () => this.client.save(),
      savedAt: () => this.store.get().savedAt,
      roster: () => [...this.client.roster.values()],
      perf: () => ({ timing: { ...this.renderer.timing }, fps: this.monitor.fps, p90: this.monitor.p90, tier: this.monitor.tier, figures: this.renderer.figuresDrawn, cache: this.renderer.cache.stats(), msPerStep: this.client.msPerStep, animT: this.renderer.animT, busy: this.renderer.busy(), needle: !!this.renderer.needle.active, queue: this.renderer.needle.queue.length, bellUntil: this.renderer.bellUntil, env: this.env }),
      needle: () => ({ active: this.renderer.needle.active?.item ?? null, queued: this.renderer.needle.queue.length }),
    };
  }
}
