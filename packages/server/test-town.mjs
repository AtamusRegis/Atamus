// (owner, 2026-11-13) a small town made with the zone builder, for the smoke tests: two mailboxes in every zone along
// a line east of the post office, a house, a block to stand on and a gate into the second zone
export const TEST_TOWN = [
  // (owner, 2026-11-13) the world is in the sky: everything placed, the post office, ground, respawn point and podiums too
  { id: 40, k: "block", x: -60, z: -60, y: -1, w: 60, h: 1, d: 60, m: "grass" }, { id: 41, k: "block", x: 0, z: -60, y: -1, w: 60, h: 1, d: 60, m: "grass" },
  { id: 42, k: "block", x: -60, z: 0, y: -1, w: 60, h: 1, d: 60, m: "grass" }, { id: 43, k: "block", x: 0, z: 0, y: -1, w: 60, h: 1, d: 60, m: "grass" },
  { id: 44, k: "block", x: 60, z: -60, y: -1, w: 60, h: 1, d: 60, m: "grass" }, { id: 45, k: "block", x: 60, z: 0, y: -1, w: 60, h: 1, d: 60, m: "grass" },
  { id: 46, k: "block", x: 120, z: -60, y: -1, w: 60, h: 1, d: 60, m: "grass" }, { id: 47, k: "block", x: 120, z: 0, y: -1, w: 60, h: 1, d: 60, m: "grass" },
  { id: 48, k: "block", x: 180, z: -60, y: -1, w: 60, h: 1, d: 60, m: "grass" }, { id: 49, k: "block", x: 180, z: 0, y: -1, w: 60, h: 1, d: 60, m: "grass" },
  { id: 50, k: "block", x: 240, z: -60, y: -1, w: 60, h: 1, d: 60, m: "grass" }, { id: 51, k: "block", x: 240, z: 0, y: -1, w: 60, h: 1, d: 60, m: "grass" },
  { id: 52, k: "block", x: 300, z: -60, y: -1, w: 60, h: 1, d: 60, m: "grass" }, { id: 53, k: "block", x: 300, z: 0, y: -1, w: 60, h: 1, d: 60, m: "grass" },
  { id: 54, k: "office", x: 0, z: 0, y: 0, r: 0 }, { id: 55, k: "spawn", x: 0, z: 17, y: 0, r: 0 },
  { id: 56, k: "podium", x: -16, z: 12, y: 0, r: 0 }, { id: 57, k: "podium", x: -24, z: 12, y: 0, r: 0 }, { id: 58, k: "podium", x: -32, z: 12, y: 0, r: 0 },
  { id: 59, k: "start", x: 0, z: 24, y: 0, r: 0 }, { id: 60, k: "boost", x: 30, z: 0, y: 0, r: 1 }, { id: 61, k: "tree", x: -40, z: -30, y: 0, r: 0 },
  ...Array.from({ length: 10 }, (_, d) => [{ id: 1 + d * 2, k: "mailbox", x: 40 + d * 30, z: 10, y: 0, zone: d }, { id: 2 + d * 2, k: "mailbox", x: 40 + d * 30, z: -10, y: 0, zone: d }]).flat(),
  { id: 30, k: "house", x: 40, z: 20, y: 0, r: 2, zone: 0 },
  { id: 31, k: "block", x: 24, z: -24, y: 0, w: 4, h: 2, d: 4, m: "stone" },
  { id: 32, k: "gate", x: 55, z: 0, y: 0, r: 1, zone: 1 },
];
