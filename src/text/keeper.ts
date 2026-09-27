/**
 * The keeper of the hanging: the framing note, and the note left for a
 * visitor who comes back. Plain, dry, fond. The keeper and the hanging are
 * fiction.
 */

export const KEEPER = "Joan Hurle, keeper of the hanging";

export const FRAMING = [
  "Nobody has finished it, and nobody will. Whatever happens in the village is stitched into the linen as it happens, by a needle nobody holds.",
  "Walk along it. The small grey figure with a staff, stitched at the edge of the cloth, is you. They will have noticed. Pick out any of them to learn who they are.",
];

export const FRAMING_RETURN = [
  "The hanging kept on while you were gone. The needle does not wait.",
  "You will find yourself where you last stood. Some of them remember you.",
];

export interface AbsenceFacts {
  elapsedMs: number;
  capped: boolean;
  births: string[];
  deaths: string[];
  marriages: [string, string][];
  harvest: { good: boolean } | null;
  spates: number;
  bridgeLost: boolean;
  bridgeMended: boolean;
  comet: boolean;
  meteors: boolean;
  cottages: number;
  quarrels: number;
  reconciliations: number;
  hungry: boolean;
  namedForStranger: string | null;
  heardOfStranger: number;
  population: number;
  reeve: string | null;
}

export function durationWords(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return mins <= 1 ? "a minute" : `${numberWord(mins)} minutes`;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 36) return hours === 1 ? "an hour" : `${numberWord(hours)} hours`;
  const days = Math.round(ms / 86_400_000);
  if (days < 14) return `${numberWord(days)} days`;
  const weeks = Math.round(days / 7);
  if (weeks < 9) return `${numberWord(weeks)} weeks`;
  return `${numberWord(Math.round(days / 30))} months`;
}

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
export function numberWord(n: number): string {
  return n < WORDS.length ? WORDS[n] : String(n);
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "You were away nine days. In that time ..." */
export function absenceNote(f: AbsenceFacts): string {
  const out: string[] = [`You were away ${durationWords(f.elapsedMs)}.`];
  const happened: string[] = [];
  if (f.births.length) happened.push(f.births.length > 3 ? `${numberWord(f.births.length)} children were born` : `${list(f.births)} ${f.births.length === 1 ? "was" : "were"} born`);
  if (f.marriages.length) happened.push(f.marriages.length > 2 ? `${numberWord(f.marriages.length)} couples were married` : list(f.marriages.map(([a, b]) => `${a} married ${b}`)));
  if (f.deaths.length) happened.push(f.deaths.length > 3 ? `${numberWord(f.deaths.length)} were buried` : `${list(f.deaths)} ${f.deaths.length === 1 ? "was" : "were"} buried`);
  if (f.harvest) happened.push(f.harvest.good ? "the harvest came in well" : "the harvest came in thin");
  if (happened.length) out.push(`In that time ${list(happened)}.`);
  if (f.spates) out.push(f.bridgeLost ? `The river rose and took the footbridge${f.bridgeMended ? "; it has been mended" : ", and it is not mended yet"}.` : "The river rose over the meadow and went down again.");
  if (f.comet) out.push("A hairy star hung over the village for some nights, and the priest preached on it.");
  else if (f.meteors) out.push("One night the stars fell, and people came out to watch.");
  if (f.cottages) out.push(f.cottages === 1 ? "A new house was built at the end of the village, in the bare linen." : "New houses were built at the end of the village, in the bare linen.");
  if (f.reeve) out.push(`${f.reeve} was chosen reeve at Michaelmas.`);
  if (f.hungry) out.push("Some houses went hungry before the stores were eked out.");
  if (f.namedForStranger) out.push(`A child was named ${f.namedForStranger}, after you.`);
  if (f.quarrels > 2 && f.reconciliations < f.quarrels / 2) out.push("There has been some ill feeling.");
  else if (f.reconciliations > 2) out.push("Some old quarrels were made up.");
  if (f.heardOfStranger > 0) out.push(f.heardOfStranger > f.population * 0.6 ? "Most of the village has heard about you by now." : "Word of you has got about.");
  if (f.capped) out.push("The keeper's notes for the rest of the time are lost; the needle went on without them.");
  if (out.length === 1) out.push("Not much happened. The needle kept on.");
  return out.join(" ");
}
