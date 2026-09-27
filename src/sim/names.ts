/**
 * Given names common in fourteenth-century English villages, with the Latin
 * forms a clerk would have written: nominative, accusative, ablative and
 * genitive. None of the villagers is a real person.
 */

export interface GivenName {
  en: string;
  sex: 0 | 1;
  nom: string;
  acc: string;
  abl: string;
  gen: string;
}

const second = (en: string, stem: string): GivenName => ({
  en,
  sex: 0,
  nom: `${stem}US`,
  acc: `${stem}UM`,
  abl: `${stem}O`,
  gen: `${stem}I`,
});
const first = (en: string, stem: string): GivenName => ({
  en,
  sex: 1,
  nom: `${stem}A`,
  acc: `${stem}AM`,
  abl: `${stem}A`,
  gen: `${stem}AE`,
});
const third = (en: string, sex: 0 | 1, nom: string, stem: string): GivenName => ({
  en,
  sex,
  nom,
  acc: `${stem}EM`,
  abl: `${stem}E`,
  gen: `${stem}IS`,
});

export const MALE_NAMES: readonly GivenName[] = [
  third("John", 0, "IOHANNES", "IOHANN"),
  second("William", "WILLELM"),
  second("Walter", "WALTER"),
  second("Robert", "ROBERT"),
  second("Richard", "RICARD"),
  { en: "Thomas", sex: 0, nom: "THOMAS", acc: "THOMAM", abl: "THOMA", gen: "THOMAE" },
  third("Hugh", 0, "HUGO", "HUGON"),
  second("Roger", "ROGER"),
  second("Geoffrey", "GALFRID"),
  second("Henry", "HENRIC"),
  second("Nicholas", "NICHOLA"),
  { en: "Adam", sex: 0, nom: "ADAM", acc: "ADAM", abl: "ADAM", gen: "ADAE" },
  third("Simon", 0, "SIMON", "SIMON"),
  second("Ralph", "RADULF"),
  second("Gilbert", "GILBERT"),
  second("Peter", "PETR"),
  second("Stephen", "STEPHAN"),
  { en: "Laurence", sex: 0, nom: "LAURENTIUS", acc: "LAURENTIUM", abl: "LAURENTIO", gen: "LAURENTII" },
  second("Martin", "MARTIN"),
  second("Osbert", "OSBERT"),
  second("Alan", "ALAN"),
  second("Philip", "PHILIPP"),
  second("Benedict", "BENEDICT"),
  third("Hamo", 0, "HAMO", "HAMON"),
  { en: "Elias", sex: 0, nom: "ELIAS", acc: "ELIAM", abl: "ELIA", gen: "ELIAE" },
  third("Ivo", 0, "IVO", "IVON"),
  second("Jordan", "IORDAN"),
  second("Warin", "WARIN"),
];

export const FEMALE_NAMES: readonly GivenName[] = [
  third("Agnes", 1, "AGNES", "AGNET"),
  first("Alice", "ALICI"),
  first("Maud", "MATILD"),
  first("Joan", "IOHANN"),
  first("Emma", "EMM"),
  first("Isabel", "ISABELL"),
  first("Cecily", "CECILI"),
  first("Margery", "MARGERI"),
  first("Edith", "EDITH"),
  third("Beatrice", 1, "BEATRIX", "BEATRIC"),
  first("Avice", "AVICI"),
  first("Mabel", "MABILI"),
  first("Rose", "ROS"),
  first("Juliana", "IULIAN"),
  first("Denise", "DIONISI"),
  first("Christina", "CHRISTIN"),
  first("Lettice", "LETICI"),
  first("Sibyl", "SIBILL"),
  first("Amice", "AMICI"),
  first("Katherine", "KATERIN"),
  first("Idonea", "IDONE"),
  first("Petronel", "PETRONILL"),
];

/** The name the village gives a child named for the stranger. */
export const PEREGRINE: Record<0 | 1, GivenName> = {
  0: second("Peregrine", "PEREGRIN"),
  1: first("Peregrine", "PEREGRIN"),
};

export function nameByKey(key: string): GivenName {
  const [sex, en] = key.split(":");
  const list = sex === "1" ? FEMALE_NAMES : MALE_NAMES;
  const found = list.find((n) => n.en === en);
  if (found) return found;
  if (en === "Peregrine") return PEREGRINE[sex === "1" ? 1 : 0];
  return list[0];
}

export function nameKey(n: GivenName): string {
  return `${n.sex}:${n.en}`;
}

/** Household bynames: work, place and nickname, as they were then. */
export const BYNAMES_PLACE = [
  "atte Wood",
  "atte Brook",
  "atte Green",
  "Underhill",
  "atte Well",
  "Bywater",
  "atte Lane",
  "Westcombe",
  "atte Hethe",
  "Townsend",
];

export const BYNAMES_NICK = [
  "Long",
  "Brown",
  "Small",
  "Gosling",
  "Sparrow",
  "Wren",
  "Fairchild",
  "Goodhew",
  "Crane",
  "Hayward",
  "Coke",
  "Tanner",
  "Dunning",
  "Pecke",
  "Russel",
  "Blanchard",
];
