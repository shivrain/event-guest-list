/*
 * Search for the Event Guest List.
 *  - Short forms and nicknames: "IITB", "KGP", "BLR", "SF", "CXO", "MLE"…
 *  - Typo tolerance: "Bengluru", "Cartesa" still match (used when nothing matches exactly).
 *  - Ranking: a match on the name counts more than one on the company, college, title or city.
 * To teach it a new short form, add a line to ALIASES (lowercase).
 */
(function (root) {
  "use strict";

  // Phrases are rewritten to a single token before splitting the query.
  const PHRASES = [
    [/\bbay area\b|\bsilicon valley\b|\bsan francisco\b/g, "sf"],
    [/\bnew york\b/g, "nyc"],
    [/\bdelhi ncr\b/g, "ncr"],
    [/\bco[- ]?founders?\b/g, "founder"],
    [/\bmachine learning\b/g, "ml"],
    [/\bvice president\b/g, "vp"],
  ];

  const ALIASES = {
    // colleges
    iitb: ["iit bombay"], iitbombay: ["iit bombay"], iitd: ["iit delhi"], iitm: ["iit madras"], iitk: ["iit kanpur"],
    kgp: ["iit kharagpur"], iitkgp: ["iit kharagpur"], iitr: ["iit roorkee"], iitg: ["iit guwahati"], iith: ["iit hyderabad"],
    bhu: ["iit (bhu)", "banaras"], ism: ["iit (ism)"], iits: ["iit"], iitian: ["iit"], iitians: ["iit"],
    bits: ["bits pilani"], bitsian: ["bits pilani"], bitsians: ["bits pilani"], pilani: ["bits pilani"],
    iisc: ["iisc bangalore"], iiith: ["iiit hyderabad"], iiitb: ["iiit bangalore"], iiitd: ["iiit delhi"],
    nitk: ["nit karnataka"], surathkal: ["nit karnataka"], nitt: ["nit trichy"], rect: ["nit trichy"], nitw: ["nit warangal"],
    nits: ["nit "], dce: ["dtu"], dtu: ["dtu"], nsit: ["nsut"], nsut: ["nsut"], du: ["university of delhi"],
    iima: ["iim ahmedabad"], iimb: ["iim bangalore"], iimc: ["iim calcutta"], iiml: ["iim lucknow"], iimk: ["iim kozhikode"],
    iims: ["iim"], isb: ["indian school of business"], mba: ["iim", "indian school of business", "mba"],
    vit: ["vit vellore"], srm: ["srm institute"], mit: ["manipal institute of technology", "maharashtra institute of technology"],
    dps: ["delhi public school"], kv: ["kendriya vidyalaya"],
    // places
    bangalore: ["bengaluru"], banglore: ["bengaluru"], bengalore: ["bengaluru"], bengaluru: ["bengaluru"],
    bombay: ["mumbai", "bombay"], london: ["united kingdom", "london"],
    // roles
    founder: ["founder", "chief"], founders: ["founder", "chief"], cxo: ["founder / cxo", "chief"], cxos: ["founder / cxo", "chief"],
    ceo: ["ceo", "chief executive"], cto: ["cto", "chief technology"], coo: ["coo", "chief operating"], cfo: ["cfo", "chief financial"],
    vp: ["vp", "vice president"], vps: ["vp", "vice president"], head: ["head"], director: ["director"], leaders: ["vp / director / head", "founder / cxo"],
    ml: ["ml", "machine learning", "ai / ml"], mle: ["ml engineer", "machine learning engineer", "mle"], ai: ["ai / ml", " ai "],
    swe: ["software engineer", "swe"], sde: ["software", "sde"], pm: ["product manager", "product"], pms: ["product manager", "product"],
    researcher: ["research"], researchers: ["research"], scientist: ["scientist", "research"],
    vc: ["investor"], vcs: ["investor"], investors: ["investor"], advisors: ["advisor"], engineers: ["engineer"], designers: ["design"],
  };

  // Place nicknames only match where someone is based, so "NCR" does not pull in DU or DPS alumni.
  const PLACE_ALIASES = {
    blr: ["bengaluru"], gurgaon: ["gurugram"], ncr: ["delhi", "gurugram", "noida"], hyd: ["hyderabad"],
    sf: ["sf bay area"], sfo: ["sf bay area"], nyc: ["new york area"], ny: ["new york area"], la: ["los angeles"],
    usa: [" us "], america: [" us "], uk: ["united kingdom"], india: ["india"],
  };

  const STOP = new Set(["in", "at", "from", "the", "and", "of", "who", "with", "people", "person", "for", "a", "an", "to", "on", "based", "alumni", "grads", "working", "work", "works"]);

  // Field weights for ranking.
  const FIELDS = [["name", 100], ["company", 60], ["colleges", 45], ["title", 35], ["places", 30], ["category", 20], ["extra", 8]];

  function prepare(p) {
    const f = {
      name: p.name, company: p.company, colleges: p.cols.map((c) => c.name + " (" + c.group + ")").join(" · "),
      title: [p.title, p.seniority, p.fn, p.roleType].join(" · "),
      places: p.locs.map((l) => l.place + " " + l.region).join(" · ") + " · " + p.locRaw,
      category: p.category, extra: [p.eduRaw, p.degree, p.otherEdu, p.source].join(" "),
    };
    const lf = {};
    for (const k in f) lf[k] = " " + String(f[k] || "").toLowerCase() + " ";
    const words = new Set(Object.values(lf).join(" ").split(/[^a-z0-9]+/).filter((w) => w.length > 2));
    p._s = { f: lf, words };
  }

  function parse(q) {
    let s = " " + String(q || "").toLowerCase().replace(/[“”"']/g, " ") + " ";
    for (const [re, tok] of PHRASES) s = s.replace(re, " " + tok + " ");
    const tokens = s.split(/[\s,;]+/).map((t) => t.trim()).filter((t) => t && !STOP.has(t));
    return tokens.map((t) => {
      const alts = new Set([t, ...(ALIASES[t] || [])]);
      if (t.length > 4 && t.endsWith("s")) alts.add(t.slice(0, -1)); // founders -> founder
      return { t, alts: [...alts], placeAlts: PLACE_ALIASES[t] || [] };
    });
  }

  // Short terms (≤3 letters) must start a word, so "ml" does not match "html".
  function has(text, alt) {
    if (alt.length <= 3 && /^[a-z0-9]+$/.test(alt)) return new RegExp("(^|[^a-z0-9])" + alt).test(text);
    return text.includes(alt);
  }

  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        best = Math.min(best, cur[j]);
      }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  const fuzzyLimit = (t) => (t.length >= 8 ? 2 : t.length >= 4 ? 1 : 0);

  /** Score one person; 0 = no match. `fuzzy` allows small typos. Returns {score, hits:[strings]} */
  function score(p, terms, fuzzy) {
    const S = p._s;
    let total = 0;
    const hits = [];
    for (const term of terms) {
      let best = 0;
      for (const [field, w] of FIELDS) {
        const text = S.f[field];
        for (const alt of field === "places" ? term.alts.concat(term.placeAlts) : term.alts) {
          if (!has(text, alt)) continue;
          let sc = w;
          if (field === "name" && text.startsWith(" " + alt)) sc += 30;
          if (alt !== term.t) sc -= 2; // exact wording ranks slightly higher than an alias
          if (sc > best) { best = sc; }
          hits.push(alt.trim());
        }
      }
      if (!best && fuzzy) {
        const lim = fuzzyLimit(term.t);
        if (lim) for (const word of S.words) {
          if (lev(term.t, word, lim) <= lim || (term.t.length >= 5 && word.startsWith(term.t.slice(0, -1)) && word.length <= term.t.length + 3)) {
            for (const [field, w] of FIELDS) if (S.f[field].includes(word)) { best = Math.max(best, w / 2); hits.push(word); break; }
          }
        }
      }
      if (!best) return { score: 0, hits: [] };
      total += best;
    }
    return { score: total, hits };
  }

  /** Run a query over everyone. Falls back to typo-tolerant matching when nothing matches exactly. */
  function run(people, q) {
    const terms = parse(q);
    if (!terms.length) return null;
    const go = (fuzzy) => {
      const m = new Map(), hits = new Set();
      for (const p of people) { const r = score(p, terms, fuzzy); if (r.score) { m.set(p.i, r.score); r.hits.forEach((h) => hits.add(h)); } }
      return { m, hits };
    };
    let r = go(false), fuzzy = false;
    // "iit bombay" should mean the phrase, not "iit" in one college and "bombay" in another.
    const phrase = String(q).toLowerCase().replace(/\s+/g, " ").trim();
    if (terms.length > 1 && r.m.size) {
      const exact = people.filter((p) => r.m.has(p.i) && Object.values(p._s.f).some((t) => t.includes(phrase)));
      if (exact.length) { const m = new Map(); exact.forEach((p) => m.set(p.i, r.m.get(p.i))); r = { m, hits: new Set([phrase]) }; }
    }
    if (!r.m.size) { r = go(true); fuzzy = r.m.size > 0; }
    return { scores: r.m, fuzzy, terms, highlight: [...r.hits].filter((h) => h.length > 1).sort((a, b) => b.length - a.length) };
  }

  /** Wrap matched words in <mark>. `html` must already be escaped. */
  function highlight(html, words) {
    if (!words || !words.length) return html;
    const esc = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/&/g, "&amp;")).filter(Boolean);
    if (!esc.length) return html;
    const re = new RegExp("(" + esc.join("|") + ")", "gi");
    return html.split(/(<[^>]+>)/).map((part) => (part.startsWith("<") ? part : part.replace(re, "<mark>$1</mark>"))).join("");
  }

  /** Suggestions for the dropdown: colleges, companies, places, categories and people. */
  function suggest(people, q, opts) {
    const terms = parse(q);
    if (!terms.length) return [];
    // Exact (or nickname) matches first; typo-tolerant matches only if nothing matches exactly.
    const exactName = (l) => terms.every((t) => t.alts.some((a) => has(l, a)));
    const fuzzyName = (l) => terms.every((t) => t.alts.some((a) => has(l, a)) ||
      (fuzzyLimit(t.t) && l.split(/[^a-z0-9]+/).some((w) => w && lev(t.t, w, fuzzyLimit(t.t)) <= fuzzyLimit(t.t))));
    const tally = (list) => { const c = new Map(); list.forEach((k) => c.set(k, (c.get(k) || 0) + 1)); return c; };
    const region = new Map();
    people.forEach((p) => p.locs.forEach((l) => region.set(l.place, l.region)));
    const SOURCES = [
      ["College", "Colleges", tally(people.flatMap((p) => p.cols.map((c) => c.name))), (n) => "c:" + n, 4],
      ["Company", "Companies", tally(people.map((p) => p.company)), (n) => n, 4],
      ["Place", "Places", tally(people.flatMap((p) => [...new Set(p.locs.map((l) => l.place))])), (n) => region.get(n) + "|" + n, 3],
      ["Category", "AI company categories", tally(people.map((p) => p.category)), (n) => n, 2],
    ];
    const build = (test) => {
      const out = [];
      for (const [kind, label, counts, keyFn, max] of SOURCES) {
        const items = [...counts].filter(([name]) => test(" " + name.toLowerCase() + " ")).sort((a, b) => b[1] - a[1]).slice(0, max)
          .map(([name, n]) => ({ kind, label: name, count: n, facet: opts.facetOf[kind], key: keyFn(name) }));
        if (items.length) out.push({ title: label, items });
      }
      return out;
    };
    let groups = build(exactName);
    if (!groups.length) groups = build(fuzzyName);
    const r = run(people, q);
    if (r && r.scores.size) {
      const top = people.filter((p) => r.scores.has(p.i)).sort((a, b) => r.scores.get(b.i) - r.scores.get(a.i)).slice(0, 5);
      groups.push({ title: "People", items: top.map((p) => ({ kind: "Person", label: p.name, count: null, meta: p.title + " · " + p.company, person: p.i })) });
    }
    return groups;
  }

  root.Search = { prepare, parse, run, highlight, suggest, ALIASES };
})(window);
