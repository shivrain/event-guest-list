/*
 * Event Guest List gateway.
 *
 * The page on GitHub Pages cannot hold an API key, so it calls this Worker instead.
 * The Worker holds the key, checks where the request came from, limits each visitor,
 * caps daily spend, and forwards two kinds of request to Claude:
 *   POST /interpret  { q, facets }      -> filters the page can apply
 *   POST /ask        { question, roster } -> a ranked shortlist with reasons
 *   GET  /health                         -> what the page needs to know to switch the feature on
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { AskOutput, ASK_SYSTEM, FacetsSchema, InterpretOutput, interpretSystem } from "./prompts";

export interface Env {
  ANTHROPIC_API_KEY?: string;
  ACCESS_CODE?: string;
  ALLOWED_ORIGINS: string;
  DAILY_CAP_CENTS: string;
  MODEL: string;
  MOCK?: string; // local dev only: "1" answers without calling Claude
  RATE_LIMIT: { limit: (opts: { key: string }) => Promise<{ success: boolean }> };
  SPEND: KVNamespace;
}

// US cents per million tokens for claude-sonnet-5-5.
const PRICE = { input: 200, cacheWrite: 250, cacheRead: 20, output: 1000 };

const InterpretBody = z.object({ q: z.string().min(1).max(300), facets: FacetsSchema });
const AskBody = z.object({
  question: z.string().min(1).max(1000),
  roster: z.string().min(1).max(400_000),
  rosterHash: z.string().max(64).optional(),
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Access-Code",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      const spent = await spentToday(env);
      return json({
        ok: true,
        configured: Boolean(env.ANTHROPIC_API_KEY || env.MOCK),
        needsCode: Boolean(env.ACCESS_CODE),
        model: env.MODEL,
        capReached: spent >= Number(env.DAILY_CAP_CENTS),
      });
    }
    if (request.method !== "POST") return json({ error: "Not found" }, 404);

    // Guards, cheapest first.
    if (!allowed.includes(origin)) return json({ error: "This page is not allowed to use the gateway." }, 403);
    if (env.ACCESS_CODE && request.headers.get("X-Access-Code") !== env.ACCESS_CODE) return json({ error: "bad_code" }, 401);
    if (!env.ANTHROPIC_API_KEY && !env.MOCK) return json({ error: "The gateway has no Claude API key yet." }, 503);
    const ip = request.headers.get("CF-Connecting-IP") || "local";
    const { success } = await env.RATE_LIMIT.limit({ key: ip });
    if (!success) return json({ error: "Too many requests. Try again in a minute." }, 429);
    const spent = await spentToday(env);
    if (spent >= Number(env.DAILY_CAP_CENTS)) return json({ error: "cap_reached" }, 429);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Expected JSON." }, 400);
    }

    try {
      if (url.pathname === "/interpret") {
        const parsed = InterpretBody.safeParse(body);
        if (!parsed.success) return json({ error: "Bad request", detail: parsed.error.issues }, 400);
        const result = await interpret(env, parsed.data.q, parsed.data.facets);
        return json(result);
      }
      if (url.pathname === "/ask") {
        const parsed = AskBody.safeParse(body);
        if (!parsed.success) return json({ error: "Bad request", detail: parsed.error.issues }, 400);
        const result = await ask(env, parsed.data.question, parsed.data.roster);
        return json(result);
      }
      return json({ error: "Not found" }, 404);
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) return json({ error: "The gateway's Claude API key was rejected." }, 503);
      if (err instanceof Anthropic.RateLimitError) return json({ error: "Claude is busy. Try again in a moment." }, 503);
      if (err instanceof Anthropic.APIError) return json({ error: `Claude error ${err.status}: ${err.message}` }, 502);
      console.error(err);
      return json({ error: "Something went wrong." }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

// ---------------------------------------------------------------- Claude calls

async function interpret(env: Env, q: string, facets: z.infer<typeof FacetsSchema>) {
  if (env.MOCK) return { filters: mockInterpret(q, facets), cost_cents: 0 };
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const response = await client.messages.parse({
    model: env.MODEL,
    max_tokens: 1024,
    // Fast path: no extended thinking, low effort. A filter mapping does not need deliberation.
    thinking: { type: "between_tools" },
    output_config: { effort: "low", format: zodOutputFormat(InterpretOutput) },
    system: [{ type: "text", text: interpretSystem(facets), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: q }],
  });
  const cents = await record(env, response.usage);
  if (response.stop_reason === "refusal" || !response.parsed_output) return { filters: null, cost_cents: cents };
  return { filters: response.parsed_output, cost_cents: cents };
}

async function ask(env: Env, question: string, roster: string) {
  if (env.MOCK) return { ...mockAsk(question, roster), cost_cents: 0 };
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  // The roster is identical on every call, so it is cached for an hour; only the question changes.
  const response = await client.messages.parse({
    model: env.MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: zodOutputFormat(AskOutput) },
    system: [
      { type: "text", text: ASK_SYSTEM },
      { type: "text", text: roster, cache_control: { type: "ephemeral", ttl: "1h" } },
    ],
    messages: [{ role: "user", content: question }],
  });
  const cents = await record(env, response.usage);
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    return { summary: "Claude could not answer that request.", picks: [], cost_cents: cents };
  }
  return { ...response.parsed_output, cost_cents: cents };
}

// ---------------------------------------------------------------- spend tracking

const today = () => new Date().toISOString().slice(0, 10);

async function spentToday(env: Env): Promise<number> {
  const v = await env.SPEND.get("spend:" + today());
  return v ? Number(v) : 0;
}

async function record(env: Env, usage: Anthropic.Usage): Promise<number> {
  const cents =
    ((usage.input_tokens || 0) * PRICE.input +
      (usage.cache_creation_input_tokens || 0) * PRICE.cacheWrite +
      (usage.cache_read_input_tokens || 0) * PRICE.cacheRead +
      (usage.output_tokens || 0) * PRICE.output) /
    1_000_000;
  const key = "spend:" + today();
  const prev = await spentToday(env);
  await env.SPEND.put(key, String(prev + cents), { expirationTtl: 3 * 86400 });
  return Math.round(cents * 100) / 100;
}

// ---------------------------------------------------------------- local-dev mocks

function mockInterpret(q: string, f: z.infer<typeof FacetsSchema>) {
  const s = q.toLowerCase();
  const pick = (list: string[], re: RegExp) => list.filter((v) => re.test(v.toLowerCase()));
  return {
    loc: /bengaluru|bangalore|blr/.test(s) ? pick(f.places, /india\|bengaluru/) : /bay area|\bsf\b/.test(s) ? pick(f.places, /sf bay/) : [],
    cat: /robotic/.test(s) ? pick(f.categories, /robotic/) : [],
    company: [],
    sen: /founder|cxo/.test(s) ? pick(f.seniority, /founder/) : [],
    fn: /\bml\b|machine learning/.test(s) ? pick(f.functions, /ai \/ ml/) : [],
    role: [],
    col: /\biit/.test(s) ? ["g:IIT"] : [],
    edu: [],
    title_contains: null,
    keyword: null,
    understood: "Mock interpretation (local dev).",
  };
}

function mockAsk(question: string, roster: string) {
  const ids = roster.split("\n").slice(0, 5).map((l) => Number(l.split("|")[0].trim())).filter(Number.isFinite);
  return { summary: `Mock answer (local dev) for: ${question}`, picks: ids.map((id) => ({ id, reason: "First rows of the roster." })) };
}
