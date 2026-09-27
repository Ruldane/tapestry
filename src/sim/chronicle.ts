/**
 * The lower border: a stitched chronicle of what happened, set under the
 * scene where it happened. Each scene has a few vignette slots; a new entry
 * takes a free slot or unpicks the oldest there. Every entry stays in the
 * parish roll whether or not it still has a place on the cloth.
 */
import { CHRONICLE_MAX } from "./constants";
import type { Village } from "./core";
import { CHRONICLE_SLOTS, GRAVE_SLOTS, type SceneId } from "./geography";
import type { ChronicleEntry, ChronicleKind, Villager } from "./types";
import type { Line } from "../text/latin";

/** Set while the absence model runs, so entries are marked as stitched while away. */
export const awayMark: { id: number | null } = { id: null };

export function addEntry(vil: Village, kind: ChronicleKind, line: Line, scene: SceneId, actors: number[] = []): ChronicleEntry {
  const s = vil.s;
  const slots = CHRONICLE_SLOTS.filter((c) => c.scene === scene);
  const taken = new Map<number, ChronicleEntry>();
  for (const e of s.chronicle) if (e.slot >= 0) taken.set(e.slot, e);
  let slot = slots.find((c) => !taken.has(c.id))?.id ?? -1;
  if (slot < 0 && slots.length) {
    // Unpick the oldest in this scene (never the incipit).
    const candidates = slots.map((c) => taken.get(c.id)!).filter((e) => e.kind !== "incipit");
    candidates.sort((a, b) => a.t - b.t);
    const old = candidates[0];
    if (old) {
      slot = old.slot;
      old.slot = -1;
    }
  }
  const entry: ChronicleEntry = {
    id: s.nextEntry++,
    t: s.now,
    kind,
    la: line.la,
    en: line.en,
    scene,
    slot,
    away: awayMark.id,
    actors,
  };
  s.chronicle.push(entry);
  if (s.chronicle.length > CHRONICLE_MAX) {
    const i = s.chronicle.findIndex((e) => e.slot < 0 && e.kind !== "incipit");
    s.chronicle.splice(i >= 0 ? i : 1, 1);
  }
  vil.emit({ kind: "chronicle", x: 0, actors, text: line.en, quiet: true, data: { entry: entry.id, slot } });
  return entry;
}

/** A grave in the churchyard: the next free place, or over the oldest. */
export function dig(vil: Village, v: Villager, name: string): number {
  const s = vil.s;
  const used = new Set(s.graves.map((g) => g.slot));
  let slot = GRAVE_SLOTS.findIndex((_, i) => !used.has(i));
  if (slot < 0) {
    const oldest = s.graves.reduce((a, b) => (a.t < b.t ? a : b));
    slot = oldest.slot;
    s.graves.splice(s.graves.indexOf(oldest), 1);
  }
  s.graves.push({ slot, villager: v.id, name, t: s.now });
  return slot;
}
