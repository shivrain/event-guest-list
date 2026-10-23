/* Event Guest List — reads data/guest-list.xlsx (the backend) and renders a searchable, filterable list. */
(function () {
  "use strict";

  const DATA_URL = "data/guest-list.xlsx";
  const PAGE = 100;
  const N = window.Normalize;

  const SEN_ORDER = ["Founder / CXO", "VP / Director / Head", "Principal / Staff", "Manager / Lead", "Senior", "Individual contributor", "Intern", "Investor / Advisor / Board"];
  const REGION_ORDER = ["US", "India", "Rest of world", "Unknown"];
  const COLLEGE_GROUPS = [
    ["IIT", "IITs"], ["NIT", "NITs"], ["IIIT", "IIITs"], ["IIM", "IIMs"],
    ["Top institutes", "BITS, IISc, ISB & other top institutes"],
    ["Other colleges & universities", "Other colleges & universities"],
    ["Schools", "Schools (school-level only)"],
    ["No Indian institution listed", "No Indian institution in source data"],
    ["Colleges abroad", "Colleges abroad (Indian-origin people)"],
    ["Education not found", "Education not found"],
  ];
  const EDU_ORDER = ["Studied in India (college)", "Studied in India (school only)", "Indian origin, studied abroad", "Indian origin, education not found", "No Indian institution listed"];

  // ------------------------------------------------------------ state
  let people = [];
  const colGroup = new Map(); // "c:IIT Bombay" -> "g:IIT"
  const state = { q: "", title: "", sel: {}, sort: "relevance", shortlistOnly: false, limit: PAGE };
  const ui = { expanded: {}, facetQ: {}, openRaw: new Set() };
  let Q = null, lastQ = null; // current search result: {scores, fuzzy, highlight}
  const runQuery = () => { if (state.q !== lastQ) { lastQ = state.q; Q = state.q ? Search.run(people, state.q) : null; } };
  const QUICK = [
    ["Founders & CXOs", "sen=Founder+%2F+CXO"],
    ["IIT alumni in Bengaluru", "col=g%3AIIT&loc=India%7CBengaluru"],
    ["Senior engineers in the Bay Area", "loc=US%7CSF+Bay+Area&sen=Principal+%2F+Staff~VP+%2F+Director+%2F+Head&fn=Engineering~AI+%2F+ML+Engineering"],
    ["IIM & ISB alumni", "col=g%3AIIM~c%3AIndian+School+of+Business+%28ISB%29"],
    ["Researchers", "fn=Research+%26+Science"],
    ["Based in India", "loc=India"],
    ["Foundation model companies", "cat=Foundation+Models"],
  ];
  let shortlist = new Set();
  try { shortlist = new Set(JSON.parse(localStorage.getItem("egl-shortlist") || "[]")); } catch (e) { /* storage unavailable */ }
  const saveShortlist = () => { try { localStorage.setItem("egl-shortlist", JSON.stringify([...shortlist])); } catch (e) { /* ignore */ } };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString("en-US");
  const toast = (msg) => { const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 1800); };

  // ------------------------------------------------------------ facets
  const FACETS = [
    { id: "loc", label: "Location", tree: "loc", open: true },
    { id: "cat", label: "AI company category", open: true },
    { id: "company", label: "Company", search: "Search companies", top: 10 },
    { id: "sen", label: "Title: seniority", order: SEN_ORDER, titleInput: true },
    { id: "fn", label: "Title: function" },
    { id: "role", label: "Role type" },
    { id: "col", label: "College", tree: "col", search: "Search colleges, e.g. IIT Bombay", open: true },
    { id: "edu", label: "Indian connection", order: EDU_ORDER },
    { id: "li", label: "LinkedIn URL", order: ["Has LinkedIn", "No LinkedIn"] },
    { id: "src", label: "Source list" },
  ];
  const sel = (f) => (state.sel[f] || (state.sel[f] = new Set()));

  function keysFor(p, f) {
    switch (f) {
      case "loc": return p.locKeys;
      case "col": return p.colKeys;
      case "cat": return [p.category];
      case "company": return [p.company];
      case "sen": return [p.seniority];
      case "fn": return [p.fn];
      case "role": return [p.roleType];
      case "edu": return [p.edu];
      case "li": return [p.linkedin ? "Has LinkedIn" : "No LinkedIn"];
      case "src": return [p.source];
    }
    return [];
  }

  function labelFor(f, key) {
    if (f === "loc") { const [r, place] = key.split("|"); return place ? place : r === "Rest of world" ? "Rest of world (all)" : r + " (all)"; }
    if (f === "col") { if (key.startsWith("g:")) { const g = COLLEGE_GROUPS.find((x) => x[0] === key.slice(2)); return "All " + (g ? g[1] : key.slice(2)); } return key.slice(2); }
    return key;
  }

  // ------------------------------------------------------------ load
  async function load() {
    const res = await fetch(DATA_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error("Could not load " + DATA_URL + " (" + res.status + ")");
    const wb = XLSX.read(await res.arrayBuffer(), { type: "array" });
    const find = (re, i) => wb.Sheets[wb.SheetNames.find((n) => re.test(n)) || wb.SheetNames[i]];
    const rows = (ws) => (ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: false }) : []);
    return {
      master: rows(find(/master|people/i, 0)),
      byCat: rows(find(/result|by category/i, 1)),
      noMatch: rows(find(/no match/i, 2)),
      coverage: rows(find(/coverage|summary/i, 3)),
    };
  }

  // "AI Leaders_GTM&Sales" -> "AI Leaders GTM & Sales"; empty -> original list
  function sourceLabel(v) {
    if (!v || /^original/i.test(v)) return "Original list (AI talent)";
    const SOURCES = [[/gtm|sales/i, "GTM & sales leaders"], [/tech leader/i, "Tech leaders"], [/foundation/i, "Foundation labs"],
      [/health|drug/i, "Health & drug discovery labs"], [/physical/i, "Physical AI labs"], [/robotic/i, "Robotics & labs"]];
    v = v.replace(/_/g, " ");
    const hit = SOURCES.find(([re]) => re.test(v));
    return hit ? hit[1] : v.replace(/_/g, " ").trim();
  }

  function buildPeople(master) {
    const head = (master[0] || []).map((h) => String(h || ""));
    const col = (re) => head.findIndex((h) => re.test(h));
    const C = {
      name: col(/^person|^name/i), company: col(/^company$/i), category: col(/category/i), title: col(/title/i),
      role: col(/role type/i), loc: col(/location/i), edu: col(/indian educational|institution/i), degree: col(/degree/i), li: col(/linkedin/i),
      src: col(/added from/i), other: col(/other education/i), conn: col(/indian connection/i),
    };
    const get = (r, i) => (i >= 0 && r[i] != null ? String(r[i]).trim() : "");
    return master.slice(1).filter((r) => get(r, C.name)).map((r, i) => {
      const p = {
        i, name: get(r, C.name), company: get(r, C.company), category: get(r, C.category) || "Uncategorised",
        title: get(r, C.title), roleType: get(r, C.role) || "Unknown", locRaw: get(r, C.loc), eduRaw: get(r, C.edu),
        degree: get(r, C.degree), linkedin: get(r, C.li), otherEdu: get(r, C.other),
        source: sourceLabel(get(r, C.src)), connection: get(r, C.conn),
      };
      if (p.linkedin && !/^https?:\/\//i.test(p.linkedin)) p.linkedin = "https://" + p.linkedin;
      p.id = p.linkedin || p.name + "|" + p.company;
      p.locs = N.location(p.locRaw);
      p.locKeys = [...new Set(p.locs.flatMap((l) => [l.region, l.region + "|" + l.place]))];
      p.cols = N.personColleges(p.eduRaw, p.connection ? p.otherEdu : "");
      p.colKeys = [...new Set(p.cols.flatMap((c) => ["g:" + c.group, "c:" + c.name]))];
      p.cols.forEach((c) => colGroup.set("c:" + c.name, "g:" + c.group));
      const groups = new Set(p.cols.map((c) => c.group));
      p.edu = /^indian origin, studied/i.test(p.connection) ? EDU_ORDER[2]
        : /^indian origin, education/i.test(p.connection) ? EDU_ORDER[3]
        : [...groups].some((g) => !["Schools", "No Indian institution listed", "Colleges abroad", "Education not found"].includes(g)) ? EDU_ORDER[0]
        : groups.has("Schools") ? EDU_ORDER[1] : EDU_ORDER[4];
      p.seniority = N.seniority(p.title, p.roleType);
      p.fn = N.functionOf(p.title);
      Search.prepare(p);
      return p;
    });
  }

  // ------------------------------------------------------------ filtering
  function passes(p, skip) {
    if (state.q && !(Q && Q.scores.has(p.i))) return false;
    if (state.title && !p.title.toLowerCase().includes(state.title.toLowerCase())) return false;
    for (const f of FACETS) {
      if (f.id === skip) continue;
      const s = state.sel[f.id];
      if (!s || !s.size) continue;
      if (!keysFor(p, f.id).some((k) => s.has(k))) return false;
    }
    return true;
  }

  function visible() {
    let list = state.shortlistOnly ? people.filter((p) => shortlist.has(p.id)) : people.filter((p) => passes(p));
    const by = (fn) => list.slice().sort((a, b) => fn(a).localeCompare(fn(b)) || a.i - b.i);
    if (state.sort === "relevance" && Q) list = list.slice().sort((a, b) => (Q.scores.get(b.i) || 0) - (Q.scores.get(a.i) || 0) || a.i - b.i);
    else if (state.sort === "name") list = by((p) => p.name);
    else if (state.sort === "company") list = by((p) => p.company + " " + p.name);
    else if (state.sort === "seniority") list = list.slice().sort((a, b) => SEN_ORDER.indexOf(a.seniority) - SEN_ORDER.indexOf(b.seniority) || a.i - b.i);
    return list;
  }

  function countsFor(fid) {
    const c = new Map();
    for (const p of people) if (passes(p, fid)) for (const k of keysFor(p, fid)) c.set(k, (c.get(k) || 0) + 1);
    return c;
  }

  // ------------------------------------------------------------ facet UI
  function buildFacetShells() {
    $("facets").innerHTML = FACETS.map((f) => `
      <details class="facet" data-f="${f.id}" ${f.open ? "open" : ""}>
        <summary>${esc(f.label)} <span class="badge" hidden></span></summary>
        <div class="facet-body">
          ${f.titleInput ? `<input type="text" data-title placeholder="Title contains, e.g. founder, ML, head" value="${esc(state.title)}">` : ""}
          ${f.search ? `<input type="search" data-fq="${f.id}" placeholder="${esc(f.search)}">` : ""}
          ${f.id === "col" ? `<p class="sub">Spellings are merged, so “IIT Delhi” and “Indian Institute of Technology, Delhi” count as one college.</p>` : ""}
          <div class="opts"></div>
        </div>
      </details>`).join("");
  }

  const optHTML = (f, key, label, n, checked, cls = "") => `
    <label class="opt ${cls} ${n ? "" : "zero"}">
      <input type="checkbox" data-f="${f}" data-k="${esc(key)}" ${checked ? "checked" : ""}>
      <span class="lbl" title="${esc(label)}">${esc(label)}</span><span class="c">${fmt(n)}</span>
    </label>`;

  function renderFacet(f) {
    const box = document.querySelector(`details[data-f="${f.id}"]`);
    const counts = countsFor(f.id);
    const s = sel(f.id);
    const fq = (ui.facetQ[f.id] || "").toLowerCase();
    let html = "";

    if (f.tree) {
      // Hierarchical: parent key ("US" / "g:IIT") and children ("US|SF Bay Area" / "c:IIT Bombay").
      const parents = f.tree === "loc" ? REGION_ORDER.map((r) => [r, r === "Rest of world" ? "Rest of world" : r]) : COLLEGE_GROUPS.map(([g, l]) => ["g:" + g, l]);
      const allKeys = new Set(people.flatMap((p) => keysFor(p, f.id)));
      for (const [pk, plabel] of parents) {
        if (!allKeys.has(pk)) continue;
        const prefix = f.tree === "loc" ? pk + "|" : "c:";
        const kids = [...allKeys].filter((k) => (f.tree === "loc" ? k.startsWith(prefix) : colGroup.get(k) === pk))
          .sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0) || a.localeCompare(b));
        const matchKids = fq ? kids.filter((k) => labelFor(f.id, k).toLowerCase().includes(fq)) : kids;
        if (fq && !matchKids.length && !plabel.toLowerCase().includes(fq)) continue;
        const pOn = s.has(pk);
        const limit = fq || ui.expanded[f.id + pk] ? Infinity : f.tree === "loc" ? (pk === "India" ? 30 : 8) : 6;
        const shown = matchKids.filter((k, i) => i < limit || s.has(k));
        if (f.tree === "col") html += `<div class="group-h"><span>${esc(plabel)}</span></div>`;
        html += optHTML(f.id, pk, f.tree === "loc" ? plabel : "All " + plabel, counts.get(pk) || 0, pOn, "parent");
        html += `<div class="children">` + shown.map((k) => optHTML(f.id, k, labelFor(f.id, k), counts.get(k) || 0, pOn || s.has(k))).join("");
        if (matchKids.length > shown.length) html += `<button class="more" data-more="${esc(f.id + pk)}">Show all ${matchKids.length}</button>`;
        else if (ui.expanded[f.id + pk]) html += `<button class="more" data-more="${esc(f.id + pk)}">Show fewer</button>`;
        html += `</div>`;
      }
    } else {
      let keys = [...new Set(people.flatMap((p) => keysFor(p, f.id)))];
      keys.sort(f.order ? (a, b) => f.order.indexOf(a) - f.order.indexOf(b) : (a, b) => (counts.get(b) || 0) - (counts.get(a) || 0) || a.localeCompare(b));
      if (fq) keys = keys.filter((k) => k.toLowerCase().includes(fq));
      const limit = f.top && !fq && !ui.expanded[f.id] ? f.top : Infinity;
      const shown = keys.filter((k, i) => i < limit || s.has(k));
      html = shown.map((k) => optHTML(f.id, k, k, counts.get(k) || 0, s.has(k))).join("");
      if (keys.length > shown.length) html += `<button class="more" data-more="${f.id}">Show all ${keys.length}</button>`;
      else if (ui.expanded[f.id]) html += `<button class="more" data-more="${f.id}">Show fewer</button>`;
    }
    box.querySelector(".opts").innerHTML = html || `<div class="small muted">No matches</div>`;
    const n = s.size + (f.titleInput && state.title ? 1 : 0);
    const badge = box.querySelector(".badge");
    badge.hidden = !n; badge.textContent = n;
  }

  function toggle(fid, key) {
    const s = sel(fid);
    const f = FACETS.find((x) => x.id === fid);
    if (!f.tree) { s.has(key) ? s.delete(key) : s.add(key); return; }
    const isParent = fid === "loc" ? !key.includes("|") : key.startsWith("g:");
    if (isParent) {
      const on = !s.has(key);
      for (const k of [...s]) if (parentOf(fid, k) === key) s.delete(k);
      on ? s.add(key) : s.delete(key);
      return;
    }
    const parent = parentOf(fid, key);
    if (s.has(parent)) {
      // Parent was on: turn it into "all children except this one".
      s.delete(parent);
      for (const k of childrenOf(fid, parent)) if (k !== key) s.add(k);
    } else s.has(key) ? s.delete(key) : s.add(key);
  }
  function parentOf(fid, key) {
    if (fid === "loc") return key.includes("|") ? key.split("|")[0] : null;
    return colGroup.get(key) || null;
  }
  function childrenOf(fid, parent) {
    const out = new Set();
    for (const p of people) for (const k of keysFor(p, fid)) if (parentOf(fid, k) === parent) out.add(k);
    return out;
  }

  // ------------------------------------------------------------ results UI
  function render() {
    state.shortlistOnly && !shortlist.size && (state.shortlistOnly = false);
    runQuery();
    $("fuzzyNote").hidden = !(Q && Q.fuzzy && !state.shortlistOnly);
    if (Q && Q.fuzzy) $("fuzzyNote").textContent = `No exact matches for “${state.q}”, so these are close matches (allowing for typos).`;
    $("clearQ").hidden = !$("q").value; $("kbd").hidden = !!$("q").value;
    FACETS.forEach(renderFacet);
    const list = visible();
    const active = FACETS.reduce((n, f) => n + sel(f.id).size, 0) + (state.title ? 1 : 0) + (state.q ? 1 : 0);
    $("count").innerHTML = state.shortlistOnly
      ? `${fmt(list.length)} <span>on your shortlist</span>`
      : `${fmt(list.length)} <span>of ${fmt(people.length)} people</span>`;
    $("activeN").textContent = active ? "(" + active + ")" : "";
    $("shortN").textContent = shortlist.size;
    $("shortlistBtn").classList.toggle("on", state.shortlistOnly);

    // Active filter chips
    let chips = "";
    if (state.shortlistOnly) chips += `<button class="chip" data-chip="short"><b>Shortlist only</b> <span class="x">×</span></button>`;
    if (state.q) chips += `<button class="chip" data-chip="q">Search: <b>${esc(state.q)}</b> <span class="x">×</span></button>`;
    if (state.title) chips += `<button class="chip" data-chip="title">Title contains: <b>${esc(state.title)}</b> <span class="x">×</span></button>`;
    for (const f of FACETS) for (const k of sel(f.id)) chips += `<button class="chip" data-chip="${f.id}" data-k="${esc(k)}">${esc(f.label.replace(/^Title: /, ""))}: <b>${esc(labelFor(f.id, k))}</b> <span class="x">×</span></button>`;
    $("chips").innerHTML = chips;

    const page = list.slice(0, state.limit);
    $("rows").innerHTML = page.map(rowHTML).join("");
    $("empty").hidden = list.length > 0;
    $("showMore").hidden = list.length <= state.limit;
    $("showMore").textContent = `Show more (${fmt(list.length - state.limit)} left)`;
    $("tabN1").textContent = fmt(people.length);
    writeHash();
  }

  function rowHTML(p) {
    const on = shortlist.has(p.id);
    const H = (t) => Search.highlight(esc(t), Q && Q.highlight);
    const conn = /^indian origin/i.test(p.connection) ? `<div class="role">${esc(p.connection)}</div>` : "";
    const cols = p.cols.length
      ? p.cols.map((c) => `<button class="tag ${c.group === "No Indian institution listed" ? "warn" : ""}" data-add="col" data-k="${esc("c:" + c.name)}" title="Filter by ${esc(c.name)}">${H(c.name)}</button>`).join("") + conn
      : `<span class="muted small">Not listed</span>`;
    const locs = p.locs.map((l) => `<button class="tag" data-add="loc" data-k="${esc(l.region + "|" + l.place)}" title="${esc(p.locRaw)}">${H(l.place)}${l.region === "US" && l.place !== "Other US" ? ", US" : ""}</button>`).join("");
    const open = ui.openRaw.has(p.id);
    return `<tr>
      <td class="chk"><button class="star ${on ? "on" : ""}" data-star="${esc(p.id)}" aria-pressed="${on}" title="${on ? "Remove from" : "Add to"} shortlist">${on ? "★" : "☆"}</button></td>
      <td><div class="name-row">${p.linkedin ? `<a class="li" href="${esc(p.linkedin)}" target="_blank" rel="noopener" title="Open LinkedIn">in</a>` : ""}<span class="name">${H(p.name)}</span></div>
        <div class="role">${esc(p.roleType)}</div></td>
      <td>${H(p.title) || `<span class="muted">—</span>`}<div class="role">${esc(p.seniority)} · ${esc(p.fn)}</div></td>
      <td><button class="tag" data-add="company" data-k="${esc(p.company)}" style="font-weight:600">${H(p.company)}</button><div class="role col-cat">${esc(p.category)}</div></td>
      <td>${locs}</td>
      <td>${cols}<div><button class="expand" data-raw="${esc(p.id)}">${open ? "Hide" : "Show"} source details</button></div>
        ${open ? `<div class="raw"><b>Education (as listed):</b> ${esc(p.eduRaw) || "—"}<br><b>Degree:</b> ${esc(p.degree) || "—"}${p.otherEdu ? `<br><b>Other education:</b> ${esc(p.otherEdu)}` : ""}<br><b>Source list:</b> ${esc(p.source)}<br><b>Location (as listed):</b> ${esc(p.locRaw) || "—"}${p.linkedin ? `<br><b>LinkedIn:</b> <a href="${esc(p.linkedin)}" target="_blank" rel="noopener">${esc(p.linkedin.replace(/^https?:\/\//, ""))}</a>` : ""}</div>` : ""}</td>
    </tr>`;
  }

  // ------------------------------------------------------------ other tabs
  function renderCompanies(byCat) {
    const rows = byCat.slice(1).filter((r) => r[1]);
    const cats = [...new Set(rows.map((r) => r[0]))].filter(Boolean);
    $("compCat").innerHTML = `<option value="">All categories</option>` + cats.map((c) => `<option>${esc(c)}</option>`).join("");
    $("tabN2").textContent = fmt(rows.length);
    const draw = () => {
      const q = $("compQ").value.toLowerCase(), c = $("compCat").value;
      $("compRows").innerHTML = rows.filter((r) => (!c || r[0] === c) && (!q || String(r[1]).toLowerCase().includes(q)))
        .map((r) => `<tr><td><button class="tag" data-company="${esc(r[1])}" style="font-weight:600" title="See these people">${esc(r[1])}</button></td><td class="col-cat muted">${esc(r[0])}</td>
          <td class="num"><b>${fmt(r[2])}</b></td><td class="num">${fmt(r[3])}</td><td class="num">${fmt(r[4])}</td><td class="num">${fmt(r[5])}</td></tr>`).join("");
    };
    $("compQ").oninput = draw; $("compCat").onchange = draw; draw();
  }

  function renderNoMatch(nm) {
    const rows = nm.slice(1).filter((r) => r[1]);
    const cats = [...new Set(rows.map((r) => r[0]))].filter(Boolean);
    $("nmCat").innerHTML = `<option value="">All categories</option>` + cats.map((c) => `<option>${esc(c)}</option>`).join("");
    $("tabN3").textContent = fmt(rows.length);
    const draw = () => {
      const q = $("nmQ").value.toLowerCase(), c = $("nmCat").value;
      $("nmRows").innerHTML = rows.filter((r) => (!c || r[0] === c) && (!q || (r[1] + " " + r[2]).toLowerCase().includes(q)))
        .map((r) => `<tr><td><b>${esc(r[1])}</b></td><td class="muted">${esc(r[0])}</td><td class="small muted">${esc(r[2])}</td></tr>`).join("");
    };
    $("nmQ").oninput = draw; $("nmCat").onchange = draw; draw();
  }

  function renderCoverage(cov) {
    const rows = cov.slice(1);
    const kv = [], notes = [];
    for (const r of rows) {
      if (!r[0]) continue;
      if (r[1] == null) { if (String(r[0]).startsWith("•")) notes.push(String(r[0]).replace(/^•\s*/, "")); else kv.push(`<div class="group-h" style="grid-column:1/-1;padding:14px 14px 6px;margin:0">${esc(r[0])}</div>`); continue; }
      kv.push(`<div>${esc(r[0])}</div><div class="v">${typeof r[1] === "number" ? fmt(r[1]) : esc(r[1])}</div>`);
    }
    $("kv").innerHTML = kv.join("");
    const outside = people.filter((p) => p.edu === EDU_ORDER[4]).length;
    $("notes").innerHTML = notes.map((n) => `<p>${esc(n)}</p>`).join("") +
      `<p><b>How this page groups the data.</b> College names are merged across spellings (for example “IIT Delhi” and “Indian Institute of Technology, Delhi”). Locations are grouped into US, India and the rest of the world, with cities for India and metro areas for the US. Seniority and function are worked out from each person's title. ${outside ? `${outside} people have no Indian institution in the source data (the original search matched them by mistake, e.g. “Susquehanna” contains “anna university”). They are grouped under “No Indian institution listed” so you can review them.` : ""}</p>`;
  }

  // ------------------------------------------------------------ URL state
  function writeHash() {
    const u = new URLSearchParams();
    if (state.q) u.set("q", state.q);
    if (state.title) u.set("title", state.title);
    if (state.sort !== "relevance") u.set("sort", state.sort);
    for (const f of FACETS) if (sel(f.id).size) u.set(f.id, [...sel(f.id)].join("~"));
    const h = u.toString();
    history.replaceState(null, "", h ? "#" + h : location.pathname + location.search);
  }
  function readHash() { applyParams(new URLSearchParams(location.hash.slice(1))); }
  function applyParams(u) {
    state.q = u.get("q") || ""; state.title = u.get("title") || ""; state.sort = u.get("sort") || "relevance";
    for (const f of FACETS) state.sel[f.id] = new Set((u.get(f.id) || "").split("~").filter(Boolean));
    $("q").value = state.q; $("sort").value = state.sort;
  }

  // ------------------------------------------------------------ export
  function exportCSV() {
    const list = visible();
    const cols = ["Name", "Title", "Company", "AI company category", "Role type", "Seniority", "Function", "Region", "City / metro", "Location (as listed)", "Colleges (merged)", "Education (as listed)", "Degree & year", "Other education", "Source list", "LinkedIn URL"];
    const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const lines = [cols.map(q).join(",")].concat(list.map((p) => [
      p.name, p.title, p.company, p.category, p.roleType, p.seniority, p.fn,
      [...new Set(p.locs.map((l) => l.region))].join("; "), p.locs.map((l) => l.place).join("; "), p.locRaw,
      p.cols.map((c) => c.name).join("; "), p.eduRaw, p.degree, p.otherEdu, p.source, p.linkedin,
    ].map(q).join(",")));
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `event-guest-list-${state.shortlistOnly ? "shortlist" : "filtered"}-${list.length}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(`Exported ${fmt(list.length)} people`);
  }

  // ------------------------------------------------------------ events
  function wire() {
    let qt;
    const commit = () => { clearTimeout(qt); state.q = $("q").value.trim(); state.shortlistOnly = false; state.limit = PAGE; showTab("guests"); render(); };
    $("q").addEventListener("input", () => { openSuggest(); clearTimeout(qt); qt = setTimeout(commit, 180); });
    $("q").addEventListener("focus", () => { if ($("q").value.trim()) openSuggest(); });
    $("q").addEventListener("blur", () => setTimeout(closeSuggest, 120));
    $("q").addEventListener("keydown", (e) => {
      const open = !$("suggest").hidden;
      if (e.key === "ArrowDown" && open) { e.preventDefault(); moveSuggest(1); }
      else if (e.key === "ArrowUp" && open) { e.preventDefault(); moveSuggest(-1); }
      else if (e.key === "Enter") { e.preventDefault(); if (open && sIdx >= 0) applySuggestion(sugg[sIdx]); else { closeSuggest(); commit(); } }
      else if (e.key === "Escape") { closeSuggest(); }
    });
    $("suggest").addEventListener("mousedown", (e) => e.preventDefault());
    $("suggest").addEventListener("click", (e) => { const b = e.target.closest("[data-si]"); if (b) applySuggestion(sugg[+b.dataset.si]); });
    $("clearQ").addEventListener("click", () => { $("q").value = ""; closeSuggest(); commit(); $("q").focus(); });
    $("quick").addEventListener("click", (e) => {
      const b = e.target.closest("[data-quick]"); if (!b) return;
      applyParams(new URLSearchParams(b.dataset.quick));
      const t = document.querySelector("[data-title]"); if (t) t.value = state.title;
      state.shortlistOnly = false; state.limit = PAGE; showTab("guests"); render();
    });
    $("sort").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
    $("showMore").addEventListener("click", () => { state.limit += PAGE; render(); });
    $("exportBtn").addEventListener("click", exportCSV);
    $("shortlistBtn").addEventListener("click", () => {
      if (!shortlist.size) return toast("Star people with ☆ to add them to your shortlist");
      state.shortlistOnly = !state.shortlistOnly; state.limit = PAGE; render();
    });
    $("copyLink").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(location.href); toast("Link to this view copied"); }
      catch (e) { prompt("Copy this link:", location.href); }
    });
    $("clearAll").addEventListener("click", () => {
      state.q = state.title = ""; $("q").value = ""; state.sel = {}; state.shortlistOnly = false; state.limit = PAGE;
      const t = document.querySelector("[data-title]"); if (t) t.value = "";
      ui.facetQ = {}; document.querySelectorAll("[data-fq]").forEach((i) => (i.value = ""));
      render();
    });
    const drawer = (open) => { $("filters").classList.toggle("open", open); $("scrim").classList.toggle("open", open); };
    $("openFilters").addEventListener("click", () => drawer(true));
    $("closeFilters").addEventListener("click", () => drawer(false));
    $("scrim").addEventListener("click", () => drawer(false));

    $("facets").addEventListener("change", (e) => {
      const t = e.target;
      if (t.matches("input[type=checkbox][data-f]")) { toggle(t.dataset.f, t.dataset.k); state.limit = PAGE; render(); }
    });
    $("facets").addEventListener("input", (e) => {
      const t = e.target;
      if (t.dataset.fq) { ui.facetQ[t.dataset.fq] = t.value; renderFacet(FACETS.find((f) => f.id === t.dataset.fq)); }
      if (t.hasAttribute("data-title")) { clearTimeout(qt); qt = setTimeout(() => { state.title = t.value.trim(); state.limit = PAGE; render(); }, 150); }
    });
    $("facets").addEventListener("click", (e) => {
      const m = e.target.closest("[data-more]");
      if (m) { ui.expanded[m.dataset.more] = !ui.expanded[m.dataset.more]; FACETS.forEach(renderFacet); }
    });
    $("chips").addEventListener("click", (e) => {
      const c = e.target.closest("[data-chip]"); if (!c) return;
      const f = c.dataset.chip;
      if (f === "short") state.shortlistOnly = false;
      else if (f === "q") { state.q = ""; $("q").value = ""; }
      else if (f === "title") { state.title = ""; const t = document.querySelector("[data-title]"); if (t) t.value = ""; }
      else sel(f).delete(c.dataset.k);
      render();
    });
    $("rows").addEventListener("click", (e) => {
      const star = e.target.closest("[data-star]");
      if (star) { const id = star.dataset.star; shortlist.has(id) ? shortlist.delete(id) : shortlist.add(id); saveShortlist(); render(); return; }
      const raw = e.target.closest("[data-raw]");
      if (raw) { const id = raw.dataset.raw; ui.openRaw.has(id) ? ui.openRaw.delete(id) : ui.openRaw.add(id); render(); return; }
      const add = e.target.closest("[data-add]");
      if (add) { const s = sel(add.dataset.add); if (!s.has(add.dataset.k)) { s.add(add.dataset.k); state.shortlistOnly = false; state.limit = PAGE; render(); window.scrollTo({ top: 0, behavior: "smooth" }); } }
    });
    $("compRows").addEventListener("click", (e) => {
      const b = e.target.closest("[data-company]"); if (!b) return;
      state.sel = { company: new Set([b.dataset.company]) }; state.q = ""; $("q").value = ""; state.title = ""; state.shortlistOnly = false;
      showTab("guests"); render(); window.scrollTo({ top: 0 });
    });
    window.addEventListener("hashchange", () => {
      readHash();
      const t = document.querySelector("[data-title]"); if (t) t.value = state.title;
      state.limit = PAGE; render();
    });
    document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));
    document.addEventListener("keydown", (e) => {
    });
  }

  // ------------------------------------------------------------ search suggestions
  let sugg = [], sIdx = -1;
  const FACET_OF = { College: "col", Company: "company", Place: "loc", Category: "cat" };
  function openSuggest() {
    const v = $("q").value.trim();
    if (!v) return closeSuggest();
    const groups = Search.suggest(people, v, { facetOf: FACET_OF });
    const words = Search.parse(v).flatMap((t) => t.alts.map((a) => a.trim())).filter((w) => w.length > 1);
    sugg = groups.flatMap((g) => g.items); sIdx = -1;
    let html = "", i = 0;
    for (const g of groups) {
      html += `<div class="sh">${esc(g.title)}</div>`;
      for (const it of g.items) html += `<button type="button" role="option" id="sg${i}" data-si="${i++}" aria-selected="false"><span class="kind">${esc(it.kind)}</span><span class="what">${Search.highlight(esc(it.label), words)}</span><span class="meta">${it.count != null ? fmt(it.count) + (it.count === 1 ? " person" : " people") : esc(it.meta)}</span></button>`;
    }
    html += `<div class="hint">${groups.length ? "Pick a suggestion to filter by it, or press Enter" : "Press Enter"} to search everything for “${esc(v)}”.</div>`;
    $("suggest").innerHTML = html; $("suggest").hidden = false; $("q").setAttribute("aria-expanded", "true");
  }
  function closeSuggest() { $("suggest").hidden = true; $("q").setAttribute("aria-expanded", "false"); $("q").removeAttribute("aria-activedescendant"); sIdx = -1; }
  function moveSuggest(d) {
    if (!sugg.length) return;
    sIdx = (sIdx + d + sugg.length) % sugg.length;
    document.querySelectorAll("#suggest [data-si]").forEach((b) => b.setAttribute("aria-selected", String(+b.dataset.si === sIdx)));
    const cur = $("sg" + sIdx); if (cur) { cur.scrollIntoView({ block: "nearest" }); $("q").setAttribute("aria-activedescendant", cur.id); }
  }
  function applySuggestion(it) {
    if (!it) return;
    if (it.person != null) { state.q = people[it.person].name; }
    else { sel(it.facet).add(it.key); state.q = ""; }
    $("q").value = state.q; closeSuggest();
    state.shortlistOnly = false; state.limit = PAGE; showTab("guests"); render();
  }

  function showTab(name) {
    document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
    for (const id of ["guests", "companies", "nomatch", "coverage"]) $("tab-" + id).hidden = id !== name;
  }

  // ------------------------------------------------------------ boot
  load().then((d) => {
    people = buildPeople(d.master);
    buildFacetShells();
    if (matchMedia("(max-width: 600px)").matches) $("q").placeholder = "Search a name, college, city…";
    $("quick").innerHTML = `<span>Quick picks:</span>` + QUICK.map(([l, h]) => `<button type="button" data-quick="${esc(h)}">${esc(l)}</button>`).join("");
    readHash();
    const t = document.querySelector("[data-title]"); if (t) t.value = state.title;
    renderCompanies(d.byCat); renderNoMatch(d.noMatch); renderCoverage(d.coverage);
    wire();
    $("loading").hidden = true;
    showTab("guests");
    render();
  }).catch((err) => {
    $("loading").innerHTML = `<div class="error"><b>Could not load the guest list.</b><br>${esc(err.message)}<br><br>If you opened this file directly from your computer, serve the folder instead (for example <code>python3 -m http.server</code>) or open the GitHub Pages URL.</div>`;
    console.error(err);
  });
})();
