// Ores: five, one per rarity tier (belt fields are made in expanse.js). `rock` = sprite family in assets/rocks/; `price` = credits per unit.
export const ORES = [
  { key: "ironstone", name: "Ironstone", desc: "Dull grey ore, the backbone of hull plating. Found in every belt.", rarity: "common",    tier: 0, color: "#8d8378", unitM3: 0.1, price: 5, rock: "cratered"  },
  { key: "cuprite",   name: "Cuprite",   desc: "Reddish copper ore used in wiring and capacitor coils.", rarity: "uncommon",  tier: 1, color: "#c27a46", unitM3: 0.15, price: 12, rock: "elongated" },
  { key: "cobaltine", name: "Cobaltine", desc: "Blue-veined ore prized for shield emitters and alloys.", rarity: "rare",      tier: 2, color: "#4f78c8", unitM3: 0.3, price: 30, rock: "fractured" },
  { key: "iridite",   name: "Iridite",   desc: "Pale crystalline ore; the core of warp drive lattices.", rarity: "very rare", tier: 3, color: "#b9a8d6", unitM3: 0.6, price: 80, rock: "bubble"    },
  { key: "starglass", name: "Starglass", desc: "Glassy, faintly luminous ore found only in dying belts.", rarity: "legendary", tier: 4, color: "#bfeeff", unitM3: 1.2, price: 220, rock: "layered"   },
];
