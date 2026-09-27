import { Act, Carry, Work } from "../sim/types";

/** A few words for what a figure is doing, for the list of people in view. */
export function actWords(act: number, work: number, carry: number): string {
  switch (act) {
    case Act.Sleep:
      return "asleep";
    case Act.Sick:
      return "sick in bed";
    case Act.Eat:
      return "at table";
    case Act.Work:
      return WORK[work] ?? "at work";
    case Act.Service:
      return "at mass";
    case Act.Pray:
      return "praying";
    case Act.Drink:
      return "drinking at the alehouse";
    case Act.Chat:
      return "talking";
    case Act.Argue:
      return "quarrelling";
    case Act.Court:
      return "walking out";
    case Act.Play:
      return "playing";
    case Act.FollowStranger:
      return "following you";
    case Act.WatchStranger:
      return "watching you";
    case Act.GreetStranger:
      return "coming to greet you";
    case Act.Mourn:
      return "mourning at a grave";
    case Act.Funeral:
      return "at a funeral";
    case Act.Wedding:
      return "at a wedding";
    case Act.Carry:
      return carry === Carry.Grain ? "carrying grain to the mill" : carry === Carry.Flour ? "carrying flour home" : "waiting at the mill";
    case Act.Alms:
      return "asking for bread";
    case Act.SaveFlock:
      return "driving the sheep from the flood";
    case Act.SkyWatch:
      return "watching the sky";
    case Act.Sermon:
      return "at the sermon";
    case Act.Feast:
      return "feasting";
    case Act.Dance:
      return "dancing";
    case Act.Visit:
      return "visiting";
    case Act.Baptism:
      return "at a christening";
    case Act.ChaseGoose:
      return "chasing a goose";
    case Act.Repair:
      return "mending";
    case Act.Fetch:
      return carry === Carry.Wood ? "carrying firewood" : work === Work.Woodcut ? "gathering firewood" : "fetching water";
    case Act.Rest:
      return work === Work.Spin ? "spinning" : "resting";
    case Act.Wander:
      return "walking about";
  }
  return "about";
}

const WORK: Record<number, string> = {
  [Work.Plough]: "ploughing",
  [Work.Sow]: "sowing",
  [Work.Weed]: "weeding",
  [Work.Mow]: "mowing",
  [Work.Rake]: "raking hay",
  [Work.Reap]: "reaping",
  [Work.Bind]: "binding sheaves",
  [Work.Cart]: "carting",
  [Work.Thresh]: "threshing",
  [Work.Prune]: "pruning",
  [Work.Dig]: "digging",
  [Work.Shear]: "shearing",
  [Work.Herd]: "with the flock",
  [Work.Mill]: "grinding at the mill",
  [Work.Bake]: "baking",
  [Work.Brew]: "brewing",
  [Work.Smith]: "at the forge",
  [Work.Carpenter]: "at carpentry",
  [Work.Thatch]: "thatching",
  [Work.Spin]: "spinning",
  [Work.Weave]: "weaving",
  [Work.Garden]: "in the garden",
  [Work.Slaughter]: "killing the pig",
  [Work.Woodcut]: "cutting wood",
  [Work.Oversee]: "watching the work",
  [Work.Serve]: "serving ale",
  [Work.Geese]: "minding the geese",
  [Work.Glean]: "gleaning",
  [Work.Scare]: "scaring birds",
  [Work.Pannage]: "with the pigs",
  [Work.Office]: "saying the office",
};
