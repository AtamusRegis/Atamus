// (owner, 2026-10-11) A filter for names (accounts, pilots, ships) and for flagging chat: racist, slurs, extremist, sexual
// and profane terms, including leet-speak and padded spellings ("n1gg3r", "f u c k", "fuuuck"); chat is also flagged
// for naming a people ("jews", "mexicans"). Players may say what they like in chat; flagged Local / Corp lines go to the
// admin panel's Chat log (never DMs).
//
// How it reads a text: accents dropped, lowercased, leet digits and symbols turned into letters, then (1) the letters run
// together with repeats squashed, checked for terms that are offensive anywhere inside a word (after taking out
// ordinary words that contain them, e.g. "cockpit", "scunthorpe"), and (2) each word on its own (split on spaces,
// punctuation and camelCase) checked for short terms that only count as a whole word ("ass", not "class").

const CATS = {
  racist: {
    anywhere: ["nigger", "nigga", "niggah", "niglet", "sandnigger", "wetback", "raghead", "towelhead", "jigaboo", "porchmonkey", "darkie", "beaner", "zipperhead", "gypsyscum", "redskin"],
    word: ["nig", "nigs", "chink", "chinks", "gook", "gooks", "spic", "spics", "kike", "kikes", "coon", "coons", "paki", "pakis", "negro", "negroes", "jap", "japs", "wop", "wops", "wog", "wogs", "honky", "honkies", "gringo", "gringos", "dago", "dagos", "kraut", "krauts", "injun", "injuns"],
  },
  // (owner) slurs about who someone is (sexuality, gender, disability)
  slurs: {
    anywhere: ["faggot", "faggit", "retard", "shemale"],
    word: ["fag", "fags", "dyke", "dykes", "tranny", "trannies", "queer", "queers", "tard", "tards", "spaz", "spastic", "homo", "homos", "lesbo", "lesbos"],
  },
  extremist: {
    anywhere: ["hitler", "heilhitler", "siegheil", "nazi", "neonazi", "kukluxklan", "swastika", "zyklon", "whitepower", "whitepride", "jihad", "gaschamber", "gasthejews", "killalljews", "holocaustdenial"],
    word: ["isis", "aryan", "reich", "heil", "fuhrer", "gestapo", "waffenss", "jihadi", "jihadist"],
  },
  sexual: {
    anywhere: ["porn", "porno", "cumshot", "jizz", "blowjob", "handjob", "rimjob", "dildo", "vibrator", "horny", "milf", "orgasm", "hentai", "fetish", "bdsm", "incest", "pedophile", "paedophile", "molest", "rapist", "whore", "slut", "pussy", "penis", "vagina", "boobs", "boobies", "titties", "erection", "masturbat", "cock", "nsfw", "deepthroat", "creampie", "gangbang", "bukkake"],
    word: ["sex", "sexy", "cum", "cums", "tit", "tits", "anal", "anus", "rape", "raped", "rapes", "hoe", "hoes", "dick", "dicks", "boob", "nude", "nudes", "orgy", "pedo", "pedos", "loli", "dong", "schlong", "clit", "cunnilingus", "fellatio", "twink", "thot", "sext"],
  },
  profanity: {
    anywhere: ["fuck", "fuk", "fck", "fuq", "shit", "cunt", "bitch", "bastard", "asshole", "twat", "wank", "bollock", "motherf", "dumbass", "jackass", "dipshit"],
    word: ["ass", "arse", "prick", "piss", "pissed", "damn", "crap", "fucker", "biatch", "douche", "douchebag", "skank", "idiot", "moron", "loser"],
  },
  // (owner) a people named (race, nationality, religion): not refused anywhere, only shown to admins in chat
  groups: {
    anywhere: [],
    word: ["jew", "jews", "jewish", "mexican", "mexicans", "indian", "indians", "muslim", "muslims", "arab", "arabs", "asian", "asians", "chinese", "african", "africans", "hispanic", "hispanics", "latino", "latinos", "gypsy", "gypsies", "immigrant", "immigrants", "japanese", "korean", "koreans", "pakistani", "pakistanis", "russian", "russians", "irish", "polish", "jewry"],
  },
};
// what each is called in the admin panel
export const CAT_NAMES = { racist: "Racist", groups: "Groups", hostile: "Group hostility", slurs: "Slurs", profanity: "Profanity", sexual: "Sexual", extremist: "Extremist" };
// (owner) naming a people is often harmless, but a contemptuous word just before it ("dirty", "filthy", "evil" ...) is
// "hostile": weighted like slurs, it can mute at once and the staff are told straight away (chat only, never names)
const HOSTILE = new Set(["dirty", "filthy", "filthie", "bad", "evil", "disgusting", "nasty", "vile", "worthless", "subhuman", "stupid", "dumb", "lazy", "greedy", "savage", "savages", "inferior", "rotten", "scum", "scummy", "trash", "trashy", "ugly", "damn", "damned", "smelly", "stinking", "stinky", "useless", "sneaky", "thieving", "backward", "primitive", "animal", "animals", "vermin", "parasite", "parasites", "cursed", "godless", "sick", "gross", "lowlife", "degenerate"]);
// names refuse all but naming a people; chat lines are flagged for all of them (owner)
const NAME_CATS = ["racist", "slurs", "extremist", "sexual", "profanity"];
// ordinary words that contain an "anywhere" term (squashed like the text): taken out before checking
const ALLOW = ["peacock", "cockpit", "cocktail", "cockatoo", "cockatiel", "cockroach", "hancock", "hitchcock", "shuttlecock", "woodcock", "gamecock", "weathercock", "babcock", "alcock", "scunthorpe", "shitake", "shiitake", "snigger", "sniggering", "swank", "swanky", "thorny", "therapist", "pussycat", "pussywillow", "penistone", "retardant", "nazir", "nazih", "hitlerite"]
  .map((w) => w.replace(/(.)\1+/g, "$1"));
const LEET = { "0": "o", "1": "i", "!": "i", "|": "i", "3": "e", "4": "a", "@": "a", "5": "s", "$": "s", "7": "t", "+": "t", "8": "b", "9": "g", "6": "g", "€": "e", "¡": "i" };
const squash = (s) => s.replace(/(.)\1+/g, "$1");
function leet(s) {
  let out = ""; for (const ch of String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()) out += LEET[ch] ?? ch;
  return out;
}
// whole-word terms are matched as written ("boob" must not become "bob"); a term without doubled letters also matches its
// stretched spellings ("seeexy" → "sexy")
// (owner) words the admins asked for and the Head Admin approved (admin panel › Words), in their category: read the same way
// (leet, padding); 5 letters or more count anywhere in a word, shorter ones only as a whole word
let extra = [], repealed = new Set();
const SQ = {};
function build() {
  for (const [cat, l] of Object.entries(CATS)) {
    const any = l.anywhere.filter((w) => !repealed.has(w)), word = l.word.filter((w) => !repealed.has(w));   // (owner) words the Head Admin repealed: not filtered
    for (const x of extra) if (x.cat === cat) (x.word.length >= 5 ? any : word).push(x.word);
    SQ[cat] = { anywhere: any.map(squash), word: new Set(word), wordSq: new Set(word.filter((w) => squash(w) === w)) };
  }
}
build();
/** A word as the filter reads it (accents dropped, leet turned to letters, only letters): how requested words are kept. */
export const filterForm = (raw) => leet(String(raw)).replace(/[^a-z]/g, "");
/** A name as compared with the banned names: read like the filter does (leet, padding), so "T3st3rman" is "Testerman". */
export const nameKey = (raw) => squash(filterForm(raw));
export const CATEGORY_KEYS = Object.keys(CATS);
/** The approved requested words ([{ word, cat }]). */
export function setExtraWords(list, repeal = []) { repealed = new Set(repeal.map((w) => filterForm(w))); extra = list.filter((x) => x && CATS[x.cat] && typeof x.word === "string" && x.word.length >= 2 && !repealed.has(filterForm(x.word))).map((x) => ({ word: filterForm(x.word), cat: x.cat })); build(); }
/** Is this word (as the filter reads it) one of the built-in or approved ones? */
export const isFiltered = (w) => { const f = filterForm(w); return Object.values(CATS).some((l) => l.anywhere.includes(f) || l.word.includes(f)) || extra.some((x) => x.word === f); };
const wordHit = (c, plain) => { const sq = squash(plain); return SQ[c].word.has(plain) || SQ[c].wordSq.has(sq); };
const words = (raw) => String(raw).replace(/([a-z])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9@$!|+€¡À-ɏ]+/).filter(Boolean);

/** What a text contains: { bad, cats: [categories], words: [the words of the text that matched] }. `forNames`: the
 *  categories a name can't have (chat is flagged for every category). */
export function scan(raw, forNames = false) {
  const cats = new Set(), hit = new Set();
  const cats0 = forNames ? NAME_CATS : Object.keys(CATS);
  const test = (text) => {   // one word or the whole text, run together
    const found = [];
    let joined = squash(leet(text).replace(/[^a-z]/g, ""));
    for (const a of ALLOW) joined = joined.split(a).join("_");
    for (const c of cats0) if (SQ[c].anywhere.some((t) => joined.includes(t))) found.push(c);
    return found;
  };
  for (const c of test(raw)) cats.add(c);
  for (const w of words(raw)) {
    const t = leet(w).replace(/[^a-z]/g, ""), local = new Set(test(w));
    for (const c of cats0) if (wordHit(c, t) || (t.endsWith("s") && wordHit(c, t.slice(0, -1)))) local.add(c);
    if (/^k+$/.test(leet(w).replace(/[^a-z]/g, "")) && leet(w).replace(/[^a-z]/g, "").length >= 3 && cats0.includes("extremist")) local.add("extremist");   // kkk
    if (local.size) { hit.add(w); for (const c of local) cats.add(c); }
  }
  if (/(^|\D)1488(\D|$)/.test(String(raw)) && cats0.includes("extremist")) { cats.add("extremist"); hit.add("1488"); }
  if (!forNames && cats.has("groups")) {                     // (owner) a contemptuous word up to two words before a people named
    const ws = words(raw), plain = ws.map((w) => squash(leet(w).replace(/[^a-z]/g, "")));
    ws.forEach((w, i) => { const t = leet(w).replace(/[^a-z]/g, ""); if (!(wordHit("groups", t) || (t.endsWith("s") && wordHit("groups", t.slice(0, -1))))) return;
      for (const j of [i - 1, i - 2]) if (j >= 0 && (HOSTILE.has(plain[j]) || HOSTILE.has(leet(ws[j]).replace(/[^a-z]/g, "")))) { cats.add("hostile"); hit.add(ws[j]); } });
  }
  // spelled out with spaces or dots ("n i g g e r", "f.u.c.k"): the run-together check above catches it; mark the letters
  if (cats.size && !hit.size) for (const w of words(raw)) if (w.length <= 2) hit.add(w);
  return { bad: cats.size > 0, cats: [...cats], words: [...hit] };
}
/** (owner) A chat line as others see it: banned words (every category but naming a people) become asterisks. */
export function censor(raw) {
  const r = scan(raw, true); if (!r.bad) return raw;
  const hits = new Set(r.words), long = r.words.filter((w) => w.length >= 3).sort((a, b) => b.length - a.length);
  return String(raw).split(/([^A-Za-z0-9@$!|+€¡À-ɏ]+)/).map((tok, i) => {
    if (i % 2) return tok;                                   // a separator
    if (hits.has(tok)) return "*".repeat(tok.length);
    for (const h of long) if (tok.includes(h)) tok = tok.split(h).join("*".repeat(h.length));   // inside a longer word ("ShitLord")
    return tok;
  }).join("");
}
/** A name (account, pilot, ship): null if it's fine, else why not. */
export const nameProblem = (name) => (scan(name, true).bad ? "That name isn't allowed." : null);
