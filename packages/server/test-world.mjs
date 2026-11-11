// A small town for the tests (owner, 2026-11-10: the live town is built by staff in the editor, starting from just the
// square): the starter square with a ring of road round it, houses on all four sides, three vans, a helicopter, a ramp
// up to a raised road, and the housing plots placed.
export function testWorld(W) {
  const base = W.starterWorld(), cells = new Map(base.cells.map((c) => [c[0] + "," + c[1] + "," + c[2], c]));
  const put = (i, j, k, t, d = 0) => cells.set(i + "," + j + "," + k, [i, j, k, W.KINDS.indexOf(t), d]);
  for (let n = -8; n <= 7; n++) { put(n, -8, 0, "road"); put(n, 7, 0, "road"); put(-8, n, 0, "road"); put(7, n, 0, "road"); }
  put(8, 0, 0, "land"); put(8, 0, 1, "ramp", 1); put(9, 0, 0, "land"); put(9, 0, 1, "road");   // up a step from the ring
  const things = []; let id = 1;
  for (let n = -6; n <= 6; n += 2) {
    things.push({ id: id++, k: "house", i: n, j: -6, y: 0, d: 2 }, { id: id++, k: "house", i: n, j: 6, y: 0, d: 0 });
    if (Math.abs(n) < 6) things.push({ id: id++, k: "house", i: -6, j: n, y: 0, d: 3 }, { id: id++, k: "house", i: 6, j: n, y: 0, d: 1 });
  }
  things.push({ id: 100, k: "van", i: -8, j: -8, y: 0 }, { id: 101, k: "van", i: 7, j: 2, y: 0 }, { id: 102, k: "van", i: 0, j: 7, y: 0 });
  things.push({ id: 200, k: "heli", i: 0, j: 0, y: 0, r: 80 }, { id: 300, k: "tree", i: -3, j: -9, y: 0 }, { id: 301, k: "boost", i: 0, j: -8, y: 0, d: 1 });
  W.PLOTS.forEach((p, n) => things.push({ id: 400 + n, k: "plot", i: -10 + (n % 4) * 4, j: 12 + Math.floor(n / 4) * 4, y: 0, p: n }));
  return { v: 1, cells: [...cells.values()], things };
}
