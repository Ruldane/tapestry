/**
 * Ashcombe laid out along the cloth, in cloth units. The hanging is 100
 * units tall: an upper border (0..13), the main field (13..87) and the
 * lower border (87..100). It runs from the forest edge at the left hem to the
 * unfinished end on the right.
 *
 * The simulation and the renderer share this layout, so a villager standing
 * at (x, y) in the world is drawn at exactly that place on the linen.
 */

export const CLOTH_LENGTH = 1680;
export const BAND = { top: 0, upper: 13, lower: 87, bottom: 100 } as const;

export type SceneId = "forest" | "fields" | "river" | "green" | "manor" | "common" | "end";

export interface Scene {
  id: SceneId;
  name: string;
  x0: number;
  x1: number;
}

export const SCENES: readonly Scene[] = [
  { id: "forest", name: "The forest edge", x0: 0, x1: 238 },
  { id: "fields", name: "The open fields", x0: 238, x1: 562 },
  { id: "river", name: "The river and the mill", x0: 562, x1: 772 },
  { id: "green", name: "The green", x0: 772, x1: 1110 },
  { id: "manor", name: "The manor", x0: 1110, x1: 1308 },
  { id: "common", name: "The common and the fold", x0: 1308, x1: 1506 },
  { id: "end", name: "The unfinished end", x0: 1506, x1: CLOTH_LENGTH },
];

export function sceneAt(x: number): Scene {
  for (const s of SCENES) if (x < s.x1) return s;
  return SCENES[SCENES.length - 1];
}

/** Where the linen is still bare. */
export const FRONTIER_X = 1506;
export const NEEDLE_REST = { x: 1628, y: 58 };
export const ROLLER_X = 1662;

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

export type BuildingKind =
  | "cottage"
  | "hut"
  | "church"
  | "alehouse"
  | "mill"
  | "bakehouse"
  | "smithy"
  | "manor"
  | "barn"
  | "dovecote"
  | "priesthouse"
  | "fold";

export interface Building {
  id: string;
  kind: BuildingKind;
  /** Centre x and the y of its footing on the back ground line. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Where people stand at its door. */
  doorX: number;
  /** A home that may hold a household. */
  dwelling: boolean;
  /** Plots in the unfinished linen: built only when the village needs a house. */
  expansion?: boolean;
}

function B(
  id: string,
  kind: BuildingKind,
  x: number,
  w: number,
  h: number,
  dwelling: boolean,
  opts: Partial<Building> = {},
): Building {
  const { doorX = 0, ...rest } = opts;
  return { id, kind, x, y: 64, w, h, dwelling, ...rest, doorX: x + doorX };
}

export const BUILDINGS: readonly Building[] = [
  B("woodward", "hut", 64, 24, 18, true, { y: 63 }),
  B("swineherd", "cottage", 114, 26, 20, true),
  B("westcroft", "cottage", 252, 26, 21, true, { y: 60 }),
  B("eastcroft", "cottage", 548, 26, 21, true, { y: 60 }),
  B("mill", "mill", 724, 30, 27, false, { y: 63, doorX: 6 }),
  B("millhouse", "cottage", 752, 24, 21, true),
  B("bakehouse", "bakehouse", 792, 24, 20, true),
  B("cottage-a", "cottage", 819, 26, 21, true),
  B("cottage-b", "cottage", 846, 26, 22, true),
  B("church", "church", 898, 52, 30, false, { y: 63, doorX: 8 }),
  B("priesthouse", "priesthouse", 988, 24, 21, true),
  B("alehouse", "alehouse", 1022, 32, 23, true),
  B("cottage-c", "cottage", 1054, 26, 21, true),
  B("smithy", "smithy", 1084, 26, 20, true),
  B("barn", "barn", 1136, 38, 27, false, { y: 62 }),
  B("manor", "manor", 1196, 54, 34, true, { y: 62 }),
  B("dovecote", "dovecote", 1252, 14, 24, false, { y: 61 }),
  B("cottage-d", "cottage", 1324, 26, 21, true),
  B("cottage-e", "cottage", 1374, 26, 21, true),
  B("cottage-f", "cottage", 1402, 26, 20, true),
  B("fold", "fold", 1446, 46, 12, false, { y: 76 }),
  B("shepherd", "hut", 1486, 22, 17, true, { y: 63 }),
  B("plot-1", "cottage", 1526, 26, 21, true, { expansion: true }),
  B("plot-2", "cottage", 1556, 26, 21, true, { expansion: true }),
  B("plot-3", "cottage", 1586, 26, 21, true, { expansion: true }),
  B("plot-4", "cottage", 1614, 24, 20, true, { expansion: true, y: 66 }),
];

export const BUILDING = Object.fromEntries(BUILDINGS.map((b) => [b.id, b])) as Record<string, Building>;

// ---------------------------------------------------------------------------
// Fields and strips
// ---------------------------------------------------------------------------

export interface Strip {
  id: number;
  field: 0 | 1 | 2;
  x0: number;
  x1: number;
}

export const FIELD_NAMES = ["West Field", "Middle Field", "East Field"] as const;
export const FIELD_X: readonly [number, number][] = [
  [264, 354],
  [358, 448],
  [452, 542],
];
export const STRIPS_PER_FIELD = 9;
export const STRIP_Y = { far: 50, near: 81 } as const;

export const STRIPS: readonly Strip[] = FIELD_X.flatMap(([x0, x1], f) => {
  const w = (x1 - x0) / STRIPS_PER_FIELD;
  return Array.from({ length: STRIPS_PER_FIELD }, (_, i) => ({
    id: f * STRIPS_PER_FIELD + i,
    field: f as 0 | 1 | 2,
    x0: x0 + i * w,
    x1: x0 + (i + 1) * w,
  }));
});

/** The hay meadow by the river. */
export const MEADOW = { x0: 572, x1: 668 } as const;

// ---------------------------------------------------------------------------
// The river, the bridge, the ford
// ---------------------------------------------------------------------------

export const RIVER_X = 690;
export const BRIDGE = { x0: 671, x1: 709, y: 73 } as const;
export const FORD_Y = 84;

/** Centre line of the river at a height on the cloth (it winds a little). */
export function riverCentre(y: number): number {
  return RIVER_X + Math.sin(y / 8.5) * 5 + Math.sin(y / 3.1) * 1.2;
}

/** Half the river's width for a water level 0..1. */
export function riverHalfWidth(level: number, y: number): number {
  const widen = Math.max(0, (y - 40) / 47); // wider as it comes down the cloth
  return 5 + level * 13 + widen * (3 + level * 8);
}

/** Level above which the water spreads over the meadow. */
export const MEADOW_FLOOD_LEVEL = 0.64;

// ---------------------------------------------------------------------------
// The road and the ground
// ---------------------------------------------------------------------------

const ROAD: readonly [number, number][] = [
  [0, 80],
  [120, 79],
  [236, 83],
  [264, 85],
  [540, 85],
  [566, 80],
  [664, 78],
  [BRIDGE.x0, BRIDGE.y],
  [BRIDGE.x1, BRIDGE.y],
  [720, 77],
  [860, 77],
  [960, 78],
  [1110, 77],
  [1300, 78],
  [1510, 79],
  [CLOTH_LENGTH, 79],
];

/** The y of the road's surface at x (where walkers put their feet). */
export function roadY(x: number): number {
  for (let i = 1; i < ROAD.length; i++) {
    const [xb, yb] = ROAD[i];
    if (x <= xb) {
      const [xa, ya] = ROAD[i - 1];
      const t = xb === xa ? 0 : (x - xa) / (xb - xa);
      return ya + (yb - ya) * t;
    }
  }
  return ROAD[ROAD.length - 1][1];
}

/** The ground a figure may stand on runs from the back line to the front. */
export const GROUND = { back: 62, front: 85 } as const;

// ---------------------------------------------------------------------------
// Places people go
// ---------------------------------------------------------------------------

export interface Place {
  x: number;
  y: number;
  /** Spread in x people use around the point. */
  w: number;
  /** Spread in y. */
  h: number;
}

export const PLACES = {
  forest: { x: 110, y: 76, w: 180, h: 8 },
  pannage: { x: 90, y: 78, w: 150, h: 7 },
  woodpile: { x: 170, y: 76, w: 30, h: 5 },
  cross: { x: 238, y: 80, w: 6, h: 2 },
  meadow: { x: 620, y: 78, w: 88, h: 9 },
  lowMeadow: { x: 640, y: 82, w: 50, h: 4 },
  mill: { x: 716, y: 74, w: 10, h: 3 },
  bridge: { x: 690, y: BRIDGE.y, w: 30, h: 0 },
  bakehouse: { x: 792, y: 72, w: 14, h: 4 },
  churchDoor: { x: 906, y: 70, w: 6, h: 2 },
  nave: { x: 898, y: 71, w: 26, h: 3 },
  churchyard: { x: 946, y: 72, w: 40, h: 8 },
  green: { x: 950, y: 79, w: 120, h: 7 },
  well: { x: 962, y: 80, w: 8, h: 2 },
  alehouse: { x: 1022, y: 74, w: 36, h: 6 },
  smithy: { x: 1084, y: 72, w: 12, h: 3 },
  barn: { x: 1136, y: 72, w: 22, h: 4 },
  manor: { x: 1196, y: 72, w: 30, h: 4 },
  garden: { x: 1276, y: 79, w: 36, h: 6 },
  common: { x: 1370, y: 80, w: 110, h: 7 },
  pond: { x: 1352, y: 83, w: 16, h: 2 },
  fold: { x: 1446, y: 77, w: 34, h: 5 },
  highGround: { x: 1400, y: 76, w: 80, h: 6 },
  frontier: { x: 1560, y: 77, w: 70, h: 6 },
} as const satisfies Record<string, Place>;

export type PlaceId = keyof typeof PLACES;

// ---------------------------------------------------------------------------
// Borders: inscription slots above, chronicle slots below
// ---------------------------------------------------------------------------

export interface InscriptionSlot {
  id: number;
  scene: SceneId;
  x0: number;
  x1: number;
}

/** The incipit occupies the upper border at the hem. */
export const INCIPIT = { x0: 6, x1: 132 } as const;

export const INSCRIPTION_SLOTS: readonly InscriptionSlot[] = [
  { id: 0, scene: "forest", x0: 138, x1: 236 },
  { id: 1, scene: "fields", x0: 242, x1: 398 },
  { id: 2, scene: "fields", x0: 404, x1: 560 },
  { id: 3, scene: "river", x0: 566, x1: 770 },
  { id: 4, scene: "green", x0: 776, x1: 940 },
  { id: 5, scene: "green", x0: 946, x1: 1108 },
  { id: 6, scene: "manor", x0: 1114, x1: 1306 },
  { id: 7, scene: "common", x0: 1312, x1: 1504 },
  { id: 8, scene: "end", x0: 1510, x1: 1650 },
];

export interface ChronicleSlot {
  id: number;
  scene: SceneId;
  x0: number;
  x1: number;
}

export const CHRONICLE_SLOT_W = 44;
/** "This work was begun in the year of our Lord 1382", at the hem. */
export const LOWER_INCIPIT = { x0: 4, x1: 96 } as const;

export const CHRONICLE_SLOTS: readonly ChronicleSlot[] = (() => {
  const out: ChronicleSlot[] = [];
  for (const s of SCENES) {
    if (s.id === "end") continue;
    // The forest's lower border opens with the incipit (fixed, not a slot).
    const start = s.x0 === 0 ? LOWER_INCIPIT.x1 + 2 : s.x0 + 3;
    const n = Math.floor((s.x1 - 3 - start) / CHRONICLE_SLOT_W);
    const pad = (s.x1 - 3 - start - n * CHRONICLE_SLOT_W) / 2;
    for (let i = 0; i < n; i++) {
      const x0 = start + pad + i * CHRONICLE_SLOT_W;
      out.push({ id: out.length, scene: s.id, x0, x1: x0 + CHRONICLE_SLOT_W });
    }
  }
  return out;
})();

/** Graves in the churchyard, two rows. */
export const GRAVE_SLOTS: readonly { x: number; y: number }[] = Array.from({ length: 14 }, (_, i) => ({
  x: 928 + (i % 7) * 6.2 + (i >= 7 ? 3 : 0),
  y: i < 7 ? 67.5 : 71.5,
}));
