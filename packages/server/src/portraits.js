// Character portraits (owner, 2026-10-10): 32×32 pixel art built from four layers in website/assets/portraits/:
// background, shirt (outfit style × colour), head (skin), hair — drawn in that order (owner) (style × colour). Accounts have one (the player
// character everyone sees in chat) and so does every pilot. The server keeps the part lists and checks every pick.
export const PORTRAIT_PARTS = {
  background: ["alien_jungle", "asteroid_field", "black_hole", "bridge", "cryo_bay", "cyber_city", "deepspace", "engine_room", "galaxy", "gas_giant", "green_nebula", "hangar", "holo_grid", "ice_planet", "mars_horizon", "medbay", "moon_surface", "nebula", "planet", "red_nebula", "ringed_planet", "starship_window", "station_corridor", "sun_corona", "warp_speed"],
  skin: ["pale", "light", "tan", "brown", "dark"],
  shirt: ["flightsuit", "jumpsuit", "spacesuit", "uniform", "armor"],
  shirtColor: ["navy", "teal", "forest", "mustard", "orange", "red", "purple", "gray", "black", "white"],
  hairColor: ["black", "darkbrown", "brown", "auburn", "red", "blonde", "platinum", "gray", "blue", "pink"],
  // (owner: a male / female creator) the hairstyles each offers; the art has no other differences
  hair: { male: ["buzz", "short", "quiff", "spiky", "mohawk", "shaggy", "curly"], female: ["long", "bob", "bun", "curly", "shaggy", "short", "mohawk"] },
};
const P = PORTRAIT_PARTS, pick = (a) => a[Math.floor(Math.random() * a.length)];
const KEYS = ["gender", "background", "skin", "hair", "hairColor", "shirt", "shirtColor"];

/** A valid portrait from untrusted input, or null. */
export function cleanPortrait(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const g = v.gender;
  if (g !== "male" && g !== "female") return null;
  const ok = P.background.includes(v.background) && P.skin.includes(v.skin) && P.hair[g].includes(v.hair) && P.hairColor.includes(v.hairColor) && P.shirt.includes(v.shirt) && P.shirtColor.includes(v.shirtColor);
  return ok ? Object.fromEntries(KEYS.map((k) => [k, v[k]])) : null;
}
export function randomPortrait(gender = pick(["male", "female"])) {
  return { gender, background: pick(P.background), skin: pick(P.skin), hair: pick(P.hair[gender]), hairColor: pick(P.hairColor), shirt: pick(P.shirt), shirtColor: pick(P.shirtColor) };
}
