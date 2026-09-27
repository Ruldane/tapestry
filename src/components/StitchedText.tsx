import { layText, WORD_WOOLS } from "@/loom/letters";
import { WOOLS } from "@/loom/palette";

/**
 * Capitals worked in thread, as SVG: the same single-stroke alphabet the
 * cloth is lettered in, each stroke a dashed rope of wool (stem stitch seen
 * from a little way off). Decorative: the text is given to assistive
 * technology separately.
 */
export function StitchedText({ text, width, height, lines = 2, className }: { text: string; width: number; height: number; lines?: number; className?: string }) {
  const laid = layText(text, 0, width, 0, height, height / (lines + 0.2), height / (lines * 2.2), lines, "left");
  const sw = Math.max(0.6, laid.height * 0.075);
  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false" preserveAspectRatio="xMinYMid meet">
      {laid.letters.map((l, i) => {
        const wool = WOOLS[WORD_WOOLS[l.word % WORD_WOOLS.length]];
        const d = l.strokes.map((s) => s.map(([x, y], j) => `${j ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ")).join(" ");
        return (
          <g key={i} strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d={d} stroke={wool.dark} strokeWidth={sw * 1.5} />
            <path d={d} stroke={wool.mid} strokeWidth={sw} strokeDasharray={`${sw * 1.6} ${sw * 0.5}`} />
            <path d={d} stroke={wool.light} strokeWidth={sw * 0.35} strokeDasharray={`${sw * 0.7} ${sw * 1.4}`} opacity={0.7} />
          </g>
        );
      })}
      {laid.dots.map(([x, y], i) => (
        <circle key={`d${i}`} cx={x} cy={y} r={sw * 0.9} fill={WOOLS[4].mid} />
      ))}
    </svg>
  );
}
