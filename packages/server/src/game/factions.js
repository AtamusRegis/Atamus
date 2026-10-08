// Factions and corporations of the Expanse (names only for now; NPC behaviour comes later).
// kind: "maker" builds a hull line, "corp" is a player corporation, "law" is the police,
// "gang" is an NPC pirate outfit. weapon: what they fight with (for later combat matchups).
export const FACTIONS = [
  { key: "emo", name: "Expanse Mining Operations", short: "EMO", kind: "maker", line: "mining", tagline: "Every ton accounted for." },
  { key: "edi", name: "Expanse Defense Industries", short: "EDI", kind: "maker", line: "combat", tagline: "Hulls for pilots who defend themselves." },
  { key: "eta", name: "Expanse Transit Authority", short: "ETA", kind: "law", weapon: "omni", tagline: "Response is a promise." },
  { key: "kindlers",   name: "Kindlers",   kind: "gang",  weapon: "missile", tagline: "Burn it all down." },
  { key: "halcyon",    name: "Halcyon",    kind: "gang",  weapon: "laser",   tagline: "Nothing hides from the light." },
  { key: "tollmen",    name: "Tollmen",    kind: "gang",  weapon: "bullet",  tagline: "Pay the toll or feed the dust." },
  { key: "vasko",      name: "Vasko",      kind: "gang",  weapon: "hybrid",  tagline: "Everything has a price. Including you." },
  { key: "meridian",   name: "Meridian",   kind: "corp",  tagline: "Where every pilot starts." },
];
