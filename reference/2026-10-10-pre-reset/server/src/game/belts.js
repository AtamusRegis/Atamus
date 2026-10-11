// Ores: five, one per rarity tier (belt fields are made in expanse.js). Keys are the old names, kept because they're
// saved in player data (owner: refining later turns each ore into its "-ium"). `rock` = sprite family in assets/rocks/; `price` = credits per unit.
export const ORES = [
  { key: "ironstone", name: "Cryonite", desc: "Frost-rimed grey ore, the backbone of hull plating. Found in every belt.", rarity: "common",    tier: 0, color: "#8d8378", unitM3: 0.1, price: 5, rock: "cratered"  },
  { key: "cuprite",   name: "Pyroxite",   desc: "Rust-red ore that runs warm to the touch, used in wiring and capacitor coils.", rarity: "uncommon",  tier: 1, color: "#c27a46", unitM3: 0.15, price: 12, rock: "elongated" },
  { key: "cobaltine", name: "Duranite", desc: "Dense blue-veined ore prized for shield emitters and alloys.", rarity: "rare",      tier: 2, color: "#4f78c8", unitM3: 0.3, price: 30, rock: "fractured" },
  { key: "iridite",   name: "Hexite",   desc: "Pale crystalline ore that grows in six-sided lattices; the core of warp drives.", rarity: "very rare", tier: 3, color: "#b9a8d6", unitM3: 0.6, price: 80, rock: "bubble"    },
  { key: "starglass", name: "Tantalite", desc: "Dark, glassy, faintly luminous ore found only in dying belts.", rarity: "legendary", tier: 4, color: "#bfeeff", unitM3: 1.2, price: 220, rock: "layered"   },
];
