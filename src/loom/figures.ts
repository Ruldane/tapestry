/**
 * The people and beasts, drawn live every frame so they can move: profile
 * figures with the long proportions of narrative embroidery, each body part
 * filled with laid thread (a pattern anchored to the figure, so it moves
 * with them) and outlined in stem stitch. Faces and hands are bare linen,
 * as they are on the old hangings; eyes are knots.
 */
import { Act, Carry, Work } from "../sim/types";
import type { RosterEntry } from "../worker/protocol";
import { D, LINEN, WOOLS } from "./palette";
import type { StrandSet } from "./strand";

type G = CanvasRenderingContext2D;

export interface Figure {
  id: number;
  x: number;
  y: number;
  facing: number;
  act: number;
  work: number;
  carry: number;
  moving: boolean;
  phase: number;
  t: number;
  sick: boolean;
  selected: boolean;
  look: RosterEntry;
  /** Draw scale (inside buildings people are drawn a little smaller). */
  scale: number;
  /** Lying down (asleep, sick). */
  lying: boolean;
  sitting: boolean;
  /** 0..1 how much of the figure has been stitched (for the needle). */
  reveal: number;
}

export class Patterns {
  private pats: (CanvasPattern | null)[] = [];
  readonly px: number;
  readonly set: StrandSet;
  constructor(g: G, set: StrandSet) {
    this.px = set.px;
    this.set = set;
    this.pats = set.couch.map((c) => g.createPattern(c as CanvasImageSource, "repeat"));
  }
  /** A pattern for a wool, anchored at the current origin, laid at an angle. */
  get(wool: number, angle: number): CanvasPattern | string {
    const p = this.pats[wool];
    if (!p) return WOOLS[wool].mid;
    const c = Math.cos(angle) / this.px;
    const s = Math.sin(angle) / this.px;
    p.setTransform({ a: c, b: s, c: -s, d: c, e: 0, f: 0 });
    return p;
  }
}

const OUTLINE = WOOLS[D.walnutDark].mid;
const OUTLINE_LIGHT = WOOLS[D.walnut].light;
const FLESH = "#d2c9b2";

export interface DrawOpts {
  /** Level of detail: 0 full, 1 no second stem pass, 2 plain. */
  tier: number;
  back: boolean;
}

// ---------------------------------------------------------------------------
// Pose
// ---------------------------------------------------------------------------

interface Pose {
  lean: number;
  /** Hip and knee angles for the two legs (radians; + forward). */
  l1: [number, number];
  l2: [number, number];
  /** Shoulder and elbow for near and far arm (+ forward/up from hanging). */
  a1: [number, number];
  a2: [number, number];
  head: number;
  bob: number;
  kneel: boolean;
}

const still = (): Pose => ({ lean: 0, l1: [0.04, 0], l2: [-0.04, 0], a1: [0.1, 0.25], a2: [-0.05, 0.15], head: 0, bob: 0, kneel: false });

function walkPose(p: Pose, phase: number, amp = 1): void {
  const s = Math.sin(phase * Math.PI * 2);
  const c = Math.cos(phase * Math.PI * 2);
  p.l1 = [s * 0.42 * amp, Math.max(0, -c) * 0.55 * amp];
  p.l2 = [-s * 0.42 * amp, Math.max(0, c) * 0.55 * amp];
  p.a1 = [-s * 0.32 * amp + 0.05, 0.3];
  p.a2 = [s * 0.32 * amp, 0.25];
  p.bob = Math.abs(s) * 0.12 * amp;
}

function poseFor(f: Figure): Pose {
  const p = still();
  const t = f.t + (f.id % 17) * 0.37;
  const osc = (hz: number, a = 1) => Math.sin(t * Math.PI * 2 * hz) * a;
  if (f.moving) {
    const run = f.act === Act.FollowStranger || f.act === Act.ChaseGoose || f.act === Act.Play;
    walkPose(p, f.phase, run ? 1.35 : 1);
    if (run) p.lean = 0.12;
    if (f.carry === Carry.Grain || f.carry === Carry.Flour || f.carry === Carry.Sheaf || f.carry === Carry.Hay || f.carry === Carry.Wood) {
      p.a1 = [2.6, 2.2];
      p.lean = 0.08;
    }
    if (f.carry === Carry.Water) p.a1 = [0.05, 0.05];
    if (f.carry === Carry.Babe) p.a1 = [0.9, 1.6];
    if (f.carry === Carry.Bier) p.a1 = [0.4, 0.9];
    if (f.act === Act.Work && f.work === Work.Sow) p.a1 = [0.8 + osc(0.6, 0.6), 0.4];
    return p;
  }
  switch (f.act) {
    case Act.Work:
      switch (f.work) {
        case Work.Reap:
        case Work.Glean:
        case Work.Weed:
        case Work.Garden:
          p.lean = 0.75;
          p.head = 0.3;
          p.a1 = [1.1 + osc(0.5, 0.35), 0.3];
          p.a2 = [0.9, 0.5];
          p.l1 = [0.35, 0.5];
          p.l2 = [-0.2, 0.1];
          break;
        case Work.Bind:
          p.lean = 0.6;
          p.a1 = [1.2, 0.9 + osc(0.4, 0.3)];
          p.a2 = [1.0, 0.9];
          p.l1 = [0.3, 0.5];
          break;
        case Work.Mow:
          p.lean = 0.3 + osc(0.35, 0.12);
          p.a1 = [0.8 + osc(0.35, 0.5), 0.5];
          p.a2 = [0.5 + osc(0.35, 0.5), 0.6];
          p.l1 = [0.25, 0.2];
          p.l2 = [-0.25, 0];
          break;
        case Work.Rake:
          p.lean = 0.25;
          p.a1 = [0.9 + osc(0.4, 0.35), 0.2];
          p.a2 = [0.6 + osc(0.4, 0.35), 0.3];
          p.l1 = [0.2, 0.1];
          break;
        case Work.Thresh:
          p.lean = 0.1;
          p.a1 = [2.2 + osc(0.8, 0.9), 0.3];
          p.a2 = [2.0 + osc(0.8, 0.9), 0.4];
          break;
        case Work.Dig:
        case Work.Plough:
          p.lean = 0.45;
          p.a1 = [0.9, 0.5 + osc(0.4, 0.2)];
          p.a2 = [0.7, 0.6];
          p.l1 = [0.4, 0.3 + osc(0.4, 0.2)];
          break;
        case Work.Smith:
        case Work.Carpenter:
        case Work.Woodcut:
        case Work.Slaughter:
          p.lean = 0.2;
          p.a1 = [1.6 + osc(0.9, 1.1), 0.4];
          p.a2 = [0.6, 0.8];
          break;
        case Work.Prune:
        case Work.Thatch:
          p.a1 = [2.4 + osc(0.5, 0.3), 0.3];
          p.a2 = [2.0, 0.2];
          p.head = -0.25;
          break;
        case Work.Spin:
          p.a1 = [0.9, 1.3 + osc(0.7, 0.15)];
          p.a2 = [1.4, 1.8];
          break;
        case Work.Weave:
        case Work.Bake:
        case Work.Brew:
          p.lean = 0.2;
          p.a1 = [1.1 + osc(0.5, 0.2), 0.8];
          p.a2 = [0.9, 0.9];
          break;
        case Work.Herd:
        case Work.Oversee:
        case Work.Geese:
        case Work.Pannage:
          p.a1 = [0.7, 0.6];
          p.lean = -0.04;
          break;
        case Work.Shear:
          p.kneel = true;
          p.lean = 0.5;
          p.a1 = [1.1 + osc(0.8, 0.2), 0.4];
          p.a2 = [1.0, 0.5];
          break;
        case Work.Scare:
          p.a1 = [2.4 + osc(1.2, 0.6), 0.2];
          p.a2 = [2.2 - osc(1.2, 0.6), 0.2];
          break;
        case Work.Serve:
          p.a1 = [1.1, 0.8];
          break;
        case Work.Mill:
          p.lean = 0.3;
          p.a1 = [1.2, 0.8];
          break;
        default:
          p.a1 = [0.6 + osc(0.3, 0.2), 0.6];
      }
      break;
    case Act.Chat:
      p.a1 = [0.5 + Math.max(0, osc(0.35, 0.5)), 1 + osc(0.5, 0.3)];
      p.head = osc(0.2, 0.06);
      break;
    case Act.Argue:
      p.lean = 0.16;
      p.a1 = [1.6 + osc(1.1, 0.6), 0.3];
      p.a2 = [0.4, 1.4];
      p.head = -0.1;
      break;
    case Act.Pray:
    case Act.Service:
    case Act.Baptism:
      p.kneel = f.act === Act.Pray;
      p.a1 = [1.1, 1.5];
      p.a2 = [1.1, 1.5];
      p.head = 0.2;
      break;
    case Act.Mourn:
    case Act.Funeral:
      p.head = 0.4;
      p.a1 = [0.7, 1.6];
      p.a2 = [0.6, 1.6];
      if (f.carry === Carry.Bier) p.a1 = [0.4, 0.9];
      break;
    case Act.SkyWatch:
      p.head = -0.7;
      p.a1 = [2.5, 0.1];
      p.lean = -0.08;
      break;
    case Act.GreetStranger:
      p.a1 = [2.3 + osc(1.4, 0.25), 0.3];
      break;
    case Act.WatchStranger:
      p.a1 = [0.6, 2.2];
      p.a2 = [0.5, 2.2];
      p.lean = -0.05;
      break;
    case Act.Dance:
    case Act.Feast:
      walkPose(p, t * 0.9, 0.8);
      p.a1 = [2.2 + osc(0.9, 0.5), 0.3];
      p.a2 = [2.0 - osc(0.9, 0.5), 0.3];
      p.bob = Math.abs(osc(0.9, 0.5));
      break;
    case Act.Play:
      walkPose(p, t * 1.3, 1.1);
      p.bob = Math.abs(osc(1.3, 0.6));
      break;
    case Act.Drink:
      p.a1 = [1.4 + Math.max(0, osc(0.18, 0.9)), 1.6];
      break;
    case Act.Sermon:
      if (f.look.trade === "priest") p.a1 = [2.2 + osc(0.4, 0.3), 0.3];
      else p.head = 0.1;
      break;
    case Act.SaveFlock:
      walkPose(p, t * 0.8, 1.2);
      p.a1 = [2 + osc(1, 0.5), 0.3];
      p.lean = 0.15;
      break;
    case Act.Wedding:
      p.a1 = [0.9, 0.6];
      break;
    case Act.Eat:
      p.a1 = [1.2, 1.4 + Math.max(0, osc(0.3, 0.4))];
      break;
    case Act.Rest:
      if (f.work === Work.Spin) p.a1 = [0.9, 1.3 + osc(0.7, 0.15)];
      else p.a1 = [0.3, 0.9];
      break;
    case Act.Carry:
      p.a1 = [0.2, 0.3];
      break;
    case Act.Fetch:
      if (f.work === Work.Woodcut) {
        // Stooping for sticks.
        p.lean = 0.8;
        p.head = 0.3;
        p.a1 = [1 + osc(0.4, 0.3), 0.4];
        p.a2 = [0.9, 0.6];
        p.l1 = [0.3, 0.4];
      }
      break;
  }
  if (f.carry === Carry.Babe && f.act !== Act.Work) p.a1 = [0.9, 1.6];
  if (f.look.ageClass === 4) p.lean += 0.1;
  return p;
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

function limb(g: G, pats: Patterns, x0: number, y0: number, a0: number, l0: number, a1: number, l1: number, w: number, wool: number, opts: DrawOpts): [number, number] {
  // Angles measured from straight down, + toward the front.
  const kx = x0 + Math.sin(a0) * l0;
  const ky = y0 + Math.cos(a0) * l0;
  const ex = kx + Math.sin(a0 + a1) * l1;
  const ey = ky + Math.cos(a0 + a1) * l1;
  g.lineCap = "round";
  g.lineJoin = "round";
  if (!opts.back) {
    g.strokeStyle = OUTLINE;
    g.lineWidth = w + 0.34;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(kx, ky);
    g.lineTo(ex, ey);
    g.stroke();
    g.strokeStyle = pats.get(wool, Math.atan2(ey - y0, ex - x0));
    g.lineWidth = w;
    g.stroke();
  } else {
    g.strokeStyle = "rgba(80,60,40,0.35)";
    g.lineWidth = 0.18;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(kx, ky);
    g.lineTo(ex, ey);
    g.stroke();
  }
  return [ex, ey];
}

function fillShape(g: G, pats: Patterns, pts: [number, number][], wool: number, angle: number, opts: DrawOpts, outline = OUTLINE): void {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  if (opts.back) {
    g.strokeStyle = "rgba(80,60,40,0.35)";
    g.lineWidth = 0.16;
    g.stroke();
    return;
  }
  g.fillStyle = pats.get(wool, angle);
  g.fill();
  g.strokeStyle = outline;
  g.lineWidth = 0.3;
  g.lineJoin = "round";
  g.stroke();
  if (opts.tier === 0) {
    // The twist of the stem stitch along the outline.
    g.strokeStyle = OUTLINE_LIGHT;
    g.globalAlpha = 0.5;
    g.lineWidth = 0.1;
    g.setLineDash([0.34, 0.26]);
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;
  }
}

function knot(g: G, x: number, y: number, r: number, color: string): void {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

function line(g: G, pts: [number, number][], w: number, color: string): void {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = "round";
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
}

// ---------------------------------------------------------------------------
// A person
// ---------------------------------------------------------------------------

const LONG_GOWN = new Set(["priest", "lord", "lady"]);

export function drawPerson(g: G, pats: Patterns, f: Figure, opts: DrawOpts): void {
  const L = f.look;
  const H = L.height * f.scale;
  g.save();
  g.translate(f.x, f.y);
  g.scale(f.facing, 1);
  if (f.reveal < 1) {
    // The needle is still at work: only the stitched part shows, from the feet up.
    g.beginPath();
    g.rect(-H, -H * 1.2 * f.reveal, H * 2, H * 1.3);
    g.clip();
  }
  if (f.lying) {
    drawLying(g, pats, f, H, opts);
    g.restore();
    return;
  }
  const p = poseFor(f);
  const woman = L.sex === 1 && L.ageClass >= 2;
  const longGown = woman || LONG_GOWN.has(L.trade) || L.ageClass === 0;
  const hipY = -H * 0.47 - p.bob;
  const thigh = H * 0.235;
  const shin = H * 0.245;
  const legW = H * 0.068;
  const shoulderY = -H * 0.79 - p.bob;
  const torsoLen = hipY - shoulderY;
  const sitting = f.sitting;
  const kneeling = p.kneel;

  // The upper body is built upright about the hip and turned by the lean.
  const lean = p.lean;
  const cl = Math.cos(lean);
  const sl = Math.sin(lean);
  /** A point u forward, v up from the hip, turned with the torso. */
  const R = (u: number, v: number): [number, number] => [u * cl + v * sl, hipY - (v * cl - u * sl)];
  const [shoulderX, sy] = R(0, torsoLen);

  // Legs (far one first).
  const legWool = L.hose;
  const legs = (which: 0 | 1) => {
    let [a, k] = which === 0 ? p.l2 : p.l1;
    if (sitting) {
      a = 1.45;
      k = -1.4;
    } else if (kneeling) {
      a = which ? 1.2 : 0.3;
      k = which ? -1.3 : -0.2;
    }
    const x0 = which ? 0.25 : -0.25;
    const [ex, ey] = limb(g, pats, x0, hipY, a, thigh, k, shin, legW, longGown ? D.walnutDark : legWool, opts);
    if (!opts.back) {
      // A shoe.
      g.fillStyle = WOOLS[D.walnutDark].mid;
      g.beginPath();
      g.ellipse(ex + H * 0.03, ey, H * 0.05, H * 0.028, 0, 0, Math.PI * 2);
      g.fill();
    }
  };
  legs(0);

  // Far arm.
  const armW = H * 0.058;
  const upper = H * 0.16;
  const fore = H * 0.15;
  const tunicWool = L.trade === "priest" ? D.greyDark : L.tunic;
  limb(g, pats, shoulderX - 0.2, sy + 0.3, p.a2[0] + lean * 0.5, upper, p.a2[1], fore, armW, tunicWool, opts);

  // Body: tunic or gown. The skirt hangs; the chest turns with the lean.
  const hemY = sitting ? hipY + H * 0.05 : longGown ? -H * 0.035 : L.ageClass <= 1 ? -H * 0.22 : -H * 0.25;
  const topW = H * 0.1;
  const hemW = longGown ? H * 0.2 : H * 0.15;
  const pregnant = L.pregnant && woman;
  const hemFront = hemW * (sitting ? 1.6 : 1) + (kneeling ? 0.4 : 0) + Math.max(0, sl) * H * 0.08;
  const body: [number, number][] = [
    R(-topW, torsoLen),
    R(topW * 0.9, torsoLen),
    R(topW * (pregnant ? 1.7 : 1.1), torsoLen * 0.42),
    [hemFront, hemY],
    [-hemW * (sitting ? 0.4 : 1), hemY],
    R(-topW * 1.05, 0),
  ];
  fillShape(g, pats, body, tunicWool, Math.PI / 2 + lean, opts);
  if (!opts.back) {
    // A belt.
    line(g, [R(-topW * 1.05, torsoLen * 0.18), R(topW * 1.12, torsoLen * 0.22)], 0.28, WOOLS[D.walnut].dark);
    // Aprons for the miller, the smith and the baker.
    if (L.trade === "miller" || L.trade === "smith" || L.trade === "baker") {
      const ap: [number, number][] = [R(topW * 0.2, torsoLen * 0.25), R(topW * 1.15, torsoLen * 0.28), [hemW * 0.95, hemY - 0.3], [topW * 0.1, hemY - 0.3]];
      fillShape(g, pats, ap, L.trade === "smith" ? D.walnut : D.cream, Math.PI / 2, opts);
    }
    // A mantle for the lord and lady; a cloak in mourning.
    if (L.trade === "lord" || L.trade === "lady" || L.mourning) {
      const m: [number, number][] = [R(-topW * 1.1, torsoLen + 0.2), R(topW * 0.3, torsoLen), [-hemW * 0.3, hipY + H * 0.1], [-hemW * 1.05, hipY + H * 0.2]];
      fillShape(g, pats, m, L.mourning ? D.greyDark : L.trade === "lord" ? D.woad : D.madderPale, Math.PI / 2 + 0.3, opts);
    }
  }
  // Near leg over the tunic hem.
  legs(1);

  // Head, on the neck, turned with the torso.
  const hr = H * 0.072;
  const [hx, hy] = R(hr * 0.2, torsoLen + hr * 1.3);
  drawHead(g, pats, f, hx, hy, hr, p.head + lean * 0.6, opts);

  // Near arm and whatever it holds.
  const [hx2, hy2] = limb(g, pats, shoulderX + 0.2, sy + 0.3, p.a1[0] + lean * 0.5, upper, p.a1[1], fore, armW, tunicWool, opts);
  if (!opts.back) {
    knot(g, hx2, hy2, armW * 0.62, FLESH);
    g.strokeStyle = OUTLINE;
    g.lineWidth = 0.14;
    g.beginPath();
    g.arc(hx2, hy2, armW * 0.62, 0, Math.PI * 2);
    g.stroke();
    tool(g, pats, f, hx2, hy2, H, sy, shoulderX, opts);
  }
  if (f.sick && !opts.back) {
    g.fillStyle = "rgba(90,110,70,0.18)";
    g.beginPath();
    g.arc(hx, hy, hr * 1.3, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

function drawHead(g: G, pats: Patterns, f: Figure, x: number, y: number, r: number, tilt: number, opts: DrawOpts): void {
  const L = f.look;
  g.save();
  g.translate(x, y);
  g.rotate(tilt * 0.5);
  if (opts.back) {
    g.strokeStyle = "rgba(80,60,40,0.35)";
    g.lineWidth = 0.14;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
    g.restore();
    return;
  }
  // Face: bare linen, outlined, with a nose in profile.
  g.beginPath();
  g.moveTo(-r * 0.9, -r * 0.3);
  g.bezierCurveTo(-r * 0.9, -r * 1.2, r * 0.9, -r * 1.2, r * 0.95, -r * 0.2);
  g.lineTo(r * 1.28, r * 0.12);
  g.lineTo(r * 0.95, r * 0.28);
  g.bezierCurveTo(r * 0.9, r * 0.9, -r * 0.2, r * 1.1, -r * 0.7, r * 0.7);
  g.closePath();
  g.fillStyle = FLESH;
  g.fill();
  g.strokeStyle = OUTLINE;
  g.lineWidth = 0.2;
  g.stroke();
  // The eye.
  knot(g, r * 0.45, -r * 0.1, r * 0.15, WOOLS[D.walnutDark].mid);
  const woman = L.sex === 1 && L.ageClass >= 2;
  const hair = WOOLS[L.hair].mid;
  if (L.trade === "priest") {
    // Tonsure: a ring of hair.
    g.strokeStyle = hair;
    g.lineWidth = r * 0.35;
    g.beginPath();
    g.arc(0, -r * 0.05, r * 0.85, Math.PI * 0.95, Math.PI * 1.75);
    g.stroke();
  } else if (woman || L.trade === "lady") {
    // A wimple and veil.
    const veil: [number, number][] = [
      [r * 0.7, -r * 1.05],
      [-r * 0.6, -r * 1.2],
      [-r * 1.35, -r * 0.2],
      [-r * 1.2, r * 1.6],
      [r * 0.3, r * 1.6],
      [r * 0.55, r * 0.9],
      [r * 0.35, r * 0.55],
      [-r * 0.2, r * 0.2],
      [-r * 0.2, -r * 0.55],
      [r * 0.5, -r * 0.75],
    ];
    fillShape(g, pats, veil, L.trade === "lady" ? D.woadPale : L.mourning ? D.greyDark : D.cream, Math.PI / 2, opts);
    if (L.trade === "lady") line(g, [[-r * 0.8, -r * 0.95], [r * 0.6, -r * 1.0]], r * 0.22, WOOLS[D.weld].mid);
  } else if (L.trade === "lord") {
    const hat: [number, number][] = [
      [-r * 1.2, -r * 0.55],
      [r * 1.2, -r * 0.6],
      [r * 0.8, -r * 1.25],
      [-r * 0.9, -r * 1.3],
    ];
    fillShape(g, pats, hat, D.madder, 0, opts);
  } else if (L.ageClass >= 2 && (L.id % 3 !== 0 || L.ageClass === 4)) {
    // A hood with its long tail.
    const hood: [number, number][] = [
      [r * 0.8, -r * 0.9],
      [-r * 0.2, -r * 1.35],
      [-r * 1.3, -r * 0.6],
      [-r * 2.6, r * 0.2],
      [-r * 2.4, r * 0.7],
      [-r * 1.2, r * 0.5],
      [-r * 0.9, r * 1.3],
      [r * 0.1, r * 1.35],
      [r * 0.5, r * 0.8],
      [-r * 0.15, r * 0.3],
      [-r * 0.2, -r * 0.5],
      [r * 0.6, -r * 0.6],
    ];
    fillShape(g, pats, hood, L.hood, 0.4, opts);
  } else {
    // Bare head: hair in knots.
    g.fillStyle = hair;
    g.beginPath();
    g.moveTo(r * 0.8, -r * 0.8);
    g.bezierCurveTo(r * 0.2, -r * 1.3, -r * 1.2, -r * 1.1, -r * 1.05, r * 0.2);
    g.lineTo(-r * 0.55, r * 0.3);
    g.bezierCurveTo(-r * 0.5, -r * 0.3, 0, -r * 0.7, r * 0.8, -r * 0.8);
    g.fill();
    if (opts.tier === 0) for (let i = 0; i < 4; i++) knot(g, -r * 0.8 + i * 0.1, -r * 0.9 + i * 0.4, r * 0.22, hair);
  }
  g.restore();
}

function tool(g: G, pats: Patterns, f: Figure, hx: number, hy: number, H: number, sy: number, sxs: number, opts: DrawOpts): void {
  const wood = WOOLS[D.walnut].mid;
  const iron = WOOLS[D.grey].light;
  const w = 0.3;
  const L = f.look;
  const carryLoad = (wool: number, big = 1) => {
    const cx = sxs - 0.2;
    const cy = sy - 0.9;
    g.save();
    g.translate(cx, cy);
    const sack: [number, number][] = [
      [-1.6 * big, -0.2],
      [-0.8 * big, -1.3 * big],
      [1.2 * big, -1.1 * big],
      [1.7 * big, 0.4],
      [0.4, 0.9],
      [-1.4 * big, 0.7],
    ];
    fillShape(g, pats, sack, wool, 0.2, opts);
    g.restore();
  };
  switch (f.carry) {
    case Carry.Grain:
      return carryLoad(D.walnutPale);
    case Carry.Flour:
      return carryLoad(D.cream);
    case Carry.Sheaf:
      carryLoad(D.weld, 1.1);
      return;
    case Carry.Hay:
      return carryLoad(D.weld, 1.4);
    case Carry.Wood:
      for (let i = 0; i < 4; i++) line(g, [[sxs - 2.2, sy - 0.4 - i * 0.35], [sxs + 2, sy - 1 - i * 0.35]], 0.3, wood);
      return;
    case Carry.Water:
      line(g, [[hx, hy], [hx, hy + 0.6]], 0.08, wood);
      fillShape(g, pats, [[hx - 0.8, hy + 0.6], [hx + 0.8, hy + 0.6], [hx + 0.6, hy + 2], [hx - 0.6, hy + 2]], D.walnut, Math.PI / 2, opts);
      return;
    case Carry.Babe: {
      const b: [number, number][] = [
        [hx - 1.6, hy - 0.6],
        [hx + 0.8, hy - 0.9],
        [hx + 1, hy + 0.2],
        [hx - 1.4, hy + 0.4],
      ];
      fillShape(g, pats, b, D.cream, 0, opts);
      knot(g, hx + 0.9, hy - 0.5, 0.45, FLESH);
      line(g, [[hx - 1, hy - 0.2], [hx + 0.2, hy - 0.3]], 0.14, WOOLS[D.madder].mid);
      return;
    }
    case Carry.Ale:
      fillShape(g, pats, [[hx - 0.5, hy - 0.4], [hx + 0.5, hy - 0.4], [hx + 0.4, hy + 0.8], [hx - 0.4, hy + 0.8]], D.madderPale, Math.PI / 2, opts);
      return;
  }
  if (f.act === Act.Drink || f.act === Act.Feast) {
    fillShape(g, pats, [[hx - 0.45, hy - 0.8], [hx + 0.45, hy - 0.8], [hx + 0.35, hy + 0.2], [hx - 0.35, hy + 0.2]], D.walnutPale, Math.PI / 2, opts);
    return;
  }
  if (f.act === Act.Pray && L.trade === "priest") {
    fillShape(g, pats, [[hx - 0.2, hy - 1], [hx + 1.3, hy - 1.2], [hx + 1.3, hy], [hx - 0.2, hy + 0.2]], D.madder, 0, opts);
    return;
  }
  // A staff for the reeve, the old, the pilgrim; a crook for the shepherd.
  const staff = L.trade === "reeve" || L.trade === "shepherd" || (L.ageClass === 4 && f.act !== Act.Work) || f.work === Work.Oversee || f.work === Work.Herd || f.work === Work.Geese || f.work === Work.Pannage;
  if (f.act === Act.Work || staff) {
    switch (f.work) {
      case Work.Reap:
        line(g, [[hx, hy], [hx + 0.6, hy + 0.7]], w, wood);
        g.strokeStyle = iron;
        g.lineWidth = 0.28;
        g.beginPath();
        g.arc(hx + 1.6, hy + 0.9, 1.1, Math.PI * 0.9, Math.PI * 1.9);
        g.stroke();
        return;
      case Work.Mow:
        line(g, [[hx - 2.2, hy - 3], [hx + 2.4, hy + 5.4]], w, wood);
        line(g, [[hx + 2.4, hy + 5.4], [hx - 1.4, hy + 6.2]], 0.34, iron);
        return;
      case Work.Rake:
        line(g, [[hx - 1, hy - 1.4], [hx + 4.2, hy + 5.6]], w, wood);
        line(g, [[hx + 3.4, hy + 6.2], [hx + 5, hy + 5]], 0.3, wood);
        return;
      case Work.Thresh:
        line(g, [[hx, hy], [hx - 0.5, hy - 3]], w, wood);
        line(g, [[hx - 0.5, hy - 3], [hx - 2.2, hy - 4.6]], 0.36, wood);
        return;
      case Work.Dig:
      case Work.Garden:
      case Work.Weed:
        line(g, [[hx - 0.4, hy - 1.6], [hx + 1.2, hy + 3.8]], w, wood);
        line(g, [[hx + 0.6, hy + 3.8], [hx + 1.9, hy + 3.6]], 0.5, iron);
        return;
      case Work.Smith:
      case Work.Carpenter:
      case Work.Woodcut:
        line(g, [[hx, hy], [hx + 1.6, hy - 1.4]], w, wood);
        line(g, [[hx + 1.2, hy - 1.9], [hx + 2.2, hy - 0.8]], 0.55, iron);
        return;
      case Work.Prune:
        line(g, [[hx, hy], [hx + 0.6, hy - 2.4]], w, wood);
        line(g, [[hx + 0.6, hy - 2.4], [hx + 1.4, hy - 2]], 0.3, iron);
        return;
      case Work.Spin:
        line(g, [[hx - 1.4, hy + 2], [hx + 1.1, hy - 2.4]], 0.22, wood);
        knot(g, hx + 1.2, hy - 2.6, 0.7, WOOLS[D.cream].mid);
        line(g, [[hx + 0.5, hy + 0.4], [hx + 0.6, hy + 2.6 + Math.sin(f.t * 5) * 0.15]], 0.06, WOOLS[D.cream].dark);
        knot(g, hx + 0.6, hy + 2.8, 0.25, wood);
        return;
      case Work.Sow:
        fillShape(g, pats, [[-0.8, -H * 0.5], [1.6, -H * 0.52], [1.2, -H * 0.38], [-0.6, -H * 0.36]], D.cream, 0, opts);
        return;
      case Work.Serve:
        fillShape(g, pats, [[hx - 0.5, hy - 0.4], [hx + 0.5, hy - 0.4], [hx + 0.5, hy + 1], [hx - 0.5, hy + 1]], D.madderPale, Math.PI / 2, opts);
        return;
      case Work.Plough: {
        line(g, [[hx, hy], [hx + 3.4, hy + 3.6]], w, wood);
        line(g, [[hx + 2, hy + 2.2], [hx + 9, hy + 2.6]], 0.42, wood);
        line(g, [[hx + 3.2, hy + 3.5], [hx + 4.4, hy + 4.1]], 0.4, iron);
        return;
      }
    }
    if (staff) {
      const crook = L.trade === "shepherd";
      line(g, [[hx + 0.2, hy - 3.2], [hx + 0.2, hy + H * 0.36]], 0.28, wood);
      if (crook) {
        g.strokeStyle = wood;
        g.lineWidth = 0.28;
        g.beginPath();
        g.arc(hx + 0.9, hy - 3.2, 0.7, Math.PI, Math.PI * 2.2);
        g.stroke();
      }
    }
  }
}

function drawLying(g: G, pats: Patterns, f: Figure, H: number, opts: DrawOpts): void {
  // Asleep or sick: a blanket and a head on a bolster.
  const len = H * 0.86;
  const blanket: [number, number][] = [
    [-len * 0.45, 0],
    [-len * 0.48, -H * 0.1],
    [len * 0.25, -H * 0.13],
    [len * 0.36, -H * 0.05],
    [len * 0.3, 0],
  ];
  fillShape(g, pats, blanket, f.sick ? D.greyDark : f.look.tunic, 0.05, opts);
  const hr = H * 0.07;
  if (!opts.back) {
    g.fillStyle = FLESH;
    g.beginPath();
    g.arc(len * 0.36 + hr * 0.6, -hr * 1.1, hr, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = OUTLINE;
    g.lineWidth = 0.18;
    g.stroke();
    const woman = f.look.sex === 1 && f.look.ageClass >= 2;
    g.fillStyle = woman ? WOOLS[D.cream].mid : WOOLS[f.look.hair].mid;
    g.beginPath();
    g.arc(len * 0.36 + hr * 0.5, -hr * 1.35, hr * 0.85, Math.PI * 0.9, Math.PI * 1.95);
    g.fill();
    // Eyes closed: a short line.
    line(g, [[len * 0.36 + hr * 0.9, -hr * 1.05], [len * 0.36 + hr * 1.3, -hr * 1.0]], 0.1, OUTLINE);
  }
}

// ---------------------------------------------------------------------------
// The stranger
// ---------------------------------------------------------------------------

export const STRANGER_LOOK: RosterEntry = {
  id: 0,
  name: "the stranger",
  sex: 0,
  ageClass: 3,
  trade: "none",
  tunic: D.grey,
  hood: D.walnutPale,
  hose: D.walnut,
  hair: D.walnut,
  height: 11.2,
  mourning: false,
  pregnant: false,
};

export function drawStranger(g: G, pats: Patterns, f: Figure, opts: DrawOpts, sitting: boolean): void {
  const H = f.look.height;
  g.save();
  g.translate(f.x, f.y);
  g.scale(f.facing, 1);
  if (f.reveal < 1) {
    g.beginPath();
    g.rect(-H, -H * 1.25 * f.reveal, H * 2, H * 1.35);
    g.clip();
  }
  const p = still();
  if (f.moving) walkPose(p, f.phase, 1);
  const hipY = sitting ? -H * 0.2 : -H * 0.47 - p.bob;
  const legW = H * 0.068;
  const leg = (a: number, k: number, x0: number) => {
    const [ex, ey] = limb(g, pats, x0, hipY, a, H * 0.235, k, H * 0.245, legW, D.walnut, opts);
    if (!opts.back) {
      g.fillStyle = WOOLS[D.walnutDark].mid;
      g.beginPath();
      g.ellipse(ex + H * 0.03, ey, H * 0.05, H * 0.028, 0, 0, Math.PI * 2);
      g.fill();
    }
  };
  if (sitting) {
    leg(1.5, -1.4, -0.2);
    leg(1.5, -1.3, 0.2);
  } else leg(p.l2[0], p.l2[1], -0.25);
  const sy = hipY - H * 0.32;
  // The pilgrim's cloak, long, grey, undyed.
  const cloak: [number, number][] = [
    [-H * 0.11, sy],
    [H * 0.1, sy],
    [H * 0.19, hipY + H * 0.08],
    [H * 0.14, sitting ? hipY + H * 0.06 : -H * 0.16],
    [-H * 0.22, sitting ? hipY + H * 0.06 : -H * 0.14],
    [-H * 0.16, hipY],
  ];
  fillShape(g, pats, cloak, D.grey, Math.PI / 2, opts);
  if (!sitting) leg(p.l1[0], p.l1[1], 0.25);
  // The scrip (bag) with its scallop.
  if (!opts.back) {
    fillShape(g, pats, [[-H * 0.2, hipY - H * 0.03], [-H * 0.07, hipY - H * 0.04], [-H * 0.07, hipY + H * 0.08], [-H * 0.2, hipY + H * 0.07]], D.madder, 0, opts);
    knot(g, -H * 0.135, hipY + H * 0.02, H * 0.025, WOOLS[D.cream].light);
  }
  // Head and the broad hat.
  const hr = H * 0.072;
  drawHead(g, pats, { ...f, look: { ...f.look, ageClass: 1, id: 3 } }, hr * 0.15, sy - hr * 1.25, hr, 0, opts);
  if (!opts.back) {
    const hy = sy - hr * 2.05;
    fillShape(
      g,
      pats,
      [
        [-hr * 2.3, hy + hr * 0.45],
        [hr * 2.5, hy + hr * 0.35],
        [hr * 1.1, hy - hr * 0.35],
        [hr * 0.7, hy - hr * 1.1],
        [-hr * 0.9, hy - hr * 1.1],
        [-hr * 1.2, hy - hr * 0.3],
      ],
      D.walnutPale,
      0,
      opts,
    );
    // The scallop on the hat brim.
    knot(g, hr * 0.6, hy - hr * 0.3, hr * 0.32, WOOLS[D.cream].light);
  }
  // The staff, taller than a man.
  const [hx, hy2] = limb(g, pats, 0.3, sy + 0.3, sitting ? 0.9 : 0.55 + p.a1[0] * 0.3, H * 0.16, 0.7, H * 0.15, H * 0.058, D.grey, opts);
  if (!opts.back) {
    line(g, [[hx + 0.3, hy2 - H * 0.45], [hx + 0.3, sitting ? 0 : hy2 + H * 0.36]], 0.3, WOOLS[D.walnut].mid);
    knot(g, hx + 0.3, hy2 - H * 0.47, 0.42, WOOLS[D.weld].mid);
    knot(g, hx, hy2, H * 0.036, FLESH);
  }
  g.restore();
}

// ---------------------------------------------------------------------------
// Beasts
// ---------------------------------------------------------------------------

export interface Beast {
  kind: number;
  x: number;
  y: number;
  facing: number;
  moving: boolean;
  phase: number;
  young: boolean;
  alarm: boolean;
  lying: boolean;
  t: number;
  id: number;
}

export function drawBeast(g: G, pats: Patterns, b: Beast, opts: DrawOpts): void {
  g.save();
  g.translate(b.x, b.y);
  g.scale(b.facing, 1);
  const s = b.young ? 0.62 : 1;
  g.scale(s, s);
  const legs = (xs: number[], len: number, wool: number, w = 0.42) => {
    xs.forEach((x, i) => {
      const a = b.moving ? Math.sin((b.phase + i * 0.5) * Math.PI * 2) * 0.35 : 0;
      limb(g, pats, x, -len, a, len * 0.5, -a * 0.5, len * 0.5, w, wool, opts);
    });
  };
  switch (b.kind) {
    case 1: {
      // Sheep: a cloud of French knots.
      if (!b.lying) legs([-1.4, -0.9, 1.1, 1.5], 1.8, D.walnutDark, 0.34);
      const y0 = b.lying ? -1.4 : -3.1;
      g.fillStyle = WOOLS[D.cream].dark;
      g.beginPath();
      g.ellipse(0, y0, 2.6, 1.6, 0, 0, Math.PI * 2);
      g.fill();
      if (!opts.back) {
        for (let i = 0; i < (opts.tier ? 7 : 13); i++) {
          const a = (i / 13) * Math.PI * 2 + b.id;
          const r = i < 7 ? 1.25 : 0.55;
          knot(g, Math.cos(a) * r * 1.6, y0 + Math.sin(a) * r, 0.62, WOOLS[D.cream][i % 3 === 0 ? "light" : "mid"]);
        }
        g.strokeStyle = OUTLINE;
        g.lineWidth = 0.18;
        g.beginPath();
        g.ellipse(0, y0, 2.7, 1.7, 0, 0, Math.PI * 2);
        g.stroke();
      }
      const graze = !b.moving && Math.sin(b.t * 0.3 + b.id) > 0.2;
      const hx = 2.6;
      const hy = graze ? y0 + 1.5 : y0 - 0.7;
      fillShape(g, pats, [[hx - 0.7, hy - 0.6], [hx + 0.9, hy - 0.2], [hx + 1.1, hy + 0.5], [hx - 0.5, hy + 0.7]], D.walnutDark, 0, opts);
      break;
    }
    case 2: {
      // Goose.
      legs([-0.2, 0.3], 1.2, D.weld, 0.2);
      fillShape(g, pats, [[-2, -2.4], [-0.6, -3.2], [1.2, -2.9], [1.6, -1.9], [-1.1, -1.4]], D.grey, 0.1, opts);
      const up = b.alarm || b.moving ? 1 : 0.6;
      fillShape(g, pats, [[1.2, -2.6], [1.5, -4.2 * up - 0.4], [2.1, -4.3 * up - 0.5], [1.8, -2.5]], D.cream, Math.PI / 2, opts);
      fillShape(g, pats, [[2.1, -4.3 * up - 0.5], [2.9, -4.1 * up - 0.4], [2.1, -3.9 * up - 0.4]], D.weld, 0, opts);
      if (!opts.back) knot(g, 1.9, -4.4 * up - 0.4, 0.14, OUTLINE);
      break;
    }
    case 3: {
      // Ox.
      legs([-3.4, -2.6, 2.4, 3.1], 3.3, D.walnut, 0.72);
      const body: [number, number][] = [];
      // Rump, a long back rising to the shoulder hump, the dewlap, the belly.
      const pts: [number, number][] = [
        [-4.8, -4.4],
        [-4.6, -6.3],
        [-3.2, -6.9],
        [0, -6.8],
        [2.4, -7.5],
        [3.8, -7.2],
        [4.4, -5.4],
        [4.2, -3.6],
        [2.6, -3.2],
        [0, -3.4],
        [-2.8, -3.2],
        [-4.4, -3.4],
      ];
      body.push(...pts);
      fillShape(g, pats, body, b.id % 2 ? D.russet : D.walnutPale, 0.05, opts);
      fillShape(g, pats, [[3.6, -7.2], [5.2, -7.1], [6.6, -5.4], [6.2, -4.5], [4.8, -4.6], [4.2, -5.6]], b.id % 2 ? D.russet : D.walnutPale, 0.9, opts);
      if (!opts.back) {
        line(g, [[4.5, -6.8], [4.1, -8.2], [4.8, -8.6]], 0.3, WOOLS[D.cream].mid);
        knot(g, 5.4, -5.8, 0.16, OUTLINE);
        line(g, [[-4.4, -5.8], [-5.2, -3.6]], 0.22, WOOLS[D.walnutDark].mid);
      }
      break;
    }
    case 4: {
      // Dog.
      legs([-1.6, -1.1, 1.2, 1.6], 2, D.walnutPale, 0.34);
      fillShape(g, pats, [[-2.2, -3.2], [1.8, -3.4], [2.1, -2.2], [-2, -1.9]], b.id % 2 ? D.grey : D.walnutPale, 0.05, opts);
      const up = b.alarm ? -0.6 : 0;
      fillShape(g, pats, [[1.6, -3.3], [2.9, -4.6 + up], [3.9, -4 + up], [2.7, -2.9]], b.id % 2 ? D.grey : D.walnutPale, 0.5, opts);
      if (!opts.back) {
        line(g, [[-2.2, -3.1], [-3.1, -4.1 - (b.alarm ? 0.6 : 0) + Math.sin(b.t * 9) * 0.3]], 0.3, WOOLS[D.walnut].mid);
        knot(g, 3.1, -4.1 + up, 0.14, OUTLINE);
        if (b.alarm && Math.sin(b.t * 7) > 0) {
          // Barking: a little burst of running stitches.
          for (let k = -1; k <= 1; k++) line(g, [[4.4, -4.2 + k * 0.7 + up], [5.4, -4.4 + k * 1.1 + up]], 0.14, WOOLS[D.madder].mid);
        }
      }
      break;
    }
    case 5: {
      // Pig.
      legs([-1.8, -1.2, 1.2, 1.7], 1.4, D.madderPale, 0.4);
      fillShape(g, pats, [[-2.6, -3.2], [1.6, -3.6], [2.9, -2.6], [2.5, -1.4], [-2.4, -1.3], [-2.9, -2.2]], b.id % 2 ? D.madderPale : D.greyDark, 0.05, opts);
      if (!opts.back) {
        fillShape(g, pats, [[2.8, -2.6], [3.4, -2.4], [3.4, -1.8], [2.8, -1.8]], D.madderPale, 0, opts);
        g.strokeStyle = WOOLS[D.madderPale].dark;
        g.lineWidth = 0.18;
        g.beginPath();
        g.arc(-3.1, -2.9, 0.4, 0, Math.PI * 1.5);
        g.stroke();
        knot(g, 2.2, -2.9, 0.13, OUTLINE);
      }
      break;
    }
  }
  g.restore();
}

export { LINEN };
