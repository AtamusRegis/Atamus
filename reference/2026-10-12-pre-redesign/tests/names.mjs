// The name filter (namefilter.js): sexual, racist and extremist terms (and, for names, profanity), leet-speak and
// spaced-out spellings caught; ordinary words that happen to contain them left alone.
import { scan, nameProblem } from "../../packages/server/src/namefilter.js";
import { suite } from "./lib.mjs";
const t = suite("names");
const bad = ["n1gg3r", "N I G G E R", "fuuuck", "BigDickEnergy", "xXHitlerXx", "h1tl3r", "kkk", "1488", "isis fan", "PornStar", "p0rn", "c0ck", "Sh1t", "a$$", "Rape Bot", "Spic", "faggot", "5exy", "nazi", "whitepower", "f.u.c.k", "ArseLord"];
const good = ["Vera Kestrel", "Peacock", "Cockpit", "Scunthorpe", "Assassin", "Classic", "Grape", "Therapist", "Cocktail", "Crisis", "Raccoon", "Document", "Cucumber", "Analysis", "Spice", "Hancock", "Sussex", "Titan", "Pakistan", "Maryanne", "Torpedo", "Nazareth", "Massive", "Dickens", "Shoe", "Thorny", "Georgy", "Mississippi", "Nyssary", "Compass", "Sextant", "Analog", "Vera K", "Bob", "Ace As Pilot", "Kay"];
t.ok(bad.every((x) => nameProblem(x)), "bad names are refused, however they're spelled", bad.filter((x) => !nameProblem(x)));
t.ok(good.every((x) => !nameProblem(x)), "ordinary names that contain those letters are fine", good.filter((x) => nameProblem(x)));
const c = scan("you n1gger, nice porn lol");
t.ok(c.bad && c.cats.includes("racist") && c.cats.includes("sexual") && c.words.join() === "n1gger,porn", "a chat line: its categories and the words to highlight", c);
t.ok(scan("well shit, that was close").cats.join() === "profanity" && nameProblem("ShitLord"), "plain profanity: refused in names, flagged in chat (owner)");
{ const g = scan("the jews and mexicans"), q = scan("you queer retard"), j = scan("dirty japs");
  t.ok(g.cats.join() === "groups" && !nameProblem("Mexican") && q.cats.join() === "slurs" && nameProblem("Queer") && j.cats.join() === "racist", "chat: a people named (Groups), slurs, racist names; names refuse slurs but not a people (owner)", { g, q, j }); }
t.done();
