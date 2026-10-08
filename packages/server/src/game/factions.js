// Factions and corporations of the Expanse (names only for now; NPC behaviour comes later).
// kind: "maker" builds a hull line, "corp" is a player corporation, "law" is the police,
// "pirate" an outlaw NPC outfit, "competitor" a rival corporation that takes belts by force. weapon: what they fight with (for later combat matchups).
export const FACTIONS = [
  { key: "dci", name: "Deep Core Industries", short: "DCI", kind: "maker", line: "mining", starting: true,   // builds the mining hulls and is every new pilot's corp tagline: "Every ton accounted for." },
  { key: "odi", name: "Orbital Defense Industries", short: "ODI", kind: "maker", line: "combat", tagline: "Hulls for pilots who defend themselves." },
  { key: "eta", name: "Expanse Transit Authority", short: "ETA", kind: "law", weapon: "omni", tagline: "Response is a promise." },
  { key: "raiders",  name: "Belt Raiders",              short: "BR",  kind: "pirate",     weapon: "bullet",  tagline: "Pay the toll or feed the dust." },
  { key: "fsu",      name: "Free Salvage Union",        short: "FSU", kind: "pirate",     weapon: "missile", tagline: "If it's broken, it's ours." },
  { key: "cot",      name: "Consolidated Ore Trading",  short: "COT", kind: "competitor", weapon: "hybrid",  tagline: "Everything has a price." },
  { key: "hrg",      name: "Helios Resource Group",     short: "HRG", kind: "competitor", weapon: "laser",   tagline: "Nothing hides from the light." },
];
