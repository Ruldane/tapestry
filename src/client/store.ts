/**
 * A small external store for UI state that changes at human pace: the
 * tools, the selected villager's biography, the parish roll, the captions,
 * the notes. Per-frame values never go here.
 */
import { useSyncExternalStore } from "react";
import type { Biography, Roll } from "../sim/census";
import type { AbsenceReport } from "../sim/catchup";
import type { AbsenceNote, Visit } from "../sim/types";

export interface Caption {
  slot: number;
  la: string;
  en: string;
  /** Screen x (css px) of the slot's centre; updated per frame through the DOM, not here. */
  x0: number;
  x1: number;
}

export interface Narration {
  id: number;
  text: string;
  at: number;
}

export interface InViewPerson {
  id: number;
  name: string;
  doing: string;
}

export interface UiState {
  ready: boolean;
  error: string | null;
  speed: number;
  paused: boolean;
  lens: boolean;
  back: boolean;
  follow: boolean;
  selected: number | null;
  bio: Biography | null;
  roll: Roll | null;
  summary: string[] | null;
  summaryOpen: boolean;
  captions: Caption[];
  narrations: Narration[];
  announce: string;
  narrate: boolean;
  founded: boolean;
  resetReason: "schema" | "corrupt" | null;
  absence: AbsenceReport | null;
  returnOpen: boolean;
  visits: Visit[];
  absences: AbsenceNote[];
  still: boolean;
  systemReduced: boolean;
  debug: boolean;
  perf: { fps: number; p90: number; tier: number; figures: number; msPerStep: number; tiles: number; pending: number };
  savedAt: number | null;
  inView: InViewPerson[];
  night: number;
  mobile: boolean;
  firstVisit: boolean;
  scene: string;
  ahead: number;
  /** Scenes with fresh vignettes since the visitor was last here. */
  freshScenes: string[];
  /** The lower border's entries, as stitched (for the roll and for screen readers). */
  chronicle: { id: number; la: string; en: string; scene: string; away: boolean }[];
}

export const initialUi: UiState = {
  ready: false,
  error: null,
  speed: 1,
  paused: false,
  lens: false,
  back: false,
  follow: false,
  selected: null,
  bio: null,
  roll: null,
  summary: null,
  summaryOpen: false,
  captions: [],
  narrations: [],
  announce: "",
  narrate: true,
  founded: false,
  resetReason: null,
  absence: null,
  returnOpen: false,
  visits: [],
  absences: [],
  still: false,
  systemReduced: false,
  debug: false,
  perf: { fps: 0, p90: 0, tier: 0, figures: 0, msPerStep: 0, tiles: 0, pending: 0 },
  savedAt: null,
  inView: [],
  night: 0,
  mobile: false,
  firstVisit: true,
  scene: "The forest edge",
  ahead: 0,
  freshScenes: [],
  chronicle: [],
};

export class Store<T extends object> {
  private state: T;
  private listeners = new Set<() => void>();
  constructor(initial: T) {
    this.state = initial;
  }
  get = (): T => this.state;
  set(patch: Partial<T> | ((s: T) => Partial<T>)): void {
    const p = typeof patch === "function" ? patch(this.state) : patch;
    let changed = false;
    for (const k in p) {
      if (!Object.is(this.state[k], p[k])) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.state = { ...this.state, ...p };
    for (const l of this.listeners) l();
  }
  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };
}

export function useStoreValue<T extends object, R>(store: Store<T>, select: (s: T) => R): R {
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.get()),
    () => select(store.get()),
  );
}
