/**
 * Stitched capitals: a single-stroke alphabet drawn as thread, not set in a
 * font. Each letter is a few strokes on a unit-high box; strokes are worked
 * in stem stitch, words alternate colours of wool, and an interpunct knot
 * divides the words.
 */
import type { Pt } from "./stitches";

type Stroke = Pt[];
interface Glyph {
  w: number;
  s: Stroke[];
}

function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 12): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

const G: Record<string, Glyph> = {
  A: { w: 0.72, s: [[[0, 1], [0.36, 0], [0.72, 1]], [[0.17, 0.6], [0.55, 0.6]]] },
  B: {
    w: 0.58,
    s: [
      [[0, 0], [0, 1]],
      [[0, 0], [0.36, 0], ...arc(0.36, 0.235, 0.18, 0.235, -90, 90, 8), [0, 0.47]],
      [[0, 0.47], [0.38, 0.47], ...arc(0.38, 0.735, 0.2, 0.265, -90, 90, 8), [0, 1]],
    ],
  },
  C: { w: 0.62, s: [arc(0.36, 0.5, 0.36, 0.5, -40, -320, 16)] },
  D: { w: 0.66, s: [[[0, 0], [0, 1]], [[0, 0], [0.26, 0], ...arc(0.26, 0.5, 0.38, 0.5, -90, 90, 14), [0, 1]]] },
  E: { w: 0.52, s: [[[0.52, 0], [0, 0], [0, 1], [0.52, 1]], [[0, 0.48], [0.4, 0.48]]] },
  F: { w: 0.5, s: [[[0.5, 0], [0, 0], [0, 1]], [[0, 0.48], [0.38, 0.48]]] },
  G: { w: 0.66, s: [[...arc(0.36, 0.5, 0.36, 0.5, -40, -330, 16)], [[0.4, 0.58], [0.68, 0.58], [0.68, 0.94]]] },
  H: { w: 0.64, s: [[[0, 0], [0, 1]], [[0.64, 0], [0.64, 1]], [[0, 0.5], [0.64, 0.5]]] },
  I: { w: 0.14, s: [[[0.07, 0], [0.07, 1]]] },
  J: { w: 0.46, s: [[[0.46, 0], [0.46, 0.72], ...arc(0.23, 0.72, 0.23, 0.28, 0, 160, 8)]] },
  K: { w: 0.6, s: [[[0, 0], [0, 1]], [[0.58, 0], [0, 0.6]], [[0.2, 0.44], [0.6, 1]]] },
  L: { w: 0.5, s: [[[0, 0], [0, 1], [0.5, 1]]] },
  M: { w: 0.84, s: [[[0, 1], [0, 0], [0.42, 0.64], [0.84, 0], [0.84, 1]]] },
  N: { w: 0.66, s: [[[0, 1], [0, 0], [0.66, 1], [0.66, 0]]] },
  O: { w: 0.76, s: [arc(0.38, 0.5, 0.38, 0.5, 0, 360, 22)] },
  P: { w: 0.56, s: [[[0, 1], [0, 0], [0.34, 0], ...arc(0.34, 0.25, 0.22, 0.25, -90, 90, 8), [0, 0.5]]] },
  Q: { w: 0.78, s: [arc(0.38, 0.5, 0.38, 0.5, 0, 360, 22), [[0.46, 0.72], [0.8, 1.06]]] },
  R: { w: 0.6, s: [[[0, 1], [0, 0], [0.34, 0], ...arc(0.34, 0.25, 0.22, 0.25, -90, 90, 8), [0, 0.5]], [[0.28, 0.5], [0.6, 1]]] },
  S: {
    w: 0.54,
    s: [[[0.52, 0.14], [0.42, 0.02], [0.18, 0], [0.04, 0.1], [0.03, 0.3], [0.16, 0.44], [0.4, 0.54], [0.53, 0.68], [0.52, 0.88], [0.38, 1], [0.12, 0.99], [0, 0.86]]],
  },
  T: { w: 0.64, s: [[[0, 0], [0.64, 0]], [[0.32, 0], [0.32, 1]]] },
  V: { w: 0.68, s: [[[0, 0], [0.34, 1], [0.68, 0]]] },
  W: { w: 0.92, s: [[[0, 0], [0.23, 1], [0.46, 0.3], [0.69, 1], [0.92, 0]]] },
  X: { w: 0.62, s: [[[0, 0], [0.62, 1]], [[0.62, 0], [0, 1]]] },
  Y: { w: 0.64, s: [[[0, 0], [0.32, 0.5], [0.64, 0]], [[0.32, 0.5], [0.32, 1]]] },
  Z: { w: 0.58, s: [[[0, 0], [0.58, 0], [0, 1], [0.58, 1]]] },
};
// The U: down, round the bottom, up.
G.U = {
  w: 0.64,
  s: [
    [
      [0, 0],
      [0, 0.66],
      ...arc(0.32, 0.66, 0.32, 0.34, 180, 360, 12).map(([x, y]) => [x, 1.32 - y] as Pt),
      [0.64, 0],
    ],
  ],
};

/**
 * Serifs as a needlewoman makes them: a short cross-stitch at the head and
 * foot of each upright or slanting stroke (not the ends of bars or curves).
 */
function serifs(gl: Glyph): Stroke[] {
  const out: Stroke[] = [];
  const S = 0.085;
  for (const st of gl.s) {
    for (const [end, next] of [
      [st[0], st[1]],
      [st[st.length - 1], st[st.length - 2]],
    ] as const) {
      if (!end || !next) continue;
      const [x, y] = end;
      const dx = Math.abs(next[0] - x);
      const dy = Math.abs(next[1] - y);
      if ((y > 0.03 && y < 0.97) || dy < dx * 0.9) continue;
      if (out.some((o) => Math.abs(o[0][0] + S - x) < 0.01 && Math.abs(o[0][1] - y) < 0.01)) continue;
      out.push([[x - S, y], [x + S, y]]);
    }
  }
  return out;
}
const SERIFS: Record<string, Stroke[]> = Object.fromEntries(Object.entries(G).map(([k, g]) => [k, serifs(g)]));

/** A small, repeatable unevenness for the n-th letter of a text. */
function wobble(seed: number, n: number, k: number): number {
  let h = (seed ^ Math.imul(n + 1, 0x9e3779b1) ^ Math.imul(k + 7, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296 - 0.5;
}

/** Long straight runs are laid by hand: a slight belly in the middle. */
function handLaid(stroke: Stroke, bow: number): Stroke {
  if (stroke.length !== 2) return stroke;
  const [[ax, ay], [bx, by]] = stroke;
  const len = Math.hypot(bx - ax, by - ay);
  if (len < 0.3) return stroke;
  const nx = -(by - ay) / len;
  const ny = (bx - ax) / len;
  const b = bow * len;
  return [
    [ax, ay],
    [ax + (bx - ax) * 0.5 + nx * b, ay + (by - ay) * 0.5 + ny * b],
    [bx, by],
  ];
}

export const LETTER_GAP = 0.26;
export const WORD_GAP = 0.62;

export interface Placed {
  /** Strokes in cloth units. */
  strokes: Pt[][];
  /** Index of the word (for colour alternation). */
  word: number;
  /** Order of the letter in the line (for stitching in sequence). */
  index: number;
}

export interface Laid {
  letters: Placed[];
  /** Interpunct knots between words. */
  dots: Pt[];
  width: number;
  height: number;
  lines: number;
}

function lineWidth(words: string[], h: number): number {
  let w = 0;
  words.forEach((word, i) => {
    for (const ch of word) w += ((G[ch]?.w ?? 0.5) + LETTER_GAP) * h;
    if (i < words.length - 1) w += WORD_GAP * h;
  });
  return w;
}

/**
 * Lay a line of capitals into a box, shrinking or breaking onto more lines
 * to fit. Returns strokes in cloth units, left to right, top to bottom.
 */
export function layText(text: string, x0: number, x1: number, yTop: number, yBottom: number, maxH: number, minH: number, maxLines = 2, align: "center" | "left" = "center"): Laid {
  const words = text.toUpperCase().replace(/[^A-Z ]/g, "").split(/\s+/).filter(Boolean);
  let seed = 2166136261;
  for (let i = 0; i < text.length; i++) seed = Math.imul(seed ^ text.charCodeAt(i), 16777619) >>> 0;
  const avail = x1 - x0;
  const boxH = yBottom - yTop;
  let lines: string[][] = [words];
  let h = maxH;
  for (let n = 1; n <= maxLines; n++) {
    lines = splitLines(words, n);
    const lineGap = 0.45;
    const hFit = Math.min(maxH, boxH / (n + (n - 1) * lineGap));
    const widest = Math.max(...lines.map((l) => lineWidth(l, 1)));
    h = Math.min(hFit, avail / widest);
    if (h >= minH || n === maxLines) break;
  }
  h = Math.max(h, Math.min(minH, maxH) * 0.8);
  const lineGapU = h * 0.45;
  const total = lines.length * h + (lines.length - 1) * lineGapU;
  let y = yTop + (boxH - total) / 2;
  const letters: Placed[] = [];
  const dots: Pt[] = [];
  let word = 0;
  let index = 0;
  let maxW = 0;
  for (const line of lines) {
    const w = lineWidth(line, h);
    maxW = Math.max(maxW, w);
    let x = align === "center" ? x0 + (avail - w) / 2 : x0;
    line.forEach((wd, wi) => {
      for (const ch of wd) {
        const gl = G[ch];
        if (!gl) {
          x += 0.5 * h;
          continue;
        }
        // Each letter a little its own: width, lean, and where it sits on the line.
        const n = index;
        const ws = 1 + wobble(seed, n, 0) * 0.1;
        const lean = wobble(seed, n, 1) * 0.07;
        const dy = wobble(seed, n, 2) * 0.07;
        const cx = gl.w / 2;
        const place = ([px, py]: Pt): Pt => {
          const ux = cx + (px - cx) * ws + (py - 0.5) * lean;
          return [x + ux * h, y + (py + dy) * h];
        };
        const strokes = [
          ...gl.s.map((st, si) => handLaid(st, wobble(seed, n, 3 + si) * 0.05).map(place)),
          ...(SERIFS[ch] ?? []).map((st) => st.map(place)),
        ];
        letters.push({ strokes, word, index: index++ });
        x += (gl.w + LETTER_GAP) * h;
      }
      if (wi < line.length - 1) {
        dots.push([x + (WORD_GAP * h - LETTER_GAP * h) / 2, y + h * 0.52]);
        x += WORD_GAP * h - LETTER_GAP * h + LETTER_GAP * h;
      }
      word++;
    });
    y += h + lineGapU;
  }
  return { letters, dots, width: maxW, height: h, lines: lines.length };
}

function splitLines(words: string[], n: number): string[][] {
  if (n <= 1 || words.length <= 1) return [words];
  const total = words.join(" ").length;
  const target = total / n;
  const out: string[][] = [];
  let cur: string[] = [];
  let len = 0;
  for (const w of words) {
    if (cur.length && len + w.length / 2 > target && out.length < n - 1) {
      out.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(w);
    len += w.length + 1;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Colours of wool the words alternate between. */
export const WORD_WOOLS = [2, 0, 6, 7] as const;
