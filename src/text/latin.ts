/**
 * The stitched inscriptions: a small grammar of simple, correct Latin with
 * an English gloss for each. Constructions are kept plain (HIC + subject +
 * verb, a few passives and deponents) rather than risk being wrong.
 *
 * Names are declined from the tables in sim/names; trades are added in
 * apposition in the same case ("AGNES PISTRIX", "Agnes the baker").
 */
import type { GivenName } from "../sim/names";
import type { Trade } from "../sim/types";

export interface Line {
  la: string;
  en: string;
}

type Case = "nom" | "acc" | "abl";

const TRADE_LA: Partial<Record<Trade, { m: [string, string, string]; f?: [string, string, string]; en: string }>> = {
  miller: { m: ["MOLENDINARIUS", "MOLENDINARIUM", "MOLENDINARIO"], en: "the miller" },
  reeve: { m: ["PRAEPOSITUS", "PRAEPOSITUM", "PRAEPOSITO"], en: "the reeve" },
  priest: { m: ["SACERDOS", "SACERDOTEM", "SACERDOTE"], en: "the priest" },
  alewife: { m: ["BRACIATOR", "BRACIATOREM", "BRACIATORE"], f: ["BRACIATRIX", "BRACIATRICEM", "BRACIATRICE"], en: "the alewife" },
  baker: { m: ["PISTOR", "PISTOREM", "PISTORE"], f: ["PISTRIX", "PISTRICEM", "PISTRICE"], en: "the baker" },
  smith: { m: ["FABER", "FABRUM", "FABRO"], en: "the smith" },
  shepherd: { m: ["PASTOR", "PASTOREM", "PASTORE"], en: "the shepherd" },
  swineherd: { m: ["PORCARIUS", "PORCARIUM", "PORCARIO"], en: "the swineherd" },
  woodward: { m: ["FORESTARIUS", "FORESTARIUM", "FORESTARIO"], en: "the woodward" },
  carpenter: { m: ["CARPENTARIUS", "CARPENTARIUM", "CARPENTARIO"], en: "the carpenter" },
  weaver: { m: ["TEXTOR", "TEXTOREM", "TEXTORE"], f: ["TEXTRIX", "TEXTRICEM", "TEXTRICE"], en: "the weaver" },
  thatcher: { m: ["COOPERTOR", "COOPERTOREM", "COOPERTORE"], en: "the thatcher" },
  lord: { m: ["DOMINUS", "DOMINUM", "DOMINO"], en: "the lord" },
  lady: { m: ["DOMINA", "DOMINAM", "DOMINA"], en: "the lady" },
  steward: { m: ["SENESCALLUS", "SENESCALLUM", "SENESCALLO"], en: "the steward" },
  ploughman: { m: ["ARATOR", "ARATOREM", "ARATORE"], en: "the ploughman" },
};

/** A person as the grammar needs them. */
export interface Who {
  name: GivenName;
  sex: 0 | 1;
  trade: Trade;
  /** Add the trade in apposition (for the well-known, or to tell two Johns apart). */
  withTrade: boolean;
}

export function la(w: Who, c: Case): string {
  const idx = c === "nom" ? 0 : c === "acc" ? 1 : 2;
  const n = c === "nom" ? w.name.nom : c === "acc" ? w.name.acc : w.name.abl;
  const t = TRADE_LA[w.trade];
  if (!w.withTrade || !t) return n;
  const forms = w.sex === 1 && t.f ? t.f : t.m;
  return `${n} ${forms[idx]}`;
}

export function en(w: Who): string {
  const t = TRADE_LA[w.trade];
  return w.withTrade && t ? `${w.name.en} ${t.en}` : w.name.en;
}

/** The trade alone ("the miller"), for inscriptions about roles. */
export function tradeLa(trade: Trade, sex: 0 | 1, c: Case): string | null {
  const t = TRADE_LA[trade];
  if (!t) return null;
  const forms = sex === 1 && t.f ? t.f : t.m;
  return forms[c === "nom" ? 0 : c === "acc" ? 1 : 2];
}

export function tradeEn(trade: Trade): string | null {
  return TRADE_LA[trade]?.en ?? null;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const L = (la: string, en: string): Line => ({ la, en: cap(en) });

// ---------------------------------------------------------------------------
// Work, by one person or by many
// ---------------------------------------------------------------------------

export type Deed =
  | "bake"
  | "mill"
  | "brew"
  | "smith"
  | "carpenter"
  | "thatch"
  | "weave"
  | "spin"
  | "plough"
  | "sow"
  | "harrow"
  | "weed"
  | "mow"
  | "rake"
  | "reap"
  | "bind"
  | "cart"
  | "thresh"
  | "prune"
  | "dig"
  | "shear"
  | "herd"
  | "pannage"
  | "slaughter"
  | "woodcut"
  | "garden"
  | "geese"
  | "glean"
  | "oversee"
  | "office"
  | "drink"
  | "feast"
  | "dance"
  | "play"
  | "sleep"
  | "mass"
  | "pray"
  | "carryGrain"
  | "water"
  | "hall"
  | "rest"
  | "scare"
  | "sup"
  | "dine";

/** [singular verb phrase, plural verb phrase, English singular, English plural] */
const DEEDS: Record<Deed, [string, string, string, string]> = {
  bake: ["PANEM COQUIT", "PANEM COQUUNT", "bakes bread", "bake bread"],
  mill: ["FRUMENTUM MOLIT", "FRUMENTUM MOLUNT", "grinds the corn", "grind the corn"],
  brew: ["CERVISIAM FACIT", "CERVISIAM FACIUNT", "brews ale", "brew ale"],
  smith: ["FERRUM CUDIT", "FERRUM CUDUNT", "beats out iron", "beat out iron"],
  carpenter: ["LIGNUM DOLAT", "LIGNUM DOLANT", "hews timber", "hew timber"],
  thatch: ["TECTUM TEGIT", "TECTUM TEGUNT", "thatches a roof", "thatch a roof"],
  weave: ["TEXIT", "TEXUNT", "weaves", "weave"],
  spin: ["LANAM NET", "LANAM NENT", "spins wool", "spin wool"],
  plough: ["ARAT", "ARANT", "ploughs", "plough"],
  sow: ["SEMINAT", "SEMINANT", "sows", "sow"],
  harrow: ["OCCAT", "OCCANT", "harrows", "harrow"],
  weed: ["SARRIT", "SARRIUNT", "weeds the corn", "weed the corn"],
  mow: ["FENUM SECAT", "FENUM SECANT", "mows the hay", "mow the hay"],
  rake: ["FENUM COLLIGIT", "FENUM COLLIGUNT", "rakes the hay", "rake the hay"],
  reap: ["METIT", "METUNT", "reaps", "reap"],
  bind: ["MANIPULOS LIGAT", "MANIPULOS LIGANT", "binds the sheaves", "bind the sheaves"],
  cart: ["SEGETEM VEHIT", "SEGETEM VEHUNT", "carts the corn", "cart the corn"],
  thresh: ["TRITURAT", "TRITURANT", "threshes", "thresh"],
  prune: ["ARBORES PUTAT", "ARBORES PUTANT", "prunes the trees", "prune the trees"],
  dig: ["FODIT", "FODIUNT", "digs", "dig"],
  shear: ["OVES TONDET", "OVES TONDENT", "shears the sheep", "shear the sheep"],
  herd: ["OVES PASCIT", "OVES PASCUNT", "grazes the sheep", "graze the sheep"],
  pannage: ["PORCOS AD GLANDES DUCIT", "PORCOS AD GLANDES DUCUNT", "drives the pigs to the acorns", "drive the pigs to the acorns"],
  slaughter: ["PORCUM OCCIDIT", "PORCUM OCCIDUNT", "kills the pig", "kill the pig"],
  woodcut: ["LIGNA CAEDIT", "LIGNA CAEDUNT", "cuts wood", "cut wood"],
  garden: ["HORTUM COLIT", "HORTUM COLUNT", "tends the garden", "tend the garden"],
  geese: ["ANSERES CUSTODIT", "ANSERES CUSTODIUNT", "minds the geese", "mind the geese"],
  glean: ["SPICAS LEGIT", "SPICAS LEGUNT", "gleans", "glean"],
  oversee: ["OPERARIOS SPECTAT", "OPERARIOS SPECTANT", "watches the workers", "watch the workers"],
  office: ["HORAS CANIT", "HORAS CANUNT", "sings the hours", "sing the hours"],
  drink: ["CERVISIAM BIBIT", "CERVISIAM BIBUNT", "drinks ale", "drink ale"],
  feast: ["EPULATUR", "EPULANTUR", "feasts", "feast"],
  dance: ["SALTAT", "SALTANT", "dances", "dance"],
  play: ["LUDIT", "LUDUNT", "plays", "play"],
  sleep: ["DORMIT", "DORMIUNT", "sleeps", "sleep"],
  mass: ["MISSAM AUDIT", "MISSAM AUDIUNT", "hears mass", "hear mass"],
  pray: ["ORAT", "ORANT", "prays", "pray"],
  carryGrain: ["FRUMENTUM AD MOLENDINUM PORTAT", "FRUMENTUM AD MOLENDINUM PORTANT", "carries grain to the mill", "carry grain to the mill"],
  water: ["AQUAM HAURIT", "AQUAM HAURIUNT", "draws water", "draw water"],
  hall: ["IN AULA SEDET", "IN AULA SEDENT", "sits in the hall", "sit in the hall"],
  rest: ["QUIESCIT", "QUIESCUNT", "rests", "rest"],
  scare: ["AVES FUGAT", "AVES FUGANT", "scares off the birds", "scare off the birds"],
  sup: ["CENAT", "CENANT", "eats supper", "eat supper"],
  dine: ["PRANDET", "PRANDENT", "eats dinner", "eat dinner"],
};

/** "HIC AGNES PISTRIX PANEM COQUIT" / "Here Agnes the baker bakes bread". */
export function deedOne(w: Who, d: Deed): Line {
  const [sg, , ensg] = DEEDS[d];
  return L(`HIC ${la(w, "nom")} ${sg}`, `here ${en(w)} ${ensg}`);
}

/** "HIC FENUM SECANT" / "Here they mow the hay". */
export function deedMany(d: Deed, subject?: { la: string; en: string }): Line {
  const [, pl, , enpl] = DEEDS[d];
  if (subject) return L(`HIC ${subject.la} ${pl}`, `here ${subject.en} ${enpl}`);
  return L(`HIC ${pl}`, `here they ${enpl}`);
}

/** "HIC WALTERUS ET HUGO ..." (two named people). */
export function deedTwo(a: Who, b: Who, d: Deed): Line {
  const [, pl, , enpl] = DEEDS[d];
  return L(`HIC ${la(a, "nom")} ET ${la(b, "nom")} ${pl}`, `here ${en(a)} and ${en(b)} ${enpl}`);
}

export const GROUPS = {
  children: { la: "PUERI", en: "the children" },
  women: { la: "MULIERES", en: "the women" },
  men: { la: "VIRI", en: "the men" },
  all: { la: "OMNES", en: "all" },
  neighbours: { la: "VICINI", en: "the neighbours" },
  dogs: { la: "CANES", en: "the dogs" },
};

// ---------------------------------------------------------------------------
// Life
// ---------------------------------------------------------------------------

export const life = {
  born: (w: Who): Line =>
    L(`HIC ${w.sex === 1 ? "NATA" : "NATUS"} EST ${la(w, "nom")}`, `here ${en(w)} is born`),
  baptised: (w: Who): Line => L(`HIC ${la(w, "nom")} BAPTIZATUR`, `here ${en(w)} is baptised`),
  sick: (w: Who): Line => L(`HIC ${la(w, "nom")} AEGROTAT`, `here ${en(w)} lies sick`),
  visits: (a: Who, b: Who): Line => L(`HIC ${la(a, "nom")} ${la(b, "acc")} VISITAT`, `here ${en(a)} visits ${en(b)}`),
  died: (w: Who): Line => L(`HIC OBIIT ${la(w, "nom")}`, `here ${en(w)} died`),
  carried: (w: Who): Line => L(`HIC ${la(w, "nom")} AD SEPULCRUM PORTATUR`, `here ${en(w)} is carried to the grave`),
  buried: (w: Who): Line =>
    L(`HIC ${w.sex === 1 ? "SEPULTA" : "SEPULTUS"} EST ${la(w, "nom")}`, `here ${en(w)} is buried`),
  mourns: (a: Who, b: Who): Line => L(`HIC ${la(a, "nom")} ${la(b, "acc")} LUGET`, `here ${en(a)} mourns ${en(b)}`),
  bell: (): Line => L("HIC CAMPANA PULSATUR", "here the bell is rung"),
  chat: (a: Who, b: Who): Line => L(`HIC ${la(a, "nom")} ET ${la(b, "nom")} COLLOQUUNTUR`, `here ${en(a)} and ${en(b)} talk together`),
  quarrel: (a: Who, b: Who): Line => L(`HIC ${la(a, "nom")} ET ${la(b, "nom")} RIXANTUR`, `here ${en(a)} and ${en(b)} quarrel`),
  peace: (a: Who, b: Who): Line => L(`HIC ${la(a, "nom")} ET ${la(b, "nom")} PACEM FACIUNT`, `here ${en(a)} and ${en(b)} make peace`),
  priestMakesPeace: (a: Who, b: Who): Line =>
    L(`HIC SACERDOS ${la(a, "acc")} ET ${la(b, "acc")} RECONCILIAT`, `here the priest reconciles ${en(a)} and ${en(b)}`),
  courting: (a: Who, b: Who): Line => L(`HIC ${la(a, "nom")} ET ${la(b, "nom")} SIMUL AMBULANT`, `here ${en(a)} and ${en(b)} walk out together`),
  betrothed: (a: Who, b: Who): Line => L(`HIC ${la(a, "nom")} ${la(b, "acc")} DESPONSAT`, `here ${en(a)} is betrothed to ${en(b)}`),
  wedding: (a: Who, b: Who): Line =>
    L(`HIC ${la(a, "nom")} ET ${la(b, "nom")} MATRIMONIO IUNGUNTUR`, `here ${en(a)} and ${en(b)} are joined in marriage`),
  postponed: (): Line => L("HIC NUPTIAE DIFFERUNTUR", "here a wedding is put off"),
  reeve: (w: Who): Line => L(`HIC ${la({ ...w, withTrade: false }, "nom")} PRAEPOSITUS ELIGITUR`, `here ${w.name.en} is chosen reeve`),
  hunger: (): Line => L("HIC FAMEM PATIUNTUR", "here they go hungry"),
  alms: (): Line => L("HIC DOMINA PAUPERIBUS PANEM DAT", "here the lady gives bread to the poor"),
  cottage: (): Line => L("HIC DOMUS NOVA AEDIFICATUR", "here a new house is built"),
  newPriest: (w: Who): Line => L(`HIC ${la(w, "nom")} SACERDOS VENIT`, `here ${w.name.en} comes to be priest`),
  goose: (): Line => L("HIC ANSER EFFUGIT", "here a goose escapes"),
  gooseCaught: (): Line => L("HIC PUERI ANSEREM CAPIUNT", "here the children catch the goose"),
  flourHome: (w: Who): Line => L(`HIC ${la(w, "nom")} FARINAM DOMUM PORTAT`, `here ${en(w)} carries flour home`),
};

// ---------------------------------------------------------------------------
// The stranger
// ---------------------------------------------------------------------------

export const stranger = {
  comes: (again: boolean, fromForest: boolean): Line =>
    again
      ? L("HIC ADVENA ITERUM VENIT", "here the stranger comes again")
      : fromForest
        ? L("HIC ADVENA EX SILVA VENIT", "here a stranger comes out of the forest")
        : L("HIC ADVENA VENIT", "here a stranger comes"),
  childrenFollow: (): Line => L("HIC PUERI ADVENAM SEQUUNTUR", "here the children follow the stranger"),
  childFollows: (w: Who): Line => L(`HIC ${la(w, "nom")} ADVENAM SEQUITUR`, `here ${en(w)} follows the stranger`),
  greets: (w: Who): Line => L(`HIC ${la(w, "nom")} ADVENAM SALUTAT`, `here ${en(w)} greets the stranger`),
  greetsAgain: (w: Who): Line => L(`HIC ${la(w, "nom")} ADVENAM ITERUM SALUTAT`, `here ${en(w)} greets the stranger again`),
  distrusts: (w: Who): Line => L(`HIC ${la(w, "nom")} ADVENAE NON CREDIT`, `here ${en(w)} does not trust the stranger`),
  dogsBark: (): Line => L("HIC CANES ADVENAM LATRANT", "here the dogs bark at the stranger"),
  talkOf: (): Line => L("HIC DE ADVENA LOQUUNTUR", "here they talk of the stranger"),
  beckons: (w: Who): Line => L(`HIC ${la(w, "nom")} ADVENAM VOCAT`, `here ${en(w)} calls the stranger in`),
  avoids: (w: Who): Line => L(`HIC ${la(w, "nom")} ADVENAM VITAT`, `here ${en(w)} keeps away from the stranger`),
  restitched: (): Line => L("HIC ADVENA DENUO SUITUR", "here the stranger is stitched anew"),
  rests: (): Line => L("HIC ADVENA QUIESCIT", "here the stranger rests"),
  named: (w: Who): Line =>
    L(`HIC INFANS ${la(w, "nom")} EX NOMINE ADVENAE VOCATUR`, `here the child ${w.name.en} is named after the stranger`),
  blamed: (w: Who): Line =>
    L(`HIC ${la(w, "nom")} ADVENAM CULPAT`, `here ${en(w)} blames the stranger`),
};

// ---------------------------------------------------------------------------
// Water and sky
// ---------------------------------------------------------------------------

export const water = {
  rises: (): Line => L("HIC FLUMEN CRESCIT", "here the river rises"),
  floods: (): Line => L("HIC FLUMEN PRATUM INUNDAT", "here the river floods the meadow"),
  bridgeLost: (): Line => L("HIC PONS AQUIS AUFERTUR", "here the bridge is carried off by the water"),
  bridgeMended: (): Line => L("HIC PONS REFICITUR", "here the bridge is mended"),
  saveFlock: (): Line => L("HIC OVES AB AQUIS SERVANT", "here they save the sheep from the water"),
  sheepLost: (): Line => L("HIC OVIS AQUIS PERIIT", "here a sheep is lost to the water"),
  wheelRaces: (): Line => L("HIC ROTA MOLENDINI CELERITER VERTITUR", "here the mill wheel races"),
  rain: (): Line => L("HIC PLUIT", "here it rains"),
  snow: (): Line => L("HIC NINGIT", "here it snows"),
};

export const sky = {
  comet: (): Line => L("HIC STELLA COMATA APPARET", "here a hairy star appears"),
  watch: (): Line => L("ISTI MIRANTUR STELLAM", "these people wonder at the star"),
  meteors: (): Line => L("HIC STELLAE CADUNT", "here the stars fall"),
  sermon: (): Line => L("HIC SACERDOS DE STELLA PRAEDICAT", "here the priest preaches on the star"),
  pray: (): Line => L("HIC TIMENT ET ORANT", "here they are afraid and pray"),
  night: (): Line => L("HIC VILLA NOCTE DORMIT", "here the village sleeps in the night"),
};

// ---------------------------------------------------------------------------
// Fixed inscriptions and the chronicle
// ---------------------------------------------------------------------------

/** When nothing else is worth saying, the place itself. */
export const PLACE: Record<string, Line> = {
  forest: L("HIC EST SILVA", "here is the forest"),
  fields: L("HIC SUNT AGRI VILLAE", "here are the fields of the village"),
  river: L("HIC EST FLUMEN ET MOLENDINUM", "here are the river and the mill"),
  green: L("HIC EST ECCLESIA DE ASHCOMBE", "here is the church of Ashcombe"),
  manor: L("HIC EST AULA DOMINI", "here is the lord's hall"),
  common: L("HIC EST PASCUUM COMMUNE", "here is the common pasture"),
};

export const INCIPIT: Line = L("HIC INCIPIT PANNUS DE ASHCOMBE", "here begins the cloth of Ashcombe");
export const UNFINISHED: Line = L("HIC PANNUS NONDUM PERFECTUS EST", "here the cloth is not yet finished");

export const chronicle = {
  harvest: (good: boolean): Line =>
    good
      ? L("HIC MESSIS BONA COLLIGITUR", "here a good harvest is gathered in")
      : L("HIC MESSIS TENUIS COLLIGITUR", "here a thin harvest is gathered in"),
  slaughter: (): Line => L("HIC PORCOS OCCIDUNT", "here they kill the pigs for the winter"),
  feast: (): Line => L("HIC NATALI DOMINI EPULANTUR", "here they feast at Christmas"),
};

/** "TE ABSENTE" + what happened: "While you were away, Hugh was born." */
export function whileAway(parts: Line[]): Line {
  if (!parts.length) return L("TE ABSENTE VILLA VIXIT", "while you were away, the village went on living");
  const la = parts.map((p) => p.la).join(" ET ");
  const en = parts.map((p) => (/^(The|A|An) /.test(p.en) ? p.en.charAt(0).toLowerCase() + p.en.slice(1) : p.en)).join(", and ");
  return L(`TE ABSENTE ${la}`, `while you were away, ${en}`);
}

/** Past-tense fragments for "while you were away". */
export const away = {
  born: (w: Who): Line => ({ la: `${w.sex === 1 ? "NATA" : "NATUS"} EST ${w.name.nom}`, en: `${w.name.en} was born` }),
  buried: (w: Who): Line => ({ la: `${w.sex === 1 ? "SEPULTA" : "SEPULTUS"} EST ${w.name.nom}`, en: `${w.name.en} was buried` }),
  married: (a: Who, b: Who): Line => ({ la: `${a.name.nom} ET ${b.name.nom} MATRIMONIO IUNCTI SUNT`, en: `${a.name.en} and ${b.name.en} were married` }),
  harvest: (): Line => ({ la: "MESSIS COLLECTA EST", en: "the harvest was gathered in" }),
  spate: (): Line => ({ la: "FLUMEN INUNDAVIT", en: "the river flooded" }),
  comet: (): Line => ({ la: "STELLA COMATA APPARUIT", en: "a hairy star appeared" }),
  cottage: (): Line => ({ la: "DOMUS NOVA AEDIFICATA EST", en: "a new house was built" }),
};
