/**
 * Saving and restoring the village. The snapshot is the whole state as
 * plain data with a schema number; a save from an older schema, or one that
 * does not look like a village, is refused and a new village founded.
 */
import { SCHEMA } from "./constants";
import { Village } from "./core";
import type { Settings, VillageState } from "./types";

export interface Snapshot {
  schema: number;
  savedAt: number;
  state: VillageState;
}

export function serialize(vil: Village): Snapshot {
  vil.saveRng();
  return { schema: SCHEMA, savedAt: vil.s.now, state: vil.s };
}

export type Restore = { ok: true; vil: Village } | { ok: false; reason: "schema" | "corrupt" };

export function deserialize(snap: unknown, settings: Settings): Restore {
  if (!snap || typeof snap !== "object") return { ok: false, reason: "corrupt" };
  const s = snap as Partial<Snapshot>;
  if (s.schema !== SCHEMA) return { ok: false, reason: "schema" };
  const st = s.state as VillageState | undefined;
  if (!st || !looksLikeVillage(st)) return { ok: false, reason: "corrupt" };
  try {
    const vil = new Village(st, settings);
    return { ok: true, vil };
  } catch {
    return { ok: false, reason: "corrupt" };
  }
}

function looksLikeVillage(st: VillageState): boolean {
  return (
    Array.isArray(st.villagers) &&
    Array.isArray(st.households) &&
    Array.isArray(st.strips) &&
    Array.isArray(st.animals) &&
    Array.isArray(st.chronicle) &&
    Array.isArray(st.rng) &&
    st.rng.length === 4 &&
    typeof st.now === "number" &&
    Number.isFinite(st.now) &&
    st.villagers.length > 0 &&
    typeof st.stranger === "object"
  );
}
