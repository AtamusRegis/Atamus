// (owner, 2026-10-11) A filter for names (accounts, pilots, ships) and for flagging chat: sexual, racist and extremist
// terms (names also refuse plain profanity), including leet-speak and padded spellings ("n1gg3r", "f u c k", "fuuuck").
// Players may say what they like in chat; flagged Local / Corp lines go to the admin panel's Chat log (never DMs).
//
// How it reads a text: accents dropped, lowercased, leet digits and symbols turned into letters, then (1) the letters run
// together with repeats squashed, checked for terms that are offensive anywhere inside a word (after taking out
// ordinary words that contain them, e.g. "cockpit", "scunthorpe"), and (2) each word on its own (split on spaces,
// punctuation and camelCase) checked for short terms that only count as a whole word ("ass", not "class").

const CATS = {
  racist: {
    anywhere: ["nigger", "nigga", "niggah", "niglet", "sandnigger", "faggot", "faggit", "wetback", "raghead", "towelhead", "jigaboo", "porchmonkey", "darkie", "retard", "beaner", "zipperhead", "gypsyscum"],
    word: ["nig", "nigs", "chink", "chinks", "gook", "gooks", "spic", "spics", "kike", "kikes", "coon", "coons", "paki", "pakis", "fag", "fags", "dyke", "dykes", "tranny", "trannies", "negro", "negroes", "shemale"],
  },
  extremist: {
    anywhere: ["hitler", "heilhitler", "siegheil", "nazi", "neonazi", "kukluxklan", "swastika", "zyklon", "whitepower", "whitepride", "jihad", "gaschamber", "gasthejews", "killalljews", "holocaustdenial"],
    word: ["isis", "aryan", "reich", "heil", "fuhrer", "gestapo", "waffenss", "jihadi", "jihadist"],
  },
  sexual: {
    anywhere: ["porn", "porno", "cumshot", "jizz", "blowjob", "handjob", "rimjob", "dildo", "vibrator", "horny", "milf", "orgasm", "hentai", "fetish", "bdsm", "incest", "pedophile", "paedophile", "molest", "rapist", "whore", "slut", "pussy", "penis", "vagina", "boobs", "boobies", "titties", "erection", "masturbat", "cock", "nsfw", "deepthroat", "creampie", "gangbang", "bukkake"],
    word: ["sex", "sexy", "cum", "cums", "tit", "tits", "anal", "anus", "rape", "raped", "rapes", "hoe", "hoes", "dick", "dicks", "boob", "nude", "nudes", "orgy", "pedo", "pedos", "loli", "dong", "schlong", "clit", "cunnilingus", "fellatio", "twink", "thot", "sext"],
  },
  profanity: {   // names only
    anywhere: ["fuck", "fuk", "fck", "fuq", "shit", "cunt", "bitch", "bastard", "asshole", "twat", "wank", "bollock", "motherf"],
    word: ["ass", "arse", "prick", "piss", "pissed", "damn", "crap", "fucker", "biatch", "jackass", "dumbass"],
  },
};
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
const SQ = {}; for (const [cat, l] of Object.entries(CATS)) SQ[cat] = { anywhere: l.anywhere.map(squash), word: new Set(l.word), wordSq: new Set(l.word.filter((w) => squash(w) === w)) };
const wordHit = (c, plain) => { const sq = squash(plain); return SQ[c].word.has(plain) || SQ[c].wordSq.has(sq); };
const words = (raw) => String(raw).replace(/([a-z])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9@$!|+€¡À-ɏ]+/).filter(Boolean);

/** What a text contains: { bad, cats: [categories], words: [the words of the text that matched] }. `forNames` adds
 *  plain profanity. */
export function scan(raw, forNames = false) {
  const cats = new Set(), hit = new Set();
  const cats0 = Object.keys(CATS).filter((c) => forNames || c !== "profanity");
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
  // spelled out with spaces or dots ("n i g g e r", "f.u.c.k"): the run-together check above catches it; mark the letters
  if (cats.size && !hit.size) for (const w of words(raw)) if (w.length <= 2) hit.add(w);
  return { bad: cats.size > 0, cats: [...cats], words: [...hit] };
}
/** A name (account, pilot, ship): null if it's fine, else why not. */
export const nameProblem = (name) => (scan(name, true).bad ? "That name isn't allowed." : null);
