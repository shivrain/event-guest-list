/*
 * Claude features for the Event Guest List. Everything here goes through the gateway
 * (window.GATEWAY_URL, set in config.js); the page never holds an API key.
 *  - interpret(q): turn a sentence into filters, applied as removable chips.
 *  - ask(question): a ranked shortlist with one-line reasons, shown in the main table.
 * If the gateway is unset or unreachable, the page works exactly as before.
 */
(function (root) {
  "use strict";

  const A = { on: false, needsCode: false, model: "", busy: false };
  let api = null; // handed in by app.js: people, state, sel, FACETS, render, toast, ...
  const $ = (id) => document.getElementById(id);
  // ?gateway=http://localhost:8787 overrides config.js, for testing a gateway before pointing the live page at it.
  const override = new URLSearchParams(location.search).get("gateway");
  const base = () => String(override || root.GATEWAY_URL || "").replace(/\/$/, "");

  // ------------------------------------------------------------ gateway plumbing
  const codeKey = "egl-access-code";
  const getCode = () => { try { return localStorage.getItem(codeKey) || ""; } catch (e) { return ""; } };
  const setCode = (c) => { try { localStorage.setItem(codeKey, c); } catch (e) { /* ignore */ } };

  async function call(path, body, retry = true) {
    const headers = { "Content-Type": "application/json" };
    if (A.needsCode) {
      let code = getCode();
      if (!code) { code = prompt("This feature needs the event team's access code:") || ""; if (!code) throw new Error("cancelled"); setCode(code); }
      headers["X-Access-Code"] = code;
    }
    const res = await fetch(base() + path, { method: "POST", headers, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && data.error === "bad_code") {
      setCode("");
      if (retry) { api.toast("That code was not accepted. Try again."); return call(path, body, false); }
      throw new Error("Access code not accepted.");
    }
    if (data.error === "cap_reached") throw new Error("Today's Claude budget for this page is used up. Plain search still works.");
    if (!res.ok) throw new Error(data.error || `Gateway error ${res.status}`);
    return data;
  }

  async function init(appApi) {
    api = appApi;
    if (!base()) return;
    try {
      const h = await (await fetch(base() + "/health")).json();
      if (!h.ok || !h.configured) return;
      A.on = true; A.needsCode = !!h.needsCode; A.model = h.model || "";
      document.body.classList.add("claude-on");
      $("askBtn").hidden = false;
      if (h.capReached) $("askBtn").title = "Today's Claude budget is used up; back tomorrow.";
    } catch (e) {
      /* gateway unreachable: stay off */
    }
  }

  // ------------------------------------------------------------ what the page knows
  function facets() {
    const { people, FACETS } = api;
    const count = (fn) => { const c = new Map(); for (const p of people) for (const k of new Set(fn(p))) c.set(k, (c.get(k) || 0) + 1); return [...c].sort((a, b) => b[1] - a[1]).map(([k]) => k); };
    return {
      categories: count((p) => [p.category]),
      seniority: count((p) => [p.seniority]),
      functions: count((p) => [p.fn]),
      roleTypes: count((p) => [p.roleType]),
      regions: count((p) => p.locs.map((l) => l.region)),
      places: count((p) => p.locs.map((l) => l.region + "|" + l.place)),
      collegeGroups: count((p) => p.cols.map((c) => "g:" + c.group)),
      colleges: count((p) => p.cols.map((c) => "c:" + c.name)).slice(0, 220),
      companies: count((p) => [p.company]),
      education: count((p) => [p.edu]),
    };
  }

  // One line per person; identical on every call so the gateway can cache it.
  function roster() {
    return api.people.map((p) =>
      [p.i, p.name, p.title, p.company, p.category, p.roleType, p.locs.map((l) => l.place).join("/"), p.cols.map((c) => c.name).join("; ")]
        .map((v) => String(v || "").replace(/[|\n]/g, " ").trim()).join(" | ")).join("\n");
  }

  // ------------------------------------------------------------ interpret a sentence into filters
  async function interpret(q) {
    if (!A.on || A.busy) return;
    A.busy = true; note(`Asking Claude how to read “${q}”…`, true);
    try {
      const { filters } = await call("/interpret", { q, facets: facets() });
      if (!filters) { note("Claude could not turn that into filters. Showing plain search results instead."); return; }
      const valid = facets();
      const known = {
        loc: new Set([...valid.regions, ...valid.places]), cat: new Set(valid.categories), company: new Set(valid.companies),
        sen: new Set(valid.seniority), fn: new Set(valid.functions), role: new Set(valid.roleTypes),
        col: new Set([...valid.collegeGroups, ...api.people.flatMap((p) => p.cols.map((c) => "c:" + c.name))]), edu: new Set(valid.education),
      };
      const { state, sel } = api;
      state.sel = {}; state.picks = null; state.shortlistOnly = false;
      let applied = 0;
      for (const f of Object.keys(known)) for (const k of filters[f] || []) if (known[f].has(k)) { sel(f).add(k); applied++; }
      state.title = filters.title_contains || "";
      const t = document.querySelector("[data-title]"); if (t) t.value = state.title;
      state.q = filters.keyword || "";
      $("q").value = state.q;
      state.limit = api.PAGE; api.showTab("guests"); api.render();
      note(applied || state.title || state.q ? `Claude read this as: ${filters.understood}` : `Claude could not find filters for that. ${filters.understood}`);
    } catch (e) {
      if (e.message !== "cancelled") note("Claude is unavailable right now: " + e.message);
    } finally { A.busy = false; }
  }

  // ------------------------------------------------------------ ask for a shortlist
  async function ask(question) {
    if (!A.on || A.busy || !question.trim()) return;
    A.busy = true;
    const btn = $("askGo"); btn.disabled = true; btn.textContent = "Thinking…";
    $("askStatus").textContent = "Claude is reading the whole list. This takes 10–30 seconds.";
    try {
      const r = await call("/ask", { question: question.trim(), roster: roster() });
      const byI = new Map(api.people.map((p) => [p.i, p]));
      const picks = new Map();
      for (const pk of r.picks || []) if (byI.has(pk.id) && !picks.has(pk.id)) picks.set(pk.id, pk.reason || "");
      const { state } = api;
      state.sel = {}; state.q = ""; state.title = ""; state.shortlistOnly = false; $("q").value = "";
      const t = document.querySelector("[data-title]"); if (t) t.value = "";
      state.picks = picks.size ? picks : null; state.picksQuestion = question.trim(); state.limit = api.PAGE;
      api.showTab("guests"); api.render();
      $("askStatus").textContent = "";
      $("askSummary").hidden = false;
      $("askSummary").innerHTML = `<b>${picks.size} ${picks.size === 1 ? "person" : "people"} picked.</b> ${api.esc(r.summary || "")}${r.cost_cents ? ` <span class="muted">· ${r.cost_cents.toFixed(1)}¢</span>` : ""}`;
      if (picks.size) window.scrollTo({ top: $("count").getBoundingClientRect().top + window.scrollY - 16, behavior: "smooth" });
    } catch (e) {
      if (e.message !== "cancelled") $("askStatus").textContent = "Claude is unavailable right now: " + e.message;
    } finally { A.busy = false; btn.disabled = false; btn.textContent = "Ask Claude"; }
  }

  // ------------------------------------------------------------ small UI helpers
  function note(text, busy) {
    const el = $("aiNote");
    el.hidden = false; el.classList.toggle("busy", !!busy);
    el.innerHTML = `<span class="spark" aria-hidden="true">✦</span> ${api.esc(text)} <button type="button" class="x" id="aiNoteX" aria-label="Dismiss">×</button>`;
    $("aiNoteX").onclick = () => { el.hidden = true; };
  }

  function togglePanel(open) {
    const p = $("askPanel");
    p.hidden = open === undefined ? !p.hidden : !open;
    if (!p.hidden) { $("askQ").focus(); $("askBtn").setAttribute("aria-expanded", "true"); } else $("askBtn").setAttribute("aria-expanded", "false");
  }

  function wire() {
    $("askBtn").addEventListener("click", () => togglePanel());
    $("askClose").addEventListener("click", () => togglePanel(false));
    $("askGo").addEventListener("click", () => ask($("askQ").value));
    $("askQ").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask($("askQ").value); });
    $("askExamples").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { $("askQ").value = b.textContent; $("askQ").focus(); } });
  }
  document.addEventListener("DOMContentLoaded", wire);

  root.ClaudeAssist = { init, interpret, ask, state: A, wordCount: (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length };
})(window);
